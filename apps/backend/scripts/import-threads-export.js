#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

import {
    Post,
    PostType,
    PostStatus,
    CommentStatus,
    generateContentHash,
} from '../models/Post.js';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const EXPORT_DIR = path.join(__dirname, 'instagram-museinrose102-2026-01-04-JzumtgsY');
const THREADS_JSON = path.join(EXPORT_DIR, 'your_instagram_activity/threads/threads_and_replies.json');
const MEDIA_BASE = path.join(EXPORT_DIR, 'media');
const PROJECT_ROOT = path.join(__dirname, '../../..');

// Import options - customize as needed
const IMPORT_OPTIONS = {
    storageType: 'relative', // 'relative' or 'absolute' - how to store media paths in DB
    uploadToImgBB: true,    // Set to true to upload images to ImgBB (requires IMGBB_API_KEY)
    linkToAccount: false,      // Set to true to link imported posts to a specific account
    linkedAccountId: undefined, // Which account to link to (if linkToAccount is true)
    userId: undefined,         // Optional: set to track which user imported these posts
    skipDuplicates: true,      // Skip posts that already exist
};

// ImgBB configuration
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const IMGBB_API_URL = 'https://api.imgbb.com/1/upload';

// Image upload tracking - maps uploaded URL to original context
const imageUploadMappings = [];

// Statistics tracking
const stats = {
    total: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    mediaResolved: 0,
    mediaFailed: 0,
    imagesUploaded: 0,
    uploadsFailed: 0,
    startTime: null,
    endTime: null,
};

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Sanitize text to ensure valid UTF-8 and properly handle Vietnamese characters
 * Supports all Vietnamese diacritics: á à ả ã ạ ă ắ ằ ẳ ẵ ặ â ấ ầ ẩ ẫ ậ
 *                                    đ é è ẻ ẽ ẹ ê ế ề ể ễ ệ í ì ỉ ĩ ị
 *                                    ó ò ỏ õ ọ ô ố ồ ổ ỗ ộ ơ ớ ờ ở ỡ ợ
 *                                    ú ù ủ ũ ụ ư ứ ừ ử ữ ự ý ỳ ỷ ỹ ỵ
 */
function sanitizeVietnameseText(text) {
    if (!text) return '';

    // Normalize Unicode using NFC (Canonical Decomposition followed by Canonical Composition)
    // This ensures Vietnamese characters are stored consistently
    let sanitized = text.normalize('NFC');

    // Remove only truly problematic characters (null bytes, control chars) but keep all printable Unicode
    // Preserve Vietnamese characters, emojis, and other Unicode symbols
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return sanitized.trim();
}

/**
 * Upload image to ImgBB and return public URL
 * Tracks relationship between uploaded image and post
 */
async function uploadImageToImgBB(imagePath, postContext) {
    try {
        if (!IMGBB_API_KEY) {
            throw new Error('IMGBB_API_KEY not configured');
        }

        // Read image file
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image not found: ${imagePath}`);
        }

        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');

        // Upload to ImgBB
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', base64Image);

        const response = await axios.post(IMGBB_API_URL, formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 60000,
        });

        if (!response.data.success) {
            throw new Error(`ImgBB upload failed: ${JSON.stringify(response.data)}`);
        }

        const result = response.data.data;
        const uploadedUrl = result.url;

        // Track mapping between uploaded URL and post
        imageUploadMappings.push({
            imageUrl: uploadedUrl,
            originalPath: imagePath,
            postId: postContext.threadsPostId,
            postContent: postContext.content ? postContext.content.substring(0, 100) : '',
            publishedAt: postContext.publishedAt,
            uploadedAt: new Date().toISOString(),
            size: result.size,
            dimensions: `${result.width}x${result.height}`,
        });

        stats.imagesUploaded++;
        return uploadedUrl;
    } catch (error) {
        stats.uploadsFailed++;
        log(`  ⚠️ Failed to upload image: ${error.message}`, 'yellow');
        return null; // Return null to use local path as fallback
    }
}

/**
 * Resolve media file path from URI
 * Searches multiple locations for media files
 */
function resolveMediaPath(relativeUri, baseDir) {
    if (!relativeUri || relativeUri.trim() === '') {
        return null;
    }

    // Extract just the filename
    const filename = path.basename(relativeUri);

    // Try multiple location patterns
    const searchLocations = [
        path.join(baseDir, relativeUri), // Exact URI path
        path.join(baseDir, filename), // Top-level media
        path.join(baseDir, 'posts/202511', filename), // Nov 2025
        path.join(baseDir, 'posts/202512', filename), // Dec 2025
        path.join(baseDir, 'posts/202510', filename), // Oct 2025
        path.join(baseDir, 'profile/202510', filename), // Profile
        path.join(baseDir, 'reels/202510', filename), // Reels
    ];

    // Search for file
    for (const location of searchLocations) {
        if (fs.existsSync(location)) {
            return location;
        }
    }

    return null;
}

/**
 * Determine post type based on media files
 */
function determinePostType(mediaItems) {
    const validMedia = mediaItems.filter((m) => m.uri && m.uri.trim() !== '');

    if (validMedia.length === 0) {
        return PostType.TEXT;
    }

    // Check for video files
    const hasVideo = validMedia.some((m) =>
        /\.(mp4|mov|avi|mkv)$/i.test(m.uri)
    );

    if (hasVideo) {
        return PostType.VIDEO;
    }

    if (validMedia.length > 1) {
        return PostType.CAROUSEL;
    }

    return PostType.IMAGE;
}

/**
 * Extract post ID from media URI
 * Example: "media/18069745118572866.webp" → "18069745118572866"
 */
function extractPostId(uri) {
    if (!uri) return null;
    const match = uri.match(/\/(\d+)\.\w+$/);
    return match ? match[1] : null;
}

/**
 * Categorize media items into images and videos
 * Handles path storage type (relative vs absolute)
 * Optionally uploads images to ImgBB with post context tracking
 */
async function categorizeMedia(mediaItems, baseDir, postContext) {
    const images = [];
    const videos = [];
    let failedCount = 0;

    for (const item of mediaItems) {
        if (!item.uri || item.uri.trim() === '') {
            return;
        }

        const absolutePath = resolveMediaPath(item.uri, baseDir);

        if (!absolutePath) {
            failedCount++;
            log(
                `Media not found: ${item.uri}`,
                'yellow'
            );
            return;
        }

        stats.mediaResolved++;

        // For images: upload to ImgBB if enabled, otherwise use local path
        if (/\.(jpg|jpeg|png|webp|gif)$/i.test(item.uri)) {
            let finalPath = absolutePath;

            // Upload to ImgBB if enabled
            if (IMPORT_OPTIONS.uploadToImgBB && IMGBB_API_KEY) {
                const uploadedUrl = await uploadImageToImgBB(absolutePath, postContext);
                if (uploadedUrl) {
                    finalPath = uploadedUrl; // Use ImgBB URL
                } else {
                    // Fallback to local path if upload fails
                    finalPath = IMPORT_OPTIONS.storageType === 'relative'
                        ? path.relative(PROJECT_ROOT, absolutePath)
                        : absolutePath;
                }
            } else {
                // Use local path based on storage configuration
                finalPath = IMPORT_OPTIONS.storageType === 'relative'
                    ? path.relative(PROJECT_ROOT, absolutePath)
                    : absolutePath;
            }

            images.push(finalPath);
        } else if (/\.(mp4|mov|avi|mkv)$/i.test(item.uri)) {
            // Videos: always use local path (Threads API requires public URLs for videos)
            const storagePath = IMPORT_OPTIONS.storageType === 'relative'
                ? path.relative(PROJECT_ROOT, absolutePath)
                : absolutePath;
            videos.push(storagePath);
        }
    }

    stats.mediaFailed += failedCount;
    return { images, videos };
}

/**
 * Build a Post document from raw thread data
 * Handles Vietnamese characters and uploads images to ImgBB if enabled
 */
async function buildPostDocument(threadData, baseDir) {
    const {
        title,
        creation_timestamp,
        media = [],
    } = threadData;

    // Sanitize Vietnamese content
    const sanitizedTitle = sanitizeVietnameseText(title);

    // Skip empty posts
    const hasContent = sanitizedTitle && sanitizedTitle.length > 0;
    const hasMedia = media.filter((m) => m.uri && m.uri.trim()).length > 0;

    if (!hasContent && !hasMedia) {
        return null;
    }

    // Extract post ID early for context
    let threadsPostId = null;
    if (media.length > 0 && media[0].uri) {
        threadsPostId = extractPostId(media[0].uri);
    }

    // Convert Unix timestamp (seconds) to milliseconds
    const publishedAt = new Date(creation_timestamp * 1000);

    // Create post context for image upload tracking
    const postContext = {
        threadsPostId,
        content: sanitizedTitle,
        publishedAt,
    };

    // Resolve media files (with optional ImgBB upload)
    const { images, videos } = await categorizeMedia(media, baseDir, postContext);

    // Determine post type
    const postType = determinePostType(media);

    // Generate content hash for duplicate detection
    const contentHash = generateContentHash(sanitizedTitle || '', images, videos[0]);

    // Create Post document with sanitized Vietnamese text
    const post = new Post({
        content: sanitizedTitle || '[Media-only post]',
        status: PostStatus.PUBLISHED,
        postType,
        imageUrls: images,
        videoUrl: videos.length > 0 ? videos[0] : undefined,
        publishedAt,
        threadsPostId,
        contentHash,
        commentStatus: CommentStatus.NONE,
        // Account linking - only if explicitly configured
        ...(IMPORT_OPTIONS.linkToAccount && {
            threadsAccountId: IMPORT_OPTIONS.linkedAccountId,
        }),
        ...(IMPORT_OPTIONS.userId && {
            userId: IMPORT_OPTIONS.userId,
        }),
        // Tracking metadata
        topic: 'Imported from Threads Export',
    });

    return post;
}

/**
 * Check if post already exists and handle duplicates
 */
async function checkAndImportPost(post) {
    if (!post) {
        return { skipped: true, reason: 'empty' };
    }

    try {
        // Check if post with same threadsPostId and timestamp already exists
        if (post.threadsPostId) {
            const existing = await Post.findOne({
                threadsPostId: post.threadsPostId,
            });

            if (existing) {
                return { skipped: true, reason: 'duplicate-id' };
            }
        }

        // Check for content duplicates within ±1 hour
        if (post.contentHash) {
            const oneHour = 3600000;
            const contentDupe = await Post.findOne({
                contentHash: post.contentHash,
                publishedAt: {
                    $gte: new Date(post.publishedAt.getTime() - oneHour),
                    $lte: new Date(post.publishedAt.getTime() + oneHour),
                },
            });

            if (contentDupe) {
                return { skipped: true, reason: 'duplicate-content' };
            }
        }

        // Save the post
        const saved = await post.save();
        return { success: true, id: saved._id };
    } catch (error) {
        throw new Error(`Import failed: ${error.message}`);
    }
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format elapsed time
 */
function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

/**
 * Main import function
 */
async function main() {
    try {
        stats.startTime = Date.now();

        // Validate paths
        log('\nValidating paths...', 'cyan');
        if (!fs.existsSync(THREADS_JSON)) {
            throw new Error(`threads_and_replies.json not found at ${THREADS_JSON}`);
        }
        log('threads_and_replies.json found', 'green');

        if (!fs.existsSync(MEDIA_BASE)) {
            log('Media folder not found - continuing with text-only posts', 'yellow');
        } else {
            log('Media folder found', 'green');
        }

        // Connect to database
        log('\nConnecting to MongoDB...', 'cyan');
        await connectDatabase();
        log('Connected to MongoDB', 'green');

        // Log import configuration
        log('\nImport Configuration:', 'cyan');
        log(`  Storage Type:      ${IMPORT_OPTIONS.storageType}`, 'dim');
        log(`  Upload to ImgBB:   ${IMPORT_OPTIONS.uploadToImgBB}`, 'dim');
        if (IMPORT_OPTIONS.uploadToImgBB) {
            log(`  ImgBB API Key:     ${IMGBB_API_KEY ? '✓ Configured' : '✗ Missing'}`, IMGBB_API_KEY ? 'green' : 'red');
        }
        log(`  Link to Account:   ${IMPORT_OPTIONS.linkToAccount}`, 'dim');
        log(`  Skip Duplicates:   ${IMPORT_OPTIONS.skipDuplicates}`, 'dim');

        // Read threads data with explicit UTF-8 encoding
        log('\nReading threads data...', 'cyan');
        const jsonContent = fs.readFileSync(THREADS_JSON, { encoding: 'utf8' });

        let data;
        try {
            data = JSON.parse(jsonContent);
        } catch (parseError) {
            log('\n❌ JSON parsing failed', 'red');
            log('Error: ' + parseError.message, 'red');
            log('\nFirst 100 chars of file:', 'yellow');
            console.log(jsonContent.substring(0, 100));
            throw new Error('Failed to parse JSON. Ensure file is UTF-8 encoded.');
        }
        const posts = data.text_post_app_text_posts || [];

        stats.total = posts.length;
        log(`Found ${stats.total} posts to import`, 'green');

        // Import posts
        log('\nStarting import process...', 'cyan');
        log(`Processing ${stats.total} posts\n`, 'bright');

        for (let index = 0; index < posts.length; index++) {
            const progress = ((index + 1) / stats.total * 100).toFixed(1);
            process.stdout.write(
                `\r[${index + 1}/${stats.total}] ${progress}% - Imported: ${stats.imported}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`
            );

            try {
                const threadData = posts[index];

                // Build post document
                const post = await buildPostDocument(threadData, MEDIA_BASE);

                if (!post) {
                    stats.skipped++;
                    continue;
                }

                // Check and import
                const result = await checkAndImportPost(post);

                if (result.success) {
                    stats.imported++;
                } else if (result.skipped) {
                    stats.skipped++;
                }
            } catch (error) {
                stats.failed++;
                // Log detailed error for first few failures
                if (stats.failed <= 5) {
                    log(`\nError at post ${index + 1}: ${error.message}`, 'red');
                }
            }
        }

        // Print summary
        stats.endTime = Date.now();
        const elapsedMs = stats.endTime - stats.startTime;
        const elapsedTime = formatTime(elapsedMs);

        log('\n\n' + '='.repeat(70), 'bright');
        log('IMPORT SUMMARY', 'bright');
        log('='.repeat(70), 'bright');
        log(`Total Posts:     ${stats.total}`, 'cyan');
        log(`Imported:        ${stats.imported} (${(stats.imported / stats.total * 100).toFixed(1)}%)`, 'green');
        log(`Skipped:         ${stats.skipped} (${(stats.skipped / stats.total * 100).toFixed(1)}%)`, 'yellow');
        log(`Failed:          ${stats.failed} (${(stats.failed / stats.total * 100).toFixed(1)}%)`, 'red');
        log('', 'reset');
        log(`Media Resolved:  ${stats.mediaResolved}`, 'blue');
        log(`Media Failed:    ${stats.mediaFailed}`, 'red');
        if (IMPORT_OPTIONS.uploadToImgBB) {
            log(`Images Uploaded: ${stats.imagesUploaded}`, 'green');
            log(`Upload Failed:   ${stats.uploadsFailed}`, 'red');
        }
        log('', 'reset');
        log(`Elapsed Time:    ${elapsedTime}`, 'cyan');
        log(`Speed:           ${Math.round(stats.total / (elapsedMs / 1000))} posts/sec`, 'magenta');
        log('='.repeat(70), 'bright');

        // Save image upload mappings if any
        if (imageUploadMappings.length > 0) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const mappingFile = path.join(__dirname, `imgbb-mappings-${timestamp}.json`);
            fs.writeFileSync(mappingFile, JSON.stringify(imageUploadMappings, null, 2), 'utf8');
            log('\n📋 Image-Post Mappings:', 'cyan');
            log(`   Saved ${imageUploadMappings.length} mappings to:`, 'green');
            log(`   ${mappingFile}`, 'dim');
        }

        // Success exit
        process.exit(stats.failed === 0 ? 0 : 1);
    } catch (error) {
        log('\n\nFATAL ERROR', 'red');
        log(error.message, 'red');
        log('\nStack trace:', 'dim');
        console.error(error);
        process.exit(1);
    }
}

// Run the script
main();
