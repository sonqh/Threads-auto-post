import cors from "cors";
import express from "express";

// Initialize environment loader FIRST, before any other imports
import dotenvConfig from "./config/dotenv.config.js";
dotenvConfig.config();

// Now safe to import config that depends on env vars
import { connectDatabase } from "./config/database.js";
import { appConfig } from "./config/env.js";
import { log } from "./config/logger.js";
import credentialsRouter from "./routes/credentials.js";
import excelRouter from "./routes/excel.js";
import postsRouter from "./routes/posts.js";

const app = express();
const PORT = appConfig.server.port;

// Middleware
app.use(cors({ origin: appConfig.server.corsOrigin }));
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
      log.success(`Server running on http://localhost:${PORT}`);
      log.info(`API available at http://localhost:${PORT}/api`);
      log.info(
        `Credentials API available at http://localhost:${PORT}/api/credentials`
      );
    });
  } catch (error) {
    log.error("Failed to start server", error);
    process.exit(1);
  }
};

startServer();
