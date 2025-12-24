import mongoose from "mongoose";

export const connectDatabase = async (): Promise<void> => {
  try {
    const uri =
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/threads-post-scheduler";
    await mongoose.connect(uri);
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    throw error;
  }
};

mongoose.connection.on("disconnected", () => {
  console.log("⚠️  MongoDB disconnected");
});

mongoose.connection.on("error", (error) => {
  console.error("❌ MongoDB error:", error);
});
