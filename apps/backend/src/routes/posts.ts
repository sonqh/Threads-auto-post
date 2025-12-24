import { Router } from "express";
import { Post, PostStatus, PostType } from "../models/Post.js";
import { schedulePost, cancelScheduledPost } from "../queue/postQueue.js";

const router = Router();

// Get all posts
router.get("/", async (req, res) => {
  try {
    const { status, limit = 50, skip = 0 } = req.query;

    const query: any = {};
    if (status) {
      query.status = status;
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip));

    const total = await Post.countDocuments(query);

    res.json({
      data: posts,
      total,
      limit: Number(limit),
      skip: Number(skip),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Get single post
router.get("/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
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
    const postData = req.body;
    const post = new Post(postData);
    await post.save();

    // If scheduled, add to queue
    if (post.scheduledAt && post.status === PostStatus.SCHEDULED) {
      const jobId = await schedulePost(post._id.toString(), post.scheduledAt);
      post.jobId = jobId;
      await post.save();
    }

    res.status(201).json(post);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

// Update post
router.put("/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Cancel existing job if rescheduling
    if (post.jobId && req.body.scheduledAt) {
      await cancelScheduledPost(post.jobId);
    }

    Object.assign(post, req.body);
    await post.save();

    // Reschedule if needed
    if (post.scheduledAt && post.status === PostStatus.SCHEDULED) {
      const jobId = await schedulePost(post._id.toString(), post.scheduledAt);
      post.jobId = jobId;
      await post.save();
    }

    res.json(post);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

// Delete post
router.delete("/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Cancel scheduled job if exists
    if (post.jobId) {
      await cancelScheduledPost(post.jobId);
    }

    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: "Post deleted successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Schedule post
router.post("/:id/schedule", async (req, res) => {
  try {
    const { scheduledAt } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({ error: "scheduledAt is required" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return res
        .status(400)
        .json({ error: "Scheduled time must be in the future" });
    }

    // Cancel existing job
    if (post.jobId) {
      await cancelScheduledPost(post.jobId);
    }

    // Schedule new job
    const jobId = await schedulePost(post._id.toString(), scheduledDate);

    post.scheduledAt = scheduledDate;
    post.status = PostStatus.SCHEDULED;
    post.jobId = jobId;
    await post.save();

    res.json(post);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

// Cancel scheduled post
router.post("/:id/cancel", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.jobId) {
      await cancelScheduledPost(post.jobId);
    }

    post.status = PostStatus.DRAFT;
    post.jobId = undefined;
    await post.save();

    res.json(post);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
