import { Router } from "express";
import multer from "multer";
import { ExcelService } from "../services/ExcelService.js";
import { PostService } from "../services/PostService.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const excelService = new ExcelService();
const postService = new PostService();

// Check for duplicates before import
router.post("/check-duplicates", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!req.file.mimetype.includes("spreadsheetml")) {
      return res
        .status(400)
        .json({ error: "Invalid file type. Please upload an Excel file." });
    }

    const buffer = req.file.buffer;
    const result = await excelService.checkDuplicates(buffer);

    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

// Import posts from Excel file
router.post("/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!req.file.mimetype.includes("spreadsheetml")) {
      return res
        .status(400)
        .json({ error: "Invalid file type. Please upload an Excel file." });
    }

    const buffer = req.file.buffer;
    const result = await excelService.importExcel(buffer);

    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

// Bulk delete posts (called from frontend)
router.post("/bulk-delete", async (req, res) => {
  try {
    const { postIds } = req.body;

    if (!postIds || !Array.isArray(postIds)) {
      return res.status(400).json({ error: "postIds array is required" });
    }

    if (postIds.length === 0) {
      return res.status(400).json({ error: "postIds array cannot be empty" });
    }

    const result = await postService.bulkDelete(postIds);

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Successfully deleted ${result.deletedCount} post(s)`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      success: false,
      error: message,
      message: "Failed to delete posts",
    });
  }
});

export default router;
