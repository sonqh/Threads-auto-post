import mongoose, { ConnectOptions } from "mongoose";
import { appConfig } from "./env.js";
import { log } from "./logger.js";

type OnConnectedCallback = (mongoUrl: string) => void;

interface DatabaseConnectionOptions {
  mongoUrl: string;
  mongooseConnectionOptions?: ConnectOptions;
  retryDelayMs?: number;
  onStartConnection?: (mongoUrl: string) => void;
  onConnectionError?: (error: Error, mongoUrl: string) => void;
  onConnectionRetry?: (mongoUrl: string) => void;
}

const defaultMongooseConnectionOptions: ConnectOptions = {
  autoCreate: true,
  autoIndex: true,
};

/**
 * Enhanced MongoDB Connection Manager with Auto-Reconnection
 * Features:
 * - Automatic reconnection without crashing
 * - Configurable retry delays
 * - Event handlers for connection lifecycle
 * - Graceful shutdown with proper cleanup
 */
class DatabaseConnectionManager {
  private readonly options: DatabaseConnectionOptions;
  private onConnectedCallback?: OnConnectedCallback;
  private isConnectedBefore: boolean = false;
  private shouldCloseConnection: boolean = false;
  private retryDelayMs: number;
  private readonly mongoConnectionOptions: ConnectOptions;
  private connectionTimeout?: NodeJS.Timeout;

  constructor(options: DatabaseConnectionOptions) {
    this.options = options;
    this.retryDelayMs = options.retryDelayMs ?? 2000;
    this.mongoConnectionOptions =
      options.mongooseConnectionOptions ?? defaultMongooseConnectionOptions;

    // Setup connection event handlers
    mongoose.connection.on("error", this.onError);
    mongoose.connection.on("connected", this.onConnected);
    mongoose.connection.on("disconnected", this.onDisconnected);
    mongoose.connection.on("reconnected", this.onReconnected);
  }

  /**
   * Start MongoDB connection with auto-retry logic
   */
  public connect(onConnectedCallback: OnConnectedCallback): void {
    this.onConnectedCallback = onConnectedCallback;
    this.startConnection();
  }

  /**
   * Close MongoDB connection gracefully
   */
  public async close(force: boolean = false): Promise<void> {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }
    this.shouldCloseConnection = true;
    await mongoose.connection.close(force);
  }

  private startConnection = (): void => {
    this.options.onStartConnection?.(this.options.mongoUrl);
    mongoose
      .connect(this.options.mongoUrl, this.mongoConnectionOptions)
      .catch(() => {
        // Catch but don't throw - handler will manage retry
      });
  };

  private onConnected = (): void => {
    this.isConnectedBefore = true;
    this.onConnectedCallback?.(this.options.mongoUrl);
  };

  private onReconnected = (): void => {
    this.onConnectedCallback?.(this.options.mongoUrl);
  };

  private onError = (): void => {
    const error = new Error(
      `Could not connect to MongoDB at ${this.options.mongoUrl}`
    );
    this.options.onConnectionError?.(error, this.options.mongoUrl);
  };

  private onDisconnected = (): void => {
    if (!this.isConnectedBefore && !this.shouldCloseConnection) {
      this.connectionTimeout = setTimeout(() => {
        this.startConnection();
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
        }
      }, this.retryDelayMs);
      this.options.onConnectionRetry?.(this.options.mongoUrl);
    }
  };
}

let connectionManager: DatabaseConnectionManager;

/**
 * Connect to MongoDB with automatic reconnection support
 * Handles connection retry logic and graceful error recovery
 */
export const connectDatabase = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const uri = appConfig.database.mongodbUri;

    connectionManager = new DatabaseConnectionManager({
      mongoUrl: uri,
      mongooseConnectionOptions: defaultMongooseConnectionOptions,
      retryDelayMs: 2000,
      onStartConnection: (mongoUrl: string) => {
        log.info(`Connecting to MongoDB: ${mongoUrl}`);
      },
      onConnectionError: (error: Error, mongoUrl: string) => {
        log.error(`Failed to connect to MongoDB: ${mongoUrl}`, error);
      },
      onConnectionRetry: (mongoUrl: string) => {
        log.warn(`Retrying MongoDB connection: ${mongoUrl}`);
      },
    });

    connectionManager.connect((mongoUrl: string) => {
      log.success(`MongoDB connected successfully`);
      resolve();
    });

    // Set a timeout to reject if connection fails after 30 seconds
    const connectionTimeout = setTimeout(() => {
      reject(
        new Error(`MongoDB connection timeout after 30 seconds. URI: ${uri}`)
      );
    }, 30000);

    // Clear timeout on successful connection
    const originalConnection = mongoose.connection;
    const handleConnection = () => {
      clearTimeout(connectionTimeout);
      originalConnection.removeListener("connected", handleConnection);
    };
    originalConnection.on("connected", handleConnection);
  });
};

/**
 * Disconnect from MongoDB gracefully
 */
export const disconnectDatabase = async (): Promise<void> => {
  try {
    if (connectionManager) {
      await connectionManager.close();
    } else {
      await mongoose.disconnect();
    }
    log.success("MongoDB disconnected successfully");
  } catch (error) {
    log.error("MongoDB disconnection error:", error);
    throw error;
  }
};
