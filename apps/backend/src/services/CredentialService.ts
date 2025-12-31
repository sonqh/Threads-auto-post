import { logger } from "../config/logger.js";
import {
  ThreadsCredential,
  IThreadsCredential,
  CredentialStatus,
} from "../models/ThreadsCredential.js";
import { ThreadsService } from "./ThreadsService.js";

/**
 * Service for managing multiple Threads accounts per user
 * Handles account selection, default account logic, and token refresh
 */
export class CredentialService {
  /**
   * Get all accounts for a user
   */
  async getUserAccounts(userId: string): Promise<IThreadsCredential[]> {
    logger.debug(`Fetching all accounts for user: ${userId}`);

    const accounts = await ThreadsCredential.find({ userId }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    logger.debug(`Found ${accounts.length} accounts for user ${userId}`);
    return accounts;
  }

  /**
   * Get all active accounts for a user
   */
  async getUserActiveAccounts(userId: string): Promise<IThreadsCredential[]> {
    logger.debug(`Fetching active accounts for user: ${userId}`);

    const accounts = await ThreadsCredential.find({
      userId,
      status: CredentialStatus.ACTIVE,
    }).sort({ isDefault: -1, createdAt: -1 });

    return accounts;
  }

  /**
   * Get default account for user
   * Falls back to first active account if no default is set
   */
  async getDefaultAccount(userId: string): Promise<IThreadsCredential> {
    logger.debug(`Getting default account for user: ${userId}`);

    // Try to find account marked as default
    let credential = await ThreadsCredential.findOne({
      userId,
      isDefault: true,
      status: CredentialStatus.ACTIVE,
    });

    // Fallback to first active account
    if (!credential) {
      logger.debug(
        `No default account found, looking for first active account for user: ${userId}`
      );
      credential = await ThreadsCredential.findOne({
        userId,
        status: CredentialStatus.ACTIVE,
      }).sort({ createdAt: 1 });
    }

    if (!credential) {
      const error = new Error(
        `No active Threads account found for user ${userId}`
      );
      logger.error(`${error.message}`);
      throw error;
    }

    logger.debug(
      `Default account for user ${userId}: ${credential.accountName}`
    );
    return credential;
  }

  /**
   * Get specific account by ID
   * Validates user ownership
   */
  async getAccount(
    accountId: string,
    userId: string
  ): Promise<IThreadsCredential> {
    logger.debug(`Getting account ${accountId} for user ${userId}`);

    const credential = await ThreadsCredential.findById(accountId);

    if (!credential) {
      const error = new Error(`Account ${accountId} not found`);
      logger.error(error.message);
      throw error;
    }

    if (credential.userId !== userId) {
      const error = new Error(
        `Access denied: Account does not belong to user ${userId}`
      );
      logger.error(error.message);
      throw error;
    }

    return credential;
  }

  /**
   * Get account by Threads user ID
   */
  async getAccountByThreadsUserId(
    threadsUserId: string
  ): Promise<IThreadsCredential | null> {
    return ThreadsCredential.findOne({ threadsUserId });
  }

  /**
   * Add new account for user
   * Validates that Threads account isn't already linked to another user
   */
  async addAccount(
    userId: string,
    accountData: {
      threadsUserId: string;
      threadsUserName: string;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      accessToken: string;
      refreshToken?: string;
      longLivedAccessToken?: string;
      expiresAt?: Date;
      longLivedExpiresAt?: Date;
      scope?: string[];
      accountName: string;
      accountDescription?: string;
      isDefault?: boolean;
    }
  ): Promise<IThreadsCredential> {
    logger.info(
      `Adding new account for user ${userId}: ${accountData.accountName}`
    );

    // Check if Threads account is already linked to another user
    const existingCredential = await ThreadsCredential.findOne({
      threadsUserId: accountData.threadsUserId,
    });

    if (existingCredential && existingCredential.userId !== userId) {
      const error = new Error(
        `This Threads account (@${accountData.threadsUserName}) is already linked to another user`
      );
      logger.warn(error.message);
      throw error;
    }

    // If first account for this user, make it default
    const userAccountCount = await ThreadsCredential.countDocuments({
      userId,
    });

    const isDefault = userAccountCount === 0 || accountData.isDefault === true;

    // If making this default, remove default from others
    if (isDefault) {
      await ThreadsCredential.updateMany({ userId }, { isDefault: false });
    }

    const credential = new ThreadsCredential({
      userId,
      ...accountData,
      isDefault,
      status: CredentialStatus.ACTIVE,
    });

    const saved = await credential.save();
    logger.info(
      `Account added: ${saved.accountName} (${saved._id}) for user ${userId}`
    );

    return saved;
  }

  /**
   * Update account details (name, description)
   */
  async updateAccount(
    accountId: string,
    userId: string,
    updates: {
      accountName?: string;
      accountDescription?: string;
    }
  ): Promise<IThreadsCredential> {
    logger.info(`Updating account ${accountId} for user ${userId}`);

    const credential = await this.getAccount(accountId, userId);

    if (updates.accountName) {
      credential.accountName = updates.accountName;
    }
    if (updates.accountDescription !== undefined) {
      credential.accountDescription = updates.accountDescription;
    }

    const saved = await credential.save();
    logger.info(`Account ${accountId} updated`);

    return saved;
  }

  /**
   * Set account as default for user
   */
  async setDefaultAccount(
    accountId: string,
    userId: string
  ): Promise<IThreadsCredential> {
    logger.info(`Setting account ${accountId} as default for user ${userId}`);

    // Validate user owns this account
    const credential = await this.getAccount(accountId, userId);

    // Remove default flag from all user's accounts
    await ThreadsCredential.updateMany({ userId }, { isDefault: false });

    // Set new default
    credential.isDefault = true;
    const saved = await credential.save();

    logger.info(
      `Account ${accountId} (${credential.accountName}) set as default for user ${userId}`
    );
    return saved;
  }

  /**
   * Delete/disconnect account
   * Prevents deleting if it's the only active account
   */
  async deleteAccount(accountId: string, userId: string): Promise<void> {
    logger.info(`Deleting account ${accountId} for user ${userId}`);

    const credential = await this.getAccount(accountId, userId);

    // Check if it's the only active account
    const activeCount = await ThreadsCredential.countDocuments({
      userId,
      status: CredentialStatus.ACTIVE,
    });

    if (activeCount === 1) {
      const error = new Error(
        `Cannot delete the only active account. Connect another account first.`
      );
      logger.warn(error.message);
      throw error;
    }

    // If this was the default, set another as default
    if (credential.isDefault) {
      const nextDefault = await ThreadsCredential.findOne({
        userId,
        _id: { $ne: accountId },
        status: CredentialStatus.ACTIVE,
      }).sort({ createdAt: 1 });

      if (nextDefault) {
        nextDefault.isDefault = true;
        await nextDefault.save();
        logger.debug(`Set ${nextDefault.accountName} as new default account`);
      }
    }

    await ThreadsCredential.findByIdAndDelete(accountId);
    logger.info(
      `Account ${accountId} (${credential.accountName}) deleted for user ${userId}`
    );
  }

  /**
   * Refresh token for specific account
   * Updates access token and expiration times
   */
  async refreshAccountToken(accountId: string): Promise<IThreadsCredential> {
    logger.info(`Refreshing token for account ${accountId}`);

    const credential = await ThreadsCredential.findById(accountId);

    if (!credential) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      const threadsService = new ThreadsService();
      await threadsService.refreshToken(credential);

      logger.info(`Token refreshed for account ${accountId}`);

      return credential;
    } catch (error) {
      logger.error(`Failed to refresh token for account ${accountId}:`, error);

      credential.errorCount++;
      credential.lastError =
        error instanceof Error ? error.message : String(error);
      credential.status = CredentialStatus.EXPIRED;

      await credential.save();
      throw error;
    }
  }

  /**
   * Check and refresh token if expired
   * Returns the credential (refreshed or not)
   */
  async ensureValidToken(
    credential: IThreadsCredential
  ): Promise<IThreadsCredential> {
    if (credential.expiresAt && credential.expiresAt < new Date()) {
      logger.debug(
        `Token expired for account ${credential._id}, refreshing...`
      );
      return this.refreshAccountToken(credential._id.toString());
    }

    return credential;
  }

  /**
   * Get account by Threads user ID (for publishing)
   * Checks and refreshes token if needed
   */
  async getAccountForPublishing(
    threadsUserId: string
  ): Promise<IThreadsCredential> {
    const credential = await this.getAccountByThreadsUserId(threadsUserId);

    if (!credential) {
      throw new Error(`No account found for Threads user ID: ${threadsUserId}`);
    }

    // Ensure token is valid
    return this.ensureValidToken(credential);
  }

  /**
   * Get all expired accounts that need refresh
   */
  async getExpiredAccounts(): Promise<IThreadsCredential[]> {
    const now = new Date();
    return ThreadsCredential.find({
      expiresAt: { $lt: now },
      status: CredentialStatus.ACTIVE,
    });
  }

  /**
   * Refresh all expired tokens
   */
  async refreshExpiredTokens(): Promise<{
    succeeded: number;
    failed: number;
  }> {
    logger.info("Starting token refresh for expired accounts");

    const expiredAccounts = await this.getExpiredAccounts();
    logger.debug(`Found ${expiredAccounts.length} expired accounts`);

    let succeeded = 0;
    let failed = 0;

    for (const account of expiredAccounts) {
      try {
        await this.refreshAccountToken(account._id.toString());
        succeeded++;
      } catch (error) {
        logger.error(
          `Failed to refresh account ${account._id}:`,
          error instanceof Error ? error.message : String(error)
        );
        failed++;
      }
    }

    logger.info(
      `Token refresh complete: ${succeeded} succeeded, ${failed} failed`
    );

    return { succeeded, failed };
  }

  /**
   * Verify account connection (OAuth flow)
   * Called after OAuth redirect to verify and store credentials
   */
  async verifyAndStoreCredential(
    userId: string,
    oauthData: {
      code: string;
      redirectUri: string;
    },
    accountMetadata: {
      accountName: string;
      accountDescription?: string;
      isDefault?: boolean;
    }
  ): Promise<IThreadsCredential> {
    logger.info(`Verifying OAuth code for user ${userId}`);

    const threadsService = new ThreadsService();

    // Exchange code for tokens
    const tokenData = await threadsService.exchangeCodeForToken(
      process.env.THREADS_CLIENT_ID || "",
      process.env.THREADS_CLIENT_SECRET || "",
      oauthData.code,
      oauthData.redirectUri
    );

    logger.debug(`Got user info: ${tokenData.userName} (${tokenData.userId})`);

    // Store/update credential
    const credential = await this.addAccount(userId, {
      threadsUserId: tokenData.userId,
      threadsUserName: tokenData.userName,
      clientId: process.env.THREADS_CLIENT_ID || "",
      clientSecret: process.env.THREADS_CLIENT_SECRET || "",
      redirectUri: oauthData.redirectUri,
      accessToken: tokenData.accessToken,
      ...accountMetadata,
    });

    logger.info(
      `Credential verified and stored for user ${userId}: ${credential.accountName}`
    );

    return credential;
  }
}

export const credentialService = new CredentialService();
