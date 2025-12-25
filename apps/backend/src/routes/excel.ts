import { Router } from "express";
import multer from "multer";
import { ExcelService } from "../services/ExcelService.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const excelService = new ExcelService();

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

export default router;
