import winston from "winston";
import chalk from "chalk";

// Custom format with colors
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
    const metaStr =
      Object.keys(metadata).length > 0
        ? "\n" + JSON.stringify(metadata, null, 2)
        : "";

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

// Helper functions with emojis
export const log = {
  success: (message: string, meta?: any) => {
    logger.info(chalk.green(` ${message}`), meta);
  },
  error: (message: string, error?: any) => {
    if (error instanceof Error) {
      logger.error(chalk.red(`${message}`), {
        error: error.message,
        stack: error.stack,
      });
    } else {
      logger.error(chalk.red(`${message}`), error);
    }
  },
  warn: (message: string, meta?: any) => {
    logger.warn(chalk.yellow(`${message}`), meta);
  },
  info: (message: string, meta?: any) => {
    logger.info(chalk.blue(`${message}`), meta);
  },
  debug: (message: string, meta?: any) => {
    logger.debug(chalk.gray(`🔍 ${message}`), meta);
  },
  api: (method: string, path: string, status?: number) => {
    const statusColor = status && status < 400 ? chalk.green : chalk.red;
    logger.info(
      `${chalk.magenta("API")} ${chalk.bold(method)} ${path} ${
        status ? statusColor(`[${status}]`) : ""
      }`
    );
  },
  thread: (message: string, meta?: any) => {
    logger.info(chalk.cyan(`🧵 ${message}`), meta);
  },
  queue: (message: string, meta?: any) => {
    logger.info(chalk.magenta(`${message}`), meta);
  },
  schedule: (message: string, meta?: any) => {
    logger.info(chalk.blue(`⏰ ${message}`), meta);
  },
};
