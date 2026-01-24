import winston from "winston";
import chalk from "chalk";

// Track performance metrics
const performanceMetrics = new Map<string, { startTime: number; label: string }>();

// Custom format with colors and improved readability
const coloredFormat = winston.format.printf(
  ({ level, message, timestamp, ...metadata }) => {
    let coloredLevel = level;

    switch (level) {
      case "error":
        coloredLevel = chalk.red.bold(level.toUpperCase());
        break;
      case "warn":
        coloredLevel = chalk.yellow.bold(level.toUpperCase());
        break;
      case "info":
        coloredLevel = chalk.blue.bold(level.toUpperCase());
        break;
      case "debug":
        coloredLevel = chalk.gray(level.toUpperCase());
        break;
      default:
        coloredLevel = level.toUpperCase();
    }

    const time = chalk.dim(timestamp);

    // Format metadata with better indentation and structure
    let metaStr = "";
    if (Object.keys(metadata).length > 0) {
      const metaLines = JSON.stringify(metadata, null, 2).split("\n");
      metaStr = "\n" + metaLines.map(line => `  ${line}`).join("\n");
    }

    return `${time} [${coloredLevel}] ${message}${metaStr}`;
  }
);

// Create logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    coloredFormat
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        coloredFormat
      ),
    }),
    // File transport for errors
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: "logs/combined.log",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
  ],
});

// Helper functions with emojis and enhanced capabilities
export const log = {
  success: (message: string, meta?: any) => {
    logger.info(chalk.green(`✅ ${message}`), meta);
  },
  error: (message: string, error?: any) => {
    if (error instanceof Error) {
      logger.error(chalk.red(`❌ ${message}`), {
        error: error.message,
        stack: error.stack,
      });
    } else {
      logger.error(chalk.red(`❌ ${message}`), error);
    }
  },
  warn: (message: string, meta?: any) => {
    logger.warn(chalk.yellow(`⚠️  ${message}`), meta);
  },
  info: (message: string, meta?: any) => {
    logger.info(chalk.blue(`ℹ️  ${message}`), meta);
  },
  debug: (message: string, meta?: any) => {
    logger.debug(chalk.gray(`🔍 ${message}`), meta);
  },
  api: (method: string, path: string, status?: number) => {
    const statusColor = status && status < 400 ? chalk.green : chalk.red;
    logger.info(
      `${chalk.magenta("API")} ${chalk.bold(method)} ${path} ${status ? statusColor(`[${status}]`) : ""
      }`
    );
  },
  thread: (message: string, meta?: any) => {
    logger.info(chalk.cyan(`🧵 ${message}`), meta);
  },
  queue: (message: string, meta?: any) => {
    logger.info(chalk.magenta(`📋 ${message}`), meta);
  },
  schedule: (message: string, meta?: any) => {
    logger.info(chalk.blue(`⏰ ${message}`), meta);
  },

  // Performance tracking
  startTimer: (label: string): string => {
    const timerId = `timer_${Date.now()}_${Math.random()}`;
    performanceMetrics.set(timerId, { startTime: Date.now(), label });
    logger.debug(chalk.cyan(`⏱️  Started: ${label}`));
    return timerId;
  },

  endTimer: (timerId: string, meta?: any) => {
    const metric = performanceMetrics.get(timerId);
    if (metric) {
      const duration = Date.now() - metric.startTime;
      const color = duration > 5000 ? chalk.yellow : chalk.green;
      logger.info(
        color(`✓ ${metric.label} completed in ${duration}ms`),
        meta
      );
      performanceMetrics.delete(timerId);
      return duration;
    } else {
      logger.warn(`Timer ${timerId} not found`);
      return 0;
    }
  },

  // Structured logging for common patterns
  request: (method: string, path: string, meta?: any) => {
    logger.info(chalk.magenta(`→ ${method} ${path}`), meta);
  },

  response: (status: number, meta?: any) => {
    const color = status < 400 ? chalk.green : status < 500 ? chalk.yellow : chalk.red;
    logger.info(color(`← [${status}]`), meta);
  },

  divider: (title?: string) => {
    const line = "─".repeat(60);
    logger.info(chalk.dim(title ? `${line} ${title} ${line}` : line));
  },

  section: (title: string) => {
    logger.info(chalk.bold.cyan(`\n${"=".repeat(20)} ${title} ${"=".repeat(20)}\n`));
  },
};
