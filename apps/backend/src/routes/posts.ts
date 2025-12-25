import { Router } from "express";
import { PostService } from "../services/PostService.js";

const router = Router();
const postService = new PostService();

// Get all posts
router.get("/", async (req, res) => {
  try {
    const { status, limit = 50, skip = 0 } = req.query;
    const options = {
      status: status as string | undefined,
      limit: Number(limit),
      skip: Number(skip),
    };
    const posts = await postService.getPosts(options);
    res.json(posts);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Get single post
router.get("/:id", async (req, res) => {
  try {
    const post = await postService.getPost(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.json(post);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Create post
router.post("/", async (req, res) => {
  try {
    const post = await postService.createPost(req.body);
    res.status(201).json(post);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

// Update post
router.put("/:id", async (req, res) => {
  try {
    const post = await postService.updatePost(req.params.id, req.body);
    res.json(post);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

// Delete post
router.delete("/:id", async (req, res) => {
  try {
    await postService.deletePost(req.params.id);
    res.json({ message: "Post deleted successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Bulk delete posts
router.post("/bulk-delete", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: "ids array is required" });
    }
    await postService.bulkDelete(ids);
    res.json({ message: "Posts deleted successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Publish post to Threads
router.post("/:id/publish", async (req, res) => {
  try {
    const post = await postService.publishPost(req.params.id);
    res.json(post);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

// Schedule post
router.post("/:id/schedule", async (req, res) => {
  try {
    const { scheduledAt } = req.body;
    if (!scheduledAt) {
      return res.status(400).json({ error: "scheduledAt is required" });
    }
    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return res
        .status(400)
        .json({ error: "Scheduled time must be in the future" });
    }
    const post = await postService.schedulePost(req.params.id, scheduledDate);
    res.json(post);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

// Cancel scheduled post
router.post("/:id/cancel", async (req, res) => {
  try {
    const post = await postService.cancelSchedule(req.params.id);
    res.json(post);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
