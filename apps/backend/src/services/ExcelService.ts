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

    // Handle rich text objects
    if (typeof cellValue === "object" && cellValue.richText) {
      const text = cellValue.richText
        .map((t: any) => t.text || "")
        .join("")
        .trim();
      return text || null;
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

      const sheetName = "Danh Sách Bài Post Decor";
      const worksheet = workbook.getWorksheet(sheetName);

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
    const comment = rowData["comment"];

    // Check required fields
    if (!content || !typeRaw) {
      const missing = [];
      if (!content) missing.push("Nội dung bài post");
      if (!typeRaw) missing.push("Loại bài viết");
      errors.push({
        row: rowNumber,
        error: `Missing required fields: ${missing.join(", ")}`,
      });
      return;
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
      comment: "comment",
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
}

export const excelService = new ExcelService();
