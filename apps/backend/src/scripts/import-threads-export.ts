#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDatabase } from "../config/database.js";
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

// Type definitions
interface ImportOptions {
    storageType: 'relative' | 'absolute';
    linkToAccount: boolean;
    linkedAccountId?: string;
    userId?: string;
    skipDuplicates: boolean;
}

interface ThreadData {
    title?: string;
    creation_timestamp: number;
    media?: Array<{ uri: string; creation_timestamp?: number; title?: string }>;
}

interface ThreadsExport {
    text_post_app_text_posts: ThreadData[];
}

interface MediaCategorization {
    images: string[];
    videos: string[];
}

interface CheckImportResult {
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    id?: string;
}

interface Stats {
    total: number;
    imported: number;
    skipped: number;
    skippedNoLinks: number;  // Posts skipped - missing link AND/OR image
    skippedMissingBoth: number;  // Missing both link and image
    skippedMissingLink: number;  // Has image but no link
    skippedMissingImage: number;  // Has link but no image
    failed: number;
    mediaResolved: number;
    mediaFailed: number;
    startTime: number | null;
    endTime: number | null;
}

interface ColorMap {
    [key: string]: string;
}

// Import options - customize as needed
const IMPORT_OPTIONS: ImportOptions = {
    storageType: 'relative', // 'relative' or 'absolute' - how to store media paths in DB
    linkToAccount: false,      // Set to true to link imported posts to a specific account
    linkedAccountId: undefined, // Which account to link to (if linkToAccount is true)
    userId: undefined,         // Optional: set to track which user imported these posts
    skipDuplicates: true,      // Skip posts that already exist
};

// Statistics tracking
const stats: Stats = {
    total: 0,
    imported: 0,
    skipped: 0,
    skippedNoLinks: 0,  // Total skipped due to validation
    skippedMissingBoth: 0,  // Missing both
    skippedMissingLink: 0,  // No link
    skippedMissingImage: 0,  // No image
    failed: 0,
    mediaResolved: 0,
    mediaFailed: 0,
    startTime: null,
    endTime: null,
};

// Color codes for console output
const colors: ColorMap = {
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

function log(message: string, color: string = 'reset'): void {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Fix Vietnamese text that was stored with UTF-8 double-encoding
 * Converts mojibake like "Kiá»u nÃ y cÅ©ng xinhhh" back to "Kiểu này cũng xinhhh"
 * Also fixes emojis: "\u00f0\u009f\u0091\u0097" → "👗"
 * 
 * The JSON has UTF-8 bytes stored as Latin-1 Unicode escape sequences.
 * After JSON.parse(), we have characters that represent UTF-8 bytes.
 * We re-encode as Latin-1 to get the original bytes, then decode as UTF-8.
 */
function fixVietnameseEncoding(text: string): string {
    if (!text) return text;

    try {
        const buffer = Buffer.from(text, 'latin1');
        const fixed = buffer.toString('utf8');
        return fixed;
    } catch (error) {
        // If conversion fails, return original
        return text;
    }
}
function resolveMediaPath(relativeUri: string, baseDir: string): string | null {
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
function determinePostType(mediaItems: ThreadData['media']): PostType {
    const validMedia = (mediaItems || []).filter((m) => m.uri && m.uri.trim() !== '');

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
function extractPostId(uri: string | null | undefined): string | null {
    if (!uri) return null;
    const match = uri.match(/\/(\d+)\.\w+$/);
    return match ? match[1] : null;
}

/**
 * Categorize media items into images and videos
 * Handles path storage type (relative vs absolute)
 */
function categorizeMedia(mediaItems: ThreadData['media'], baseDir: string): MediaCategorization {
    const images: string[] = [];
    const videos: string[] = [];
    let failedCount = 0;

    (mediaItems || []).forEach((item) => {
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

        // Determine media type and store path based on configuration
        const storagePath = IMPORT_OPTIONS.storageType === 'relative'
            ? path.relative(PROJECT_ROOT, absolutePath)
            : absolutePath;

        if (/\.(mp4|mov|avi|mkv)$/i.test(item.uri)) {
            videos.push(storagePath);
        } else if (/\.(jpg|jpeg|png|webp|gif)$/i.test(item.uri)) {
            images.push(storagePath);
        }
    });

    stats.mediaFailed += failedCount;
    return { images, videos };
}

/**
 * Build a global map of Shopee links to image timestamps
 * This handles the case where link posts and image posts are SEPARATE entries
 * 
 * Strategy:
 * - Link posts have empty uri and Shopee URL in title
 * - Image posts are posted FIRST, link posts come shortly AFTER (within ~90 seconds)
 * - Match by finding the CLOSEST link timestamp to each image timestamp
 * - CRITICAL: Only posts with Shopee links will be imported
 */
function buildGlobalLinkMap(posts: ThreadData[]): Map<number, string[]> {
    const linkMap = new Map<number, string[]>(); // timestamp -> links[]
    const linkPosts: Array<{ link: string; timestamp: number; index: number }> = [];

    // First pass: collect all link-only posts with their array position
    posts.forEach((post, index) => {
        const media = post.media || [];

        // Check if this is a link-only post (empty uri, link in title)
        media.forEach((item) => {
            if (!item.uri || item.uri.trim() === '') {
                if (item.title && typeof item.title === 'string') {
                    // Extract full title including emojis and prefix text (e.g., "👗nè https://s.shopee.vn/...")
                    // Rather than just the URL, preserve the complete link text
                    const shopeeUrl = item.title.match(/https:\/\/s\.shopee\.vn\/[^\s]+/);
                    if (shopeeUrl && item.creation_timestamp) {
                        // Store full title text if it contains meaningful content (emojis, text)
                        // Otherwise just the URL
                        const fullText = item.title.trim();
                        const linkText = fullText.length > shopeeUrl[0].length ? fullText : shopeeUrl[0];

                        linkPosts.push({
                            link: linkText,  // Store full text with emoji/prefix
                            timestamp: item.creation_timestamp,
                            index,
                        });
                    }
                }
            }
        });
    });

    log(`  Found ${linkPosts.length} Shopee link posts`, 'dim');

    // Second pass: map links to image posts by CLOSEST timestamp proximity
    posts.forEach((post, postIndex) => {
        const media = post.media || [];

        // Get image timestamps from this post (all images in a carousel have same timestamp)
        const imageTimestamps = media
            .filter((m) => m.uri && m.uri.trim() !== '') // Has valid uri = image/video
            .map((m) => m.creation_timestamp)
            .filter((t) => t !== undefined) as number[];

        if (imageTimestamps.length === 0) return;

        // Use first image timestamp as representative (all images in post have same timestamp)
        const imgTimestamp = imageTimestamps[0];

        // Find the CLOSEST link post to this image timestamp
        // Typically: image posted first (lower timestamp), link posted after (higher timestamp)
        // Example: image=1767517508, link=1767517597 (89 seconds later)
        let closestLink: { link: string; timestamp: number; index: number } | null = null;
        let minTimeDiff = Infinity;

        linkPosts.forEach((lp) => {
            // Calculate absolute time difference
            const timeDiff = Math.abs(lp.timestamp - imgTimestamp);

            // Prefer links that come AFTER images (positive difference) within 5 minutes
            // OR links before images (within 1 minute) - allows for timestamp variations
            const isValidMatch =
                (lp.timestamp >= imgTimestamp && timeDiff <= 300) || // Link after image, within 5 min
                (lp.timestamp < imgTimestamp && timeDiff <= 60);     // Link before image, within 1 min

            if (isValidMatch && timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestLink = lp;
            }
        });

        if (closestLink) {
            const existingLinks = linkMap.get(imgTimestamp) || [];
            // Avoid duplicates
            if (!existingLinks.includes(closestLink.link)) {
                linkMap.set(imgTimestamp, [...existingLinks, closestLink.link]);
            }
        }
    });

    return linkMap;
}

/**
 * Build a Post document from raw thread data
 */
async function buildPostDocument(
    threadData: ThreadData,
    baseDir: string,
    linkMap: Map<number, string[]>
): Promise<any | null> {
    // IMPORTANT: Extract from post-level fields, NOT media item fields
    const {
        title: postTitle,  // This is the POST-level title (main content)
        creation_timestamp,
        media = [],
    } = threadData;

    // Skip empty posts
    const hasContent = postTitle && postTitle.trim().length > 0;
    const hasMedia = (media || []).filter((m) => m.uri && m.uri.trim()).length > 0;

    if (!hasContent && !hasMedia) {
        return null;
    }

    // Resolve media files
    const { images, videos } = categorizeMedia(media, baseDir);

    // Determine post type
    const postType = determinePostType(media);

    // Extract post ID from first media item
    let threadsPostId: string | null = null;
    if (media && media.length > 0 && media[0].uri) {
        threadsPostId = extractPostId(media[0].uri);
    }

    // =====================================================================
    // CRITICAL VALIDATION RULES (HIGHEST PRIORITY):
    // 1. Post MUST have BOTH Shopee affiliate link AND image
    // 2. If EITHER is missing → SKIP the post entirely
    // 3. No exceptions - this is the PRIMARY decision criteria
    // =====================================================================

    // Check #1: Validate media exists (images/videos)
    const hasValidMedia = hasMedia && (media || []).some(m => m.uri && m.uri.trim() !== '');

    // Check #2: Get Shopee links from the global link map
    const imageTimestamps = (media || [])
        .filter((m) => m.uri && m.uri.trim() !== '')
        .map((m) => m.creation_timestamp)
        .filter((t) => t !== undefined) as number[];

    const allLinks: string[] = [];
    imageTimestamps.forEach((timestamp) => {
        const links = linkMap.get(timestamp);
        if (links) {
            allLinks.push(...links);
        }
    });
    const hasShopeeLinks = allLinks.length > 0;

    // ⚠️ STRICT VALIDATION: Both conditions must be true
    if (!hasValidMedia || !hasShopeeLinks) {
        // Return null with tracking marker for statistics
        return {
            skipped: true,
            missingBoth: !hasValidMedia && !hasShopeeLinks,
            missingLink: hasValidMedia && !hasShopeeLinks,
            missingImage: !hasValidMedia && hasShopeeLinks,
        } as any;
    }

    // At this point: post has BOTH image AND Shopee link ✅

    // Build content: Use POST-LEVEL title, not media titles
    let contentText = (postTitle || '').trim();

    // Store Shopee links in comment field
    const uniqueLinks = [...new Set(allLinks)];
    const commentText = uniqueLinks.join('\n');

    // If no content but has media, add placeholder
    if (!contentText && hasMedia) {
        contentText = '[Media post]';
    }

    // Generate content hash for duplicate detection
    const contentHash = generateContentHash(contentText, images, videos[0]);

    // Convert Unix timestamp (seconds) to milliseconds
    // Validate timestamp: must be a positive number
    let publishedAt = new Date();
    if (creation_timestamp && typeof creation_timestamp === 'number' && creation_timestamp > 0) {
        const candidateDate = new Date(creation_timestamp * 1000);
        // Verify the date is valid (not NaN)
        if (!isNaN(candidateDate.getTime())) {
            publishedAt = candidateDate;
        }
    }

    // Build post data object
    // Preserve exact content: don't add defaults like [Media-only post]
    // Ensure Vietnamese text and EMOJIS are preserved correctly
    const postData: any = {
        content: contentText,
        status: PostStatus.PUBLISHED,
        postType,
        imageUrls: images,
        videoUrl: videos.length > 0 ? videos[0] : undefined,
        publishedAt,
        threadsPostId,
        contentHash,
        commentStatus: commentText ? CommentStatus.POSTED : CommentStatus.NONE,
        comment: commentText || undefined,  // Store Shopee links in comment field
        topic: 'Imported from Threads Export',
    };

    // Add optional account linking if configured
    if (IMPORT_OPTIONS.linkToAccount && IMPORT_OPTIONS.linkedAccountId) {
        postData.threadsAccountId = IMPORT_OPTIONS.linkedAccountId;
    }

    // Add optional user tracking if configured
    if (IMPORT_OPTIONS.userId) {
        postData.userId = IMPORT_OPTIONS.userId;
    }

    // Create Post document
    const post = new Post(postData);

    return post;
}

/**
 * Check if post already exists and handle duplicates
 */
async function checkAndImportPost(post: any): Promise<CheckImportResult> {
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
        if (post.contentHash && post.publishedAt) {
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
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Import failed: ${errorMessage}`);
    }
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format elapsed time
 */
function formatTime(ms: number): string {
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
async function main(): Promise<void> {
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
        log(`  Link to Account:   ${IMPORT_OPTIONS.linkToAccount}`, 'dim');
        log(`  Skip Duplicates:   ${IMPORT_OPTIONS.skipDuplicates}`, 'dim');

        // Read threads data
        log('\nReading threads data...', 'cyan');

        // Read JSON file directly as UTF-8
        // Any mojibake (corrupted Vietnamese) will be fixed by fixVietnameseEncoding() after parsing
        const jsonContent = fs.readFileSync(THREADS_JSON, 'utf-8');
        const data: ThreadsExport = JSON.parse(jsonContent);
        let posts = data.text_post_app_text_posts || [];

        // Fix Vietnamese encoding in ALL posts
        // The JSON has UTF-8 bytes stored as Latin-1 escape sequences (\uXXXX)
        // After JSON.parse, we need to re-encode as Latin-1 bytes then decode as UTF-8
        // This fixes BOTH Vietnamese text AND emojis (e.g., \u00f0\u009f\u0091\u0097 → 👗)
        posts = posts.map(post => ({
            ...post,
            title: post.title ? fixVietnameseEncoding(post.title) : post.title,
            media: (post.media || []).map(m => ({
                ...m,
                title: m.title ? fixVietnameseEncoding(m.title) : m.title,
            }))
        }));

        // Debug: Check first few posts for emojis
        if (posts.length > 0) {
            const firstWithTitle = posts.find(p => p.title);
            if (firstWithTitle) {
                log(`First post with title: "${firstWithTitle.title}"`, 'dim');
            }
        }

        stats.total = posts.length;
        log(`Found ${stats.total} posts to import`, 'green');

        // PHASE 1: Build link-to-image mapping across ALL posts
        log('\nPhase 1: Building Shopee link mappings...', 'cyan');
        const linkMap = buildGlobalLinkMap(posts);
        log(`  Created ${linkMap.size} timestamp-to-link mappings`, 'green');
        log('  Strategy: Match by CLOSEST timestamp proximity', 'dim');
        log('  Posts WITHOUT Shopee links will be SKIPPED', 'yellow');

        // Import posts
        log('\nPhase 2: Starting import process...', 'cyan');
        log(`Processing ${stats.total} posts\n`, 'bright');

        for (let index = 0; index < posts.length; index++) {
            const progress = ((index + 1) / stats.total * 100).toFixed(1);
            process.stdout.write(
                `\r[${index + 1}/${stats.total}] ${progress}% - Imported: ${stats.imported}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`
            );

            try {
                const threadData = posts[index];

                // Build post document with global link mapping
                const post = await buildPostDocument(threadData, MEDIA_BASE, linkMap);

                if (!post) {
                    stats.skipped++;
                    continue;
                }

                // Handle skipped posts with validation tracking
                if ((post as any).skipped) {
                    stats.skipped++;
                    stats.skippedNoLinks++;

                    if ((post as any).missingBoth) {
                        stats.skippedMissingBoth++;
                    } else if ((post as any).missingLink) {
                        stats.skippedMissingLink++;
                    } else if ((post as any).missingImage) {
                        stats.skippedMissingImage++;
                    }
                    continue;
                }

                // Check and import
                const result = await checkAndImportPost(post);

                if (result.success) {
                    stats.imported++;
                } else if (result.skipped) {
                    stats.skipped++;
                }
            } catch (error: unknown) {
                stats.failed++;
                // Log detailed error for first few failures
                if (stats.failed <= 5) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    log(`\nError at post ${index + 1}: ${errorMessage}`, 'red');
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
        log(`  ⚠️  Missing Link/Image: ${stats.skippedNoLinks}`, 'yellow');
        log(`      - Missing BOTH:       ${stats.skippedMissingBoth}`, 'dim');
        log(`      - Missing Link only:  ${stats.skippedMissingLink}`, 'dim');
        log(`      - Missing Image only: ${stats.skippedMissingImage}`, 'dim');
        log(`  📋 Duplicates/Other:    ${stats.skipped - stats.skippedNoLinks}`, 'dim');
        log(`Failed:          ${stats.failed} (${(stats.failed / stats.total * 100).toFixed(1)}%)`, 'red');
        log('', 'reset');
        log(`Media Resolved:  ${stats.mediaResolved}`, 'blue');
        log(`Media Failed:    ${stats.mediaFailed}`, 'red');
        log('', 'reset');
        log(`Elapsed Time:    ${elapsedTime}`, 'cyan');
        log(`Speed:           ${Math.round(stats.total / (elapsedMs / 1000))} posts/sec`, 'magenta');
        log('', 'reset');
        log('✅ VALIDATION RULE: Posts MUST have BOTH Shopee link AND image', 'green');
        log('='.repeat(70), 'bright');

        // Success exit
        process.exit(stats.failed === 0 ? 0 : 1);
    } catch (error: unknown) {
        log('\n\nFATAL ERROR', 'red');
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(errorMessage, 'red');
        log('\nStack trace:', 'dim');
        if (error instanceof Error) {
            console.error(error);
        }
        process.exit(1);
    }
}

// Run the script
main();
