import { Redis } from "ioredis";

export const createRedisConnection = (): Redis => {
  const redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });

  redis.on("connect", () => {
    console.log("✅ Redis connected successfully");
  });

  redis.on("error", (error) => {
    console.error("❌ Redis error:", error);
  });

  return redis;
};
