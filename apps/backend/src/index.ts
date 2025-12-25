import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDatabase } from "./config/database.js";
import postsRouter from "./routes/posts.js";
import excelRouter from "./routes/excel.js";
import credentialsRouter from "./routes/credentials.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/posts", postsRouter);
app.use("/api/excel", excelRouter);
app.use("/api/credentials", credentialsRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
const startServer = async () => {
  try {
    await connectDatabase();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📝 API available at http://localhost:${PORT}/api`);
      console.log(
        `🔐 Credentials API available at http://localhost:${PORT}/api/credentials`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
