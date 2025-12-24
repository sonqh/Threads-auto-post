import { Router, Request, Response } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { Post, PostType, PostStatus } from "../models/Post.js";
import { schedulePost } from "../queue/postQueue.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Normalize header: lowercase, trim, single spaces
function normalizeHeader(h: string): string {
  return (h || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

// Parse Gộp Link column (comma/semicolon/pipe/newline separated)
function parseMergeLinks(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value)
    .split(/[,;\n\|]+/)
    .map((s) => s.trim())
    .filter((s) => s);
}

// Extract actual cell value from ExcelJS (handles formulas, hyperlinks, etc.)
function extractCellValue(cellValue: any): string | null {
  if (!cellValue) return null;

  // Handle formula objects from ExcelJS
  if (typeof cellValue === "object" && cellValue.formula) {
    return cellValue.result || null;
  }

  // Handle hyperlink objects
  if (typeof cellValue === "object" && cellValue.hyperlink) {
    return cellValue.text || cellValue.hyperlink || null;
  }

  // Handle rich text objects
  if (typeof cellValue === "object" && cellValue.richText) {
    const text = cellValue.richText
      .map((t: any) => (t.text || "").trim())
      .join("")
      .trim();
    return text || null;
  }

  // Regular string/number
  return String(cellValue).trim() || null;
}

// Map user-friendly post type names to PostType enum
function mapPostType(typeRaw: string): PostType | null {
  const normalized = String(typeRaw).toUpperCase().trim();

  // Direct enum match
  if (Object.values(PostType).includes(normalized as PostType)) {
    return normalized as PostType;
  }

  // Alias mapping for user-friendly names
  const typeMap: Record<string, PostType> = {
    "MULTIPLE PHOTOS": PostType.CAROUSEL,
    "MULTI PHOTO": PostType.CAROUSEL,
    PHOTOS: PostType.IMAGE,
    PHOTO: PostType.IMAGE,
    "SINGLE PHOTO": PostType.IMAGE,
    "SINGLE IMAGE": PostType.IMAGE,
    MOVIES: PostType.VIDEO,
    MOVIE: PostType.VIDEO,
    REELS: PostType.VIDEO,
    REEL: PostType.VIDEO,
    STATUS: PostType.TEXT,
  };

  return typeMap[normalized] || null;
}

// Map user-friendly status names to PostStatus enum
function mapPostStatus(statusRaw: string): PostStatus | null {
  const normalized = String(statusRaw).toUpperCase().trim();

  // Direct enum match
  if (Object.values(PostStatus).includes(normalized as PostStatus)) {
    return normalized as PostStatus;
  }

  // Alias mapping for user-friendly names
  const statusMap: Record<string, PostStatus> = {
    DRAFT: PostStatus.DRAFT,
    NHÁP: PostStatus.DRAFT,
    SCHEDULED: PostStatus.SCHEDULED,
    "SCHEDULED FOR POSTING": PostStatus.SCHEDULED,
    "ĐANG CHỜ": PostStatus.SCHEDULED,
    PUBLISHED: PostStatus.PUBLISHED,
    DONE: PostStatus.PUBLISHED,
    "POSTED TO THREADS": PostStatus.PUBLISHED,
    "ĐÃ ĐĂNG": PostStatus.PUBLISHED,
    FAILED: PostStatus.FAILED,
    ERROR: PostStatus.FAILED,
    LỖI: PostStatus.FAILED,
  };

  return statusMap[normalized] || null;
}

const REQUIRED_HEADERS = ["nội dung bài post", "loại bài viết"];
const IMAGE_COLUMNS = Array.from({ length: 10 }, (_, i) => `link ảnh ${i + 1}`);

router.post(
  "/import",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const workbook = new ExcelJS.Workbook();
      console.log("req.file ", req.file.buffer);
      await workbook.xlsx.load(req.file.buffer as any);

      const availableSheets = workbook.worksheets.map((w) => w.name);
      console.log("📄 Available sheets:", availableSheets);

      const sheetName = "Danh Sách Bài Post";
      const worksheet = workbook.getWorksheet(sheetName);

      if (!worksheet) {
        return res.status(400).json({
          error: `Sheet "${sheetName}" not found. Available sheets: ${workbook.worksheets
            .map((w) => w.name)
            .join(", ")}`,
        });
      }

      // Read header row and map column numbers to normalized headers
      const headerRow = worksheet.getRow(1);
      const headerMap: Record<number, string> = {};
      headerRow.eachCell((cell: any, colNumber: number) => {
        const header = normalizeHeader((cell.value as string) || "");
        if (header) {
          headerMap[colNumber] = header;
        }
      });

      // Validate required headers
      const headers = Object.values(headerMap);
      const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        return res
          .status(400)
          .json({ error: `Missing required columns: ${missing.join(", ")}` });
      }

      const posts: any[] = [];
      const errors: any[] = [];

      worksheet.eachRow(
        { includeEmpty: false },
        (row: any, rowNumber: number) => {
          if (rowNumber === 1) return; // Skip header

          try {
            const rowData: Record<string, any> = {};
            row.eachCell((cell: any, colNumber: number) => {
              const header = headerMap[colNumber];
              if (!header) return;
              rowData[header] = cell.value;
            });

            // Validate required fields
            const content = rowData["nội dung bài post"];
            const typeRaw = rowData["loại bài viết"];
            if (!content || !typeRaw) {
              errors.push({
                row: rowNumber,
                error:
                  "Missing required fields: Nội dung bài post or Loại bài viết",
              });
              return;
            }

            const postType = mapPostType(typeRaw);
            if (!postType) {
              errors.push({
                row: rowNumber,
                error: `Invalid Loại bài viết: "${typeRaw}". Must be one of: TEXT, IMAGE, CAROUSEL, VIDEO (or aliases: PHOTO, PHOTOS, MULTIPLE PHOTOS, REEL, REELS, MOVIE, MOVIES, STATUS)`,
              });
              return;
            }

            const postData: any = {
              content: String(content),
              postType,
              status: PostStatus.DRAFT,
            };

            // Map optional fields
            const optionalFieldMap: Record<string, string> = {
              id: "excelId",
              "chủ đề": "topic",
              "trạng thái": "status",
              "skip ai": "skipAI",
              "post id": "threadsPostId",
              comment: "comment",
              "gộp link": "mergeLinks",
            };

            Object.entries(optionalFieldMap).forEach(
              ([headerName, fieldName]) => {
                const rawValue = rowData[headerName];
                if (rawValue === undefined || rawValue === null) return;

                const value = extractCellValue(rawValue);
                if (!value) return;

                if (fieldName === "skipAI") {
                  postData[fieldName] =
                    value.toLowerCase() === "true" || Number(value) === 1;
                } else if (fieldName === "status") {
                  // Map status value
                  const mappedStatus = mapPostStatus(value);
                  if (mappedStatus) {
                    postData[fieldName] = mappedStatus;
                  }
                } else if (fieldName === "mergeLinks") {
                  // Parse merged links
                  const links = parseMergeLinks(value);
                  if (links.length > 0) {
                    postData[fieldName] = links.join(",");
                  }
                } else {
                  postData[fieldName] = value;
                }
              }
            );

            // Collect ALL media links: Link Video + Link ảnh 1..10 + Gộp Link
            const imageUrls: string[] = [];

            // Add Link Video if present
            const videoUrl = rowData["link video"];
            if (videoUrl) {
              const value = extractCellValue(videoUrl);
              if (value) {
                imageUrls.push(value);
              }
            }

            // Add Link ảnh 1..10
            IMAGE_COLUMNS.forEach((colName) => {
              const rawValue = rowData[colName];
              const value = extractCellValue(rawValue);
              if (value) {
                imageUrls.push(value);
              }
            });

            // Add Gộp Link entries (already parsed and stored)
            if (postData.mergeLinks) {
              const merged = parseMergeLinks(postData.mergeLinks);
              merged.forEach((url: string) => imageUrls.push(url));
            }

            postData.imageUrls = imageUrls;
            // Remove mergeLinks from being stored separately (all merged into imageUrls)
            delete postData.mergeLinks;

            const post = new Post(postData);
            posts.push(post); // Queue for saving
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push({ row: rowNumber, error: message });
          }
        }
      );

      // Save all posts to database
      await Promise.all(posts.map((p) => p.save()));

      res.json({
        success: true,
        imported: posts.length,
        errors: errors.length,
        posts,
        errorDetails: errors,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }
);

// Bulk schedule posts from Excel import
router.post("/bulk-schedule", async (req: Request, res: Response) => {
  try {
    const { postIds, scheduledAt } = req.body;

    if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({ error: "postIds array is required" });
    }

    if (!scheduledAt) {
      return res.status(400).json({ error: "scheduledAt is required" });
    }

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return res
        .status(400)
        .json({ error: "Scheduled time must be in the future" });
    }

    const results = [];
    const errors = [];

    for (const postId of postIds) {
      try {
        const post = await Post.findById(postId);
        if (!post) {
          errors.push({ postId, error: "Post not found" });
          continue;
        }

        const jobId = await schedulePost(post._id.toString(), scheduledDate);

        post.scheduledAt = scheduledDate;
        post.status = PostStatus.SCHEDULED;
        post.jobId = jobId;
        await post.save();

        results.push(post);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        errors.push({ postId, error: message });
      }
    }

    res.json({
      success: true,
      scheduled: results.length,
      errors: errors.length,
      posts: results,
      errorDetails: errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
