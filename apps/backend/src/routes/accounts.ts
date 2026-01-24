import { Router, Request, Response } from "express";
import { logger } from "../config/logger.js";
import { credentialService } from "../services/CredentialService.js";
import { ThreadsService } from "../services/ThreadsService.js";
import { CredentialStatus } from "../models/ThreadsCredential.js";

export const accountsRouter = Router();

// Middleware to ensure user is authenticated
const ensureAuth = (req: Request, res: Response, next: Function) => {
  const userId = (req as any).user?.id || (req as any).userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: User not authenticated",
    });
  }

  next();
};

accountsRouter.use(ensureAuth);

/**
 * GET /api/accounts
 * Get all accounts for authenticated user
 */
accountsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || (req as any).userId;
    logger.debug(`Fetching accounts for user: ${userId}`);

    const accounts = await credentialService.getUserAccounts(userId);

    const response = accounts.map((account) => ({
      id: account._id,
      accountName: account.accountName,
      accountDescription: account.accountDescription,
      threadsUserName: account.threadsUserName,
      threadsUserId: account.threadsUserId,
      status: account.status,
      isDefault: account.isDefault,
      lastRefreshedAt: account.lastRefreshedAt,
      createdAt: account.createdAt,
    }));

    res.json({
      success: true,
      data: response,
      count: response.length,
    });
  } catch (error) {
    logger.error("Error fetching accounts:", error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch accounts",
    });
  }
});

/**
 * GET /api/accounts/:id
 * Get specific account details
 */
accountsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || (req as any).userId;
    const accountId = String(req.params.id);
    logger.debug(`Fetching account ${accountId} for user: ${userId}`);

    const account = await credentialService.getAccount(accountId, userId);

    res.json({
      success: true,
      data: {
        id: account._id,
        accountName: account.accountName,
        accountDescription: account.accountDescription,
        threadsUserName: account.threadsUserName,
        threadsUserId: account.threadsUserId,
        status: account.status,
        isDefault: account.isDefault,
        scope: account.scope,
        lastRefreshedAt: account.lastRefreshedAt,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
    });
  } catch (error) {
    logger.error(`Error fetching account ${req.params.id}:`, error);
    res.status(404).json({
      success: false,
      error: error instanceof Error ? error.message : "Account not found",
    });
  }
});

/**
 * POST /api/accounts
 * Add new Threads account (via OAuth callback)
 * Body: {
 *   code: string (OAuth authorization code),
 *   redirectUri: string,
 *   accountName: string,
 *   accountDescription?: string,
 *   isDefault?: boolean
 * }
 */
accountsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || (req as any).userId;
    const { code, redirectUri, accountName, accountDescription, isDefault } =
      req.body;

    if (!code || !redirectUri || !accountName) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: code, redirectUri, accountName",
      });
    }

    logger.info(
      `Adding account for user ${userId}: ${accountName} (via OAuth)`
    );

    const credential = await credentialService.verifyAndStoreCredential(
      userId,
      {
        code,
        redirectUri,
      },
      {
        accountName,
        accountDescription,
        isDefault,
      }
    );

    res.status(201).json({
      success: true,
      message: "Account connected successfully",
      data: {
        id: credential._id,
        accountName: credential.accountName,
        threadsUserName: credential.threadsUserName,
        isDefault: credential.isDefault,
      },
    });
  } catch (error) {
    logger.error("Error adding account:", error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to add account",
    });
  }
});

/**
 * PATCH /api/accounts/:id
 * Update account details (name, description)
 */
accountsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || (req as any).userId;
    const { accountName, accountDescription } = req.body;

    if (!accountName && accountDescription === undefined) {
      return res.status(400).json({
        success: false,
        error: "No fields to update",
      });
    }

    logger.debug(`Updating account ${req.params.id} for user: ${userId}`);

    const account = await credentialService.updateAccount(
      req.params.id,
      userId,
      {
        accountName,
        accountDescription,
      }
    );

    res.json({
      success: true,
      message: "Account updated",
      data: {
        id: account._id,
        accountName: account.accountName,
        accountDescription: account.accountDescription,
      },
    });
  } catch (error) {
    logger.error(`Error updating account ${req.params.id}:`, error);
    res.status(400).json({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update account",
    });
  }
});

/**
 * PATCH /api/accounts/:id/default
 * Set account as default
 */
accountsRouter.patch("/:id/default", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || (req as any).userId;
    const accountId = String(req.params.id);
    logger.info(
      `Setting account ${accountId} as default for user: ${userId}`
    );

    const account = await credentialService.setDefaultAccount(
      accountId,
      userId
    );

    res.json({
      success: true,
      message: "Account set as default",
      data: {
        id: account._id,
        accountName: account.accountName,
        isDefault: account.isDefault,
      },
    });
  } catch (error) {
    logger.error(`Error setting account ${req.params.id} as default:`, error);
    res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to set default account",
    });
  }
});

/**
 * POST /api/accounts/:id/refresh-token
 * Manually refresh access token for account
 */
accountsRouter.post(
  "/:id/refresh-token",
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id || (req as any).userId;
      const accountId = String(req.params.id);
      logger.info(`Manually refreshing token for account ${accountId}`);

      // Verify user owns this account
      await credentialService.getAccount(accountId, userId);

      const account = await credentialService.refreshAccountToken(
        accountId
      );

      res.json({
        success: true,
        message: "Token refreshed successfully",
        data: {
          id: account._id,
          status: account.status,
          lastRefreshedAt: account.lastRefreshedAt,
        },
      });
    } catch (error) {
      logger.error(
        `Error refreshing token for account ${req.params.id}:`,
        error
      );
      res.status(400).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to refresh token",
      });
    }
  }
);

/**
 * DELETE /api/accounts/:id
 * Disconnect/remove account
 */
accountsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || (req as any).userId;
    const accountId = String(req.params.id);
    logger.info(`Deleting account ${accountId} for user: ${userId}`);

    await credentialService.deleteAccount(accountId, userId);

    res.json({
      success: true,
      message: "Account disconnected",
    });
  } catch (error) {
    logger.error(`Error deleting account ${req.params.id}:`, error);
    res.status(400).json({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete account",
    });
  }
});

/**
 * GET /api/accounts/:id/oauth-url
 * Get OAuth authorization URL for account connection
 * Query: ?redirectUri=...
 */
accountsRouter.get("/:id/oauth-url", async (req: Request, res: Response) => {
  try {
    const redirectUri = req.query.redirectUri as string;

    if (!redirectUri) {
      return res.status(400).json({
        success: false,
        error: "Missing redirectUri query parameter",
      });
    }

    const threadsService = new ThreadsService();
    const oauthUrl = threadsService.getOAuthUrl(redirectUri);

    res.json({
      success: true,
      data: {
        url: oauthUrl,
      },
    });
  } catch (error) {
    logger.error("Error generating OAuth URL:", error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to generate OAuth URL",
    });
  }
});

/**
 * GET /api/accounts/health/check-tokens
 * Check token expiration status for all user accounts
 * Admin endpoint to monitor account health
 */
accountsRouter.get(
  "/health/check-tokens",
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id || (req as any).userId;
      logger.debug(`Checking token health for user: ${userId}`);

      const accounts = await credentialService.getUserAccounts(userId);

      const tokenStatus = accounts.map((account) => ({
        id: account._id,
        accountName: account.accountName,
        status: account.status,
        expiresAt: account.expiresAt,
        isExpired: account.expiresAt ? account.expiresAt < new Date() : false,
        hoursUntilExpiration: account.expiresAt
          ? Math.round(
            (account.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)
          )
          : null,
        lastError: account.lastError || null,
      }));

      res.json({
        success: true,
        data: tokenStatus,
      });
    } catch (error) {
      logger.error("Error checking token health:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to check token health",
      });
    }
  }
);
