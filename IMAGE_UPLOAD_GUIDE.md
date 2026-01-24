# Image Upload & Vietnamese Character Handling Guide

## Overview

This guide covers:
1. **ImgBB Image Upload Integration** - Automatically upload local images to ImgBB CDN
2. **Vietnamese Character Support** - Full support for all 134 Vietnamese characters
3. **Image-Post Mapping** - Track which images belong to which posts

---

## 1. ImgBB Integration

### Why ImgBB?

Threads API **only accepts publicly accessible URLs** for images and videos. Local file paths cannot be used directly. ImgBB provides:
- Free API with generous limits
- Fast CDN delivery
- Reliable uptime
- Simple REST API

### Setup

#### Step 1: Get ImgBB API Key

1. Visit [https://api.imgbb.com/](https://api.imgbb.com/)
2. Sign up for a free account
3. Copy your API key

#### Step 2: Configure Environment

Add to your `.env` file:

```bash
IMGBB_API_KEY=your_api_key_here
```

#### Step 3: Enable Upload in Import Script

Edit `apps/backend/scripts/import-threads-export.js`:

```javascript
const IMPORT_OPTIONS = {
    storageType: 'relative',
    uploadToImgBB: true,  // ✅ Set to true
    linkToAccount: false,
    linkedAccountId: undefined,
    userId: undefined,
    skipDuplicates: true,
};
```

---

## 2. Usage

### Automatic Upload During Import

When importing posts with `uploadToImgBB: true`:

```bash
# Run import with ImgBB upload enabled
npm run import:threads
```

**What happens:**
1. Script reads local image files from export
2. Uploads each image to ImgBB
3. Stores ImgBB URL in MongoDB (instead of local path)
4. Saves image-post mapping to `imgbb-mappings-TIMESTAMP.json`

### Manual Upload Script

Upload individual images with post context:

```bash
# Single image
node apps/backend/scripts/upload-images-to-imgbb.js ./image.jpg

# With post context
node apps/backend/scripts/upload-images-to-imgbb.js ./image.jpg POST123 "Product review"

# Remote URL
node apps/backend/scripts/upload-images-to-imgbb.js https://example.com/image.jpg POST123

# Batch upload
node apps/backend/scripts/upload-images-to-imgbb.js --batch ./mappings.json
```

### Batch Upload Format

Create a JSON file with image-post mappings:

```json
[
  {
    "path": "./media/image1.jpg",
    "postId": "18069745118572866",
    "postContent": "Kiểu này cũng xinhhh 👗"
  },
  {
    "path": "https://example.com/image2.jpg",
    "postId": "18069745118572867",
    "postContent": "Sản phẩm chất lượng"
  }
]
```

Run batch upload:

```bash
node apps/backend/scripts/upload-images-to-imgbb.js --batch ./image-mappings.json
```

---

## 3. Image-Post Mapping

### Tracking Relationships

Every uploaded image is tracked with its post context:

```javascript
{
  "imageUrl": "https://i.ibb.co/abc123/image.jpg",
  "originalPath": "/absolute/path/to/image.jpg",
  "postId": "18069745118572866",
  "postContent": "Kiểu này cũng xinhhh 👗",
  "publishedAt": "2025-11-15T10:30:00.000Z",
  "uploadedAt": "2026-01-24T08:15:30.000Z",
  "size": 245678,
  "dimensions": "1080x1080"
}
```

### Accessing Mappings

#### In Code (ImageUploadService)

```typescript
import { imageUploadService } from './services/ImageUploadService.js';

// Get all images for a specific post
const postImages = imageUploadService.getImagesForPost('POST123');

// Get post context for an uploaded image
const mapping = imageUploadService.getImageMapping('https://i.ibb.co/abc123/image.jpg');

// Export all mappings to JSON
const allMappings = imageUploadService.exportMappings();

// Save mappings to file
imageUploadService.saveMappingsToFile('./mappings.json');

// Load mappings from file
imageUploadService.loadMappingsFromFile('./mappings.json');
```

#### From Import Script

After import completes, mappings are automatically saved to:

```
apps/backend/scripts/imgbb-mappings-2026-01-24T08-15-30.json
```

You can easily identify:
- Which images belong to which posts
- Original local file paths
- Upload timestamps and metadata

---

## 4. Vietnamese Character Support

### Supported Characters (134 total)

#### Basic Vowels with Tones
- **á à ả ã ạ** (a with tones)
- **é è ẻ ẽ ẹ** (e with tones)
- **í ì ỉ ĩ ị** (i with tones)
- **ó ò ỏ õ ọ** (o with tones)
- **ú ù ủ ũ ụ** (u with tones)
- **ý ỳ ỷ ỹ ỵ** (y with tones)

#### Special Vowel Combinations
- **ă ắ ằ ẳ ẵ ặ** (a with breve)
- **â ấ ầ ẩ ẫ ậ** (a with circumflex)
- **ê ế ề ể ễ ệ** (e with circumflex)
- **ô ố ồ ổ ỗ ộ** (o with circumflex)
- **ơ ớ ờ ở ỡ ợ** (o with horn)
- **ư ứ ừ ử ữ ự** (u with horn)

#### Special Letter
- **đ Đ** (d with stroke)

#### All Uppercase Variants
- **Á À Ả Ã Ạ, Ă Ắ Ằ Ẳ Ẵ Ặ, Â Ấ Ầ Ẩ Ẫ Ậ**
- **É È Ẻ Ẽ Ẹ, Ê Ế Ề Ể Ễ Ệ**
- **Í Ì Ỉ Ĩ Ị**
- **Ó Ò Ỏ Õ Ọ, Ô Ố Ồ Ổ Ỗ Ộ, Ơ Ớ Ờ Ở Ỡ Ợ**
- **Ú Ù Ủ Ũ Ụ, Ư Ứ Ừ Ử Ữ Ự**
- **Ý Ỳ Ỷ Ỹ Ỵ**

### Implementation

#### Character Sanitization

The `sanitizeVietnameseText()` function:
- Normalizes Unicode using **NFC** (Canonical Composition)
- Preserves all Vietnamese diacritics
- Removes only control characters (null bytes, etc.)
- Keeps emojis and special symbols

```javascript
function sanitizeVietnameseText(text) {
    if (!text) return '';
    
    // Normalize Unicode (NFC)
    let sanitized = text.normalize('NFC');
    
    // Remove only control characters, keep all printable Unicode
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    return sanitized.trim();
}
```

#### UTF-8 Encoding

Import script explicitly uses UTF-8:

```javascript
// Explicit UTF-8 encoding
const jsonContent = fs.readFileSync(THREADS_JSON, { encoding: 'utf8' });
```

### Testing

Run the Vietnamese character encoding test:

```bash
node apps/backend/scripts/test-vietnamese-encoding.js
```

This tests:
- All 134 Vietnamese characters
- Real-world post content
- Mixed case (uppercase/lowercase)
- Emojis and special symbols
- MongoDB round-trip (save → retrieve → verify)

Expected output:

```
==============================================
VIETNAMESE CHARACTER ENCODING TEST
==============================================

📡 Connecting to MongoDB...
✅ Connected successfully

Test 1/15: Basic vowel tones
Original: "Vowels: á à ả ã ạ é è ẻ ẽ ẹ í ì ỉ ĩ ị..."
  ✅ Saved with ID: 679abc123...
Retrieved: "Vowels: á à ả ã ạ é è ẻ ẽ ẹ í ì ỉ ĩ ị..."
  ✅ Content matches perfectly!
  🗑️  Test post deleted

...

==============================================
TEST SUMMARY
==============================================
Total tests:  15
Passed:       15 ✅
Failed:       0 ❌
==============================================

🎉 All Vietnamese character encoding tests passed!
✅ Your database is properly configured for Vietnamese text.
```

---

## 5. Troubleshooting

### ImgBB Upload Issues

**Problem:** Upload fails with "API key not configured"
```
Solution: Set IMGBB_API_KEY in .env file
```

**Problem:** Upload timeout
```
Solution: Check your internet connection and image file size
         ImgBB has a 32MB limit per image
```

**Problem:** Invalid base64 format
```
Solution: Ensure data URIs are properly formatted:
         data:image/jpeg;base64,/9j/4AAQSkZJRg...
```

### Vietnamese Character Issues

**Problem:** Characters display as � or ?
```
Solution: 
1. Verify JSON file is UTF-8 encoded (not UTF-16 or ANSI)
2. Run test: node apps/backend/scripts/test-vietnamese-encoding.js
3. Check MongoDB connection settings
```

**Problem:** Tones or diacritics missing
```
Solution:
1. Ensure text is normalized with NFC
2. Use sanitizeVietnameseText() function
3. Check source file encoding
```

**Problem:** Mixed encoding in database
```
Solution:
1. Re-import data with explicit UTF-8 encoding
2. Use fix-vietnamese-encoding.ts script if available
3. Verify MongoDB uses UTF-8 collation
```

---

## 6. Architecture

### Import Flow with ImgBB

```
┌─────────────────────┐
│  Threads Export     │
│  JSON + Media Files │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Import Script       │
│ - Read JSON (UTF-8) │
│ - Sanitize text     │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │ For each     │
    │ local image: │
    └──────┬───────┘
           │
           ▼
    ┌──────────────────┐
    │ Upload to ImgBB  │
    │ - Convert base64 │
    │ - POST to API    │
    │ - Get public URL │
    └──────┬───────────┘
           │
           ▼
    ┌──────────────────┐
    │ Track Mapping    │
    │ - Image URL      │
    │ - Post ID        │
    │ - Original path  │
    └──────┬───────────┘
           │
           ▼
┌─────────────────────┐
│ Save to MongoDB     │
│ - Post with URL     │
│ - Vietnamese text   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Export Mappings     │
│ imgbb-mappings.json │
└─────────────────────┘
```

### ThreadsAdapter Flow

```
┌─────────────────┐
│ publishPost()   │
└────────┬────────┘
         │
         ▼
  ┌──────────────┐
  │ Image path?  │
  └──────┬───────┘
         │
    ┌────┴────┐
    │ Local?  │
    └────┬────┘
         │
         ▼ Yes
  ┌─────────────────────┐
  │ ImageUploadService  │
  │ - Upload to ImgBB   │
  │ - Return public URL │
  └──────┬──────────────┘
         │
         ▼
  ┌─────────────────┐
  │ Use URL in      │
  │ Threads API     │
  └─────────────────┘
```

---

## 7. Best Practices

### Image Upload

1. **Always set IMGBB_API_KEY** for production
2. **Use batch upload** for multiple images
3. **Save mappings** for audit trail
4. **Check file size** before upload (32MB limit)
5. **Handle rate limits** (wait between uploads)

### Vietnamese Text

1. **Always use UTF-8 encoding** for JSON files
2. **Normalize with NFC** before saving to DB
3. **Test with real Vietnamese content** before production
4. **Run encoding tests** after DB migrations
5. **Use sanitizeVietnameseText()** for all user input

### Mapping Management

1. **Save mappings after import** for recovery
2. **Include post context** (ID, content) in uploads
3. **Use timestamps** in mapping filenames
4. **Export mappings** before major operations
5. **Load mappings** to resume interrupted imports

---

## 8. API Reference

### ImageUploadService

```typescript
// Upload single image
const result = await imageUploadService.uploadImage(
  imagePath: string,
  postContext?: { postId?: string; postContent?: string }
): Promise<UploadResult>

// Upload multiple images
const results = await imageUploadService.uploadImages(
  images: Array<string | { path, postId, postContent }>
): Promise<UploadResult[]>

// Get mapping for image
const mapping = imageUploadService.getImageMapping(imageUrl: string)

// Get images for post
const images = imageUploadService.getImagesForPost(postId: string)

// Export all mappings
const mappings = imageUploadService.exportMappings()

// Save/load mappings
imageUploadService.saveMappingsToFile(filePath: string)
imageUploadService.loadMappingsFromFile(filePath: string)
```

### Upload Result

```typescript
interface UploadResult {
  success: boolean;
  url?: string;
  deleteUrl?: string;
  size?: number;
  error?: string;
  metadata?: {
    postId?: string;
    originalPath?: string;
    uploadedAt: Date;
  };
}
```

### Image-Post Mapping

```typescript
interface ImagePostMapping {
  imageUrl: string;
  originalPath: string;
  postId?: string;
  postContent?: string;
  uploadedAt: Date;
}
```

---

## Questions?

- **ImgBB API Docs**: https://api.imgbb.com/
- **Unicode Normalization**: https://unicode.org/reports/tr15/
- **Vietnamese Characters**: https://en.wikipedia.org/wiki/Vietnamese_alphabet
