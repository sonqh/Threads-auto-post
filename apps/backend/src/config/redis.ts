import { Redis } from "ioredis";
import { appConfig } from "./env.js";

export const createRedisConnection = (): Redis => {
  const redis = new Redis({
    host: appConfig.redis.host,
    port: appConfig.redis.port,
    password: appConfig.redis.password || undefined,
    maxRetriesPerRequest: null,
  });

  redis.on("connect", () => {
    console.log(" Redis connected successfully");
  });

  redis.on("error", (error) => {
    console.error("Redis error:", error);
  });

  return redis;
};
