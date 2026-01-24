import ExcelJS from "exceljs";
import { Post, PostType, PostStatus } from "../models/Post.js";

interface ImportResult {
  success: boolean;
  imported: number;
  errors: number;
  posts: any[];
  errorDetails: Array<{ row: number; error: string }>;
}

const IMAGE_COLUMNS = Array.from({ length: 10 }, (_, i) => `link ảnh ${i + 1}`);
const REQUIRED_HEADERS = ["nội dung bài post", "loại bài viết"];

export class ExcelService {
  /**
   * Normalize header: lowercase, trim, single spaces
   */
  private normalizeHeader(h: string): string {
    return (h || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  }

  /**
   * Extract actual cell value from ExcelJS (handles formulas, hyperlinks, rich text)
   */
  private extractCellValue(cellValue: any): string | null {
    if (!cellValue) return null;

    // Handle formula objects from ExcelJS
    if (typeof cellValue === "object" && cellValue.formula) {
      return cellValue.result || null;
    }

    // Handle hyperlink objects
    if (typeof cellValue === "object" && cellValue.hyperlink) {
      return cellValue.text || cellValue.hyperlink || null;
    }

    // Handle rich text objects - multiple formats
    if (
      typeof cellValue === "object" &&
      cellValue.richText &&
      Array.isArray(cellValue.richText)
    ) {
      const text = cellValue.richText
        .map((t: any) => (typeof t === "object" && t.text ? t.text : ""))
        .join("")
        .trim();
      return text || null;
    }

    // Handle plain objects that might contain text
    if (typeof cellValue === "object") {
      // Try to extract text if it's a richText-like structure
      if (cellValue.text && typeof cellValue.text === "string") {
        return cellValue.text.trim() || null;
      }
      // Last resort: return null instead of the object
      return null;
    }

    // Regular string/number
    return String(cellValue).trim() || null;
  }

  /**
   * Map user-friendly post type names to PostType enum
   */
  private mapPostType(typeRaw: string): PostType | null {
    const normalized = String(typeRaw).toUpperCase().trim();

    if (Object.values(PostType).includes(normalized as PostType)) {
      return normalized as PostType;
    }

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

  /**
   * Map user-friendly status names to PostStatus enum
   */
  private mapPostStatus(statusRaw: string): PostStatus | null {
    const normalized = String(statusRaw).toUpperCase().trim();

    if (Object.values(PostStatus).includes(normalized as PostStatus)) {
      return normalized as PostStatus;
    }

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

  /**
   * Parse comma/semicolon/pipe/newline separated links
   */
  private parseMergeLinks(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    return String(value)
      .split(/[,;\n\|]+/)
      .map((s) => s.trim())
      .filter((s) => s);
  }

  /**
   * Sanitize URLs (add https if missing)
   */
  private sanitizeUrl(url: string): string {
    if (!url) return "";
    const trimmed = url.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }

  /**
   * Validate post for Threads publishing
   */
  private validatePostForThreads(
    postType: string,
    content: string,
    imageUrls: string[]
  ): { valid: boolean; error?: string } {
    if (!content || content.trim().length === 0) {
      return { valid: false, error: "Content is required" };
    }

    if (postType === PostType.TEXT) {
      return { valid: true };
    }

    if (
      postType === PostType.IMAGE ||
      postType === PostType.CAROUSEL ||
      postType === PostType.VIDEO
    ) {
      if (!imageUrls || imageUrls.length === 0) {
        return {
          valid: false,
          error: `${postType} posts require at least one image/video URL`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Import Excel file and create posts
   */
  async importExcel(fileBuffer: Buffer): Promise<ImportResult> {
    const errors: Array<{ row: number; error: string }> = [];
    const posts: any[] = [];

    try {
      const workbook = new ExcelJS.Workbook();
      // Convert to Uint8Array to resolve Buffer type conflicts
      const uint8Array = new Uint8Array(fileBuffer);
      await workbook.xlsx.load(uint8Array.buffer);

      const sheetName = "museinrose102 Bài Post Thời trang";
      let worksheet =
        workbook.getWorksheet(sheetName) ||
        workbook.getWorksheet("Danh Sách Bài Post");

      if (!worksheet) {
        // fallback to default sheet name
        throw new Error(
          `Sheet "${sheetName}" not found. Available: ${workbook.worksheets
            .map((w) => w.name)
            .join(", ")}`
        );
      }

      // Read header row
      const headerRow = worksheet.getRow(1);
      const headerMap: Record<number, string> = {};
      headerRow.eachCell((cell: any, colNumber: number) => {
        const header = this.normalizeHeader((cell.value as string) || "");
        if (header) {
          headerMap[colNumber] = header;
        }
      });

      // Validate required headers
      const headers = Object.values(headerMap);
      const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        throw new Error(`Missing required columns: ${missing.join(", ")}`);
      }

      // Process rows
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

            this.processRow(rowData, rowNumber, posts, errors);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push({ row: rowNumber, error: message });
          }
        }
      );

      // Save posts to database
      await Promise.all(posts.map((p) => p.save()));

      return {
        success: true,
        imported: posts.length,
        errors: errors.length,
        posts,
        errorDetails: errors,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Excel import failed: ${message}`);
    }
  }

  /**
   * Process single row from Excel
   */
  private processRow(
    rowData: Record<string, any>,
    rowNumber: number,
    posts: any[],
    errors: Array<{ row: number; error: string }>
  ): void {
    const content = rowData["nội dung bài post"];
    const typeRaw = rowData["loại bài viết"];

    // Extract comment properly to handle rich text and ensure it's a string
    const commentRaw = rowData["comment"];
    let comment: string | undefined;
    if (commentRaw) {
      const extracted = this.extractCellValue(commentRaw);
      comment = extracted ? String(extracted).trim() : undefined;
    }

    const postType = this.mapPostType(typeRaw);
    if (!postType) {
      errors.push({
        row: rowNumber,
        error: `Invalid post type: "${typeRaw}". Must be: TEXT, IMAGE, CAROUSEL, VIDEO`,
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
      "gộp link": "mergeLinks",
    };

    Object.entries(optionalFieldMap).forEach(([headerName, fieldName]) => {
      const rawValue = rowData[headerName];
      if (rawValue === undefined || rawValue === null) return;

      const value = this.extractCellValue(rawValue);
      if (!value) return;

      if (fieldName === "skipAI") {
        postData[fieldName] =
          value.toLowerCase() === "true" || Number(value) === 1;
      } else if (fieldName === "status") {
        const mappedStatus = this.mapPostStatus(value);
        if (mappedStatus) {
          postData[fieldName] = mappedStatus;
        }
      } else if (fieldName === "mergeLinks") {
        const links = this.parseMergeLinks(value);
        if (links.length > 0) {
          postData[fieldName] = links.join(",");
        }
      } else {
        postData[fieldName] = value;
      }
    });

    // Add comment if extracted and non-empty
    if (comment) {
      postData.comment = comment;
    }

    // Collect all media links
    const imageUrls: string[] = [];

    const videoUrl = rowData["link video"];
    if (videoUrl) {
      const value = this.extractCellValue(videoUrl);
      if (value) imageUrls.push(this.sanitizeUrl(value));
    }

    IMAGE_COLUMNS.forEach((colName) => {
      const rawValue = rowData[colName];
      const value = this.extractCellValue(rawValue);
      if (value) imageUrls.push(this.sanitizeUrl(value));
    });

    if (postData.mergeLinks) {
      const merged = this.parseMergeLinks(postData.mergeLinks);
      merged.forEach((url: string) => imageUrls.push(this.sanitizeUrl(url)));
    }

    postData.imageUrls = [...new Set(imageUrls)];
    delete postData.mergeLinks;

    // Validate for Threads
    const validation = this.validatePostForThreads(
      postType,
      String(content),
      postData.imageUrls
    );
    if (!validation.valid) {
      errors.push({
        row: rowNumber,
        error: `Threads validation: ${validation.error}`,
      });
      return;
    }

    const post = new Post(postData);
    posts.push(post);
  }

  /**
   * Check for duplicates in Excel file before importing
   */
  async checkDuplicates(fileBuffer: Buffer): Promise<{
    success: boolean;
    duplicates: Array<{
      rowIndex: number;
      content: string;
      description?: string;
      topic?: string;
      imageUrls?: string[];
      duplicateType: "EXACT" | "CONTENT_ONLY";
      matches: Array<{
        _id: string;
        content: string;
        comment?: string;
        topic?: string;
        imageUrls: string[];
      }>;
    }>;
    totalRows: number;
  }> {
    try {
      const workbook = new ExcelJS.Workbook();
      const uint8Array = new Uint8Array(fileBuffer);
      await workbook.xlsx.load(uint8Array.buffer);

      const sheetName = "Danh Sách Bài Post Decor";
      let worksheet =
        workbook.getWorksheet(sheetName) ||
        workbook.getWorksheet("Danh Sách Bài Post");

      if (!worksheet) {
        throw new Error(
          `Sheet "${sheetName}" not found. Available: ${workbook.worksheets
            .map((w) => w.name)
            .join(", ")}`
        );
      }

      // Read header row
      const headerRow = worksheet.getRow(1);
      const headerMap: Record<number, string> = {};
      headerRow.eachCell((cell: any, colNumber: number) => {
        const header = this.normalizeHeader((cell.value as string) || "");
        if (header) {
          headerMap[colNumber] = header;
        }
      });

      // Get all existing posts
      const existingPosts = await Post.find().select(
        "_id content comment topic imageUrls"
      );

      const duplicates: Array<{
        rowIndex: number;
        content: string;
        description?: string;
        topic?: string;
        imageUrls?: string[];
        duplicateType: "EXACT" | "CONTENT_ONLY";
        matches: any[];
      }> = [];
      let rowCount = 0;

      // Process rows
      worksheet.eachRow(
        { includeEmpty: false },
        (row: any, rowNumber: number) => {
          if (rowNumber === 1) return; // Skip header
          rowCount++;

          const rowData: Record<string, any> = {};
          row.eachCell((cell: any, colNumber: number) => {
            const header = headerMap[colNumber];
            if (!header) return;
            rowData[header] = cell.value;
          });

          const content = rowData["nội dung bài post"] || "";
          const comment = rowData["comment"];
          const topic = rowData["chủ đề"];
          const mergeLinks = rowData["gộp link"];
          const videoUrl = rowData["link video"];

          // Collect image URLs
          const imageUrls: string[] = [];
          if (videoUrl) {
            const value = this.extractCellValue(videoUrl);
            if (value) imageUrls.push(this.sanitizeUrl(value));
          }

          IMAGE_COLUMNS.forEach((colName) => {
            const rawValue = rowData[colName];
            const value = this.extractCellValue(rawValue);
            if (value) imageUrls.push(this.sanitizeUrl(value));
          });

          if (mergeLinks) {
            const merged = this.parseMergeLinks(mergeLinks);
            merged.forEach((url: string) =>
              imageUrls.push(this.sanitizeUrl(url))
            );
          }

          const uniqueImageUrls = [...new Set(imageUrls)];

          // Normalize content for comparison
          const normalizedContent = String(content || "")
            .toLowerCase()
            .trim();

          // First check for exact duplicates (all fields match)
          const exactMatches = existingPosts.filter((existingPost) => {
            const existingDesc = String(existingPost.comment || "")
              .toLowerCase()
              .trim();
            const existingTopic = String(existingPost.topic || "")
              .toLowerCase()
              .trim();
            const existingUrls = (existingPost.imageUrls || [])
              .map((url: string) => String(url).toLowerCase().trim())
              .sort();

            const rowDesc = String(comment || "")
              .toLowerCase()
              .trim();
            const rowTopic = String(topic || "")
              .toLowerCase()
              .trim();
            const rowUrls = uniqueImageUrls
              .map((url: string) => String(url).toLowerCase().trim())
              .sort();

            // Check if all three fields match
            return (
              existingDesc === rowDesc &&
              existingTopic === rowTopic &&
              existingUrls.join("|") === rowUrls.join("|")
            );
          });

          if (exactMatches.length > 0) {
            duplicates.push({
              rowIndex: rowNumber - 1, // Adjust to 0-based index
              content,
              description: comment,
              topic: topic ? String(topic) : undefined,
              imageUrls: uniqueImageUrls,
              duplicateType: "EXACT",
              matches: exactMatches.map((p) => ({
                _id: p._id,
                content: p.content,
                comment: p.comment,
                topic: p.topic,
                imageUrls: p.imageUrls,
              })),
            });
          } else if (normalizedContent) {
            // If no exact match, check for content-only duplicates
            const contentMatches = existingPosts.filter((existingPost) => {
              const existingContent = String(existingPost.content || "")
                .toLowerCase()
                .trim();
              return existingContent === normalizedContent;
            });

            if (contentMatches.length > 0) {
              duplicates.push({
                rowIndex: rowNumber - 1,
                content,
                description: comment,
                topic: topic ? String(topic) : undefined,
                imageUrls: uniqueImageUrls,
                duplicateType: "CONTENT_ONLY",
                matches: contentMatches.map((p) => ({
                  _id: p._id,
                  content: p.content,
                  comment: p.comment,
                  topic: p.topic,
                  imageUrls: p.imageUrls,
                })),
              });
            }
          }
        }
      );

      return {
        success: true,
        duplicates,
        totalRows: rowCount,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Duplicate check failed: ${message}`);
    }
  }
}
