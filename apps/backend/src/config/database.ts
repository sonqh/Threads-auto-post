import mongoose from "mongoose";
import { appConfig } from "./env.js";

export const connectDatabase = async (): Promise<void> => {
  try {
    const uri = appConfig.database.mongodbUri;
    await mongoose.connect(uri);
    console.log(" MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
};

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected");
});

mongoose.connection.on("error", (error) => {
  console.error("MongoDB error:", error);
});
