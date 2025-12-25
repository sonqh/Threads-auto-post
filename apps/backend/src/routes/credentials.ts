import { Router } from "express";
import { ThreadsService } from "../services/ThreadsService.js";
import { ThreadsCredential } from "../models/ThreadsCredential.js";

const router = Router();
const threadsService = new ThreadsService();

// Get all credentials for current user
router.get("/", async (req, res) => {
  try {
    const credentials = await threadsService.getAllCredentials();
    res.json(credentials);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Get single credential
router.get("/:userId", async (req, res) => {
  try {
    const credential = await ThreadsCredential.findOne({
      threadsUserId: req.params.userId,
    });
    if (!credential) {
      return res.status(404).json({ error: "Credential not found" });
    }
    // Don't return sensitive secrets
    const safe = credential.toObject();
    delete (safe as any).clientSecret;
    res.json(safe);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Save credential (from OAuth callback)
router.post("/", async (req, res) => {
  try {
    const { threadsUserId, clientId, clientSecret, accessToken } = req.body;

    if (!threadsUserId || !clientId || !clientSecret || !accessToken) {
      return res.status(400).json({
        error:
          "threadsUserId, clientId, clientSecret, and accessToken are required",
      });
    }

    const credential = await threadsService.saveCredential({
      threadsUserId,
      clientId,
      clientSecret,
      accessToken,
      refreshToken: req.body.refreshToken,
      longLivedAccessToken: req.body.longLivedAccessToken,
      expiresAt: req.body.expiresAt,
    });

    // Return safe version without secrets
    const safe = credential.toObject();
    delete (safe as any).clientSecret;
    res.status(201).json(safe);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

// Verify credential validity
router.post("/:userId/verify", async (req, res) => {
  try {
    const credential = await ThreadsCredential.findOne({
      threadsUserId: req.params.userId,
    });
    if (!credential) {
      return res
        .status(404)
        .json({ error: "Credential not found", valid: false });
    }
    const isValid = await threadsService.verifyCredential(credential);
    res.json({ valid: isValid });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message, valid: false });
  }
});

// Revoke credential
router.delete("/:userId", async (req, res) => {
  try {
    await threadsService.revokeCredential(req.params.userId);
    res.json({ message: "Credential revoked successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Refresh token manually
router.post("/:userId/refresh", async (req, res) => {
  try {
    const credential = await ThreadsCredential.findOne({
      threadsUserId: req.params.userId,
    });
    if (!credential) {
      return res.status(404).json({ error: "Credential not found" });
    }
    await threadsService.refreshToken(credential);
    // Return safe version without secrets
    const safe = credential.toObject();
    delete (safe as any).clientSecret;
    res.json(safe);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

export default router;
