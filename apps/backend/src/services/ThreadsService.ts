import axios, { AxiosError } from "axios";
import {
  ThreadsCredential,
  IThreadsCredential,
  CredentialStatus,
} from "../models/ThreadsCredential.js";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface MeResponse {
  id: string;
  username: string;
  name?: string;
}

// In-memory token cache for automatic refresh
interface TokenCache {
  accessToken: string;
  expiresAt: Date;
  isRefreshing: boolean;
}

const tokenCache: TokenCache = {
  accessToken: process.env.THREADS_ACCESS_TOKEN || "",
  expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days default
  isRefreshing: false,
};

export class ThreadsService {
  private apiVersion: string = "v1.0";
  private baseUrl: string = `https://graph.threads.net/${this.apiVersion}`;
  private tokenUrl: string = "https://graph.threads.net/access_token";

  /**
   * Get valid token, automatically refresh if expired
   */
  private async getValidToken(): Promise<string> {
    const now = new Date();
    const bufferTime = 24 * 60 * 60 * 1000; // Refresh 1 day before expiration

    // Check if token is about to expire
    if (now.getTime() >= tokenCache.expiresAt.getTime() - bufferTime) {
      if (!tokenCache.isRefreshing) {
        console.log("Token expired or about to expire, refreshing...");
        await this.refreshTokenAutomatically();
      } else {
        // Wait for ongoing refresh
        while (tokenCache.isRefreshing) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    return tokenCache.accessToken;
  }

  /**
   * Automatically refresh the access token
   */
  private async refreshTokenAutomatically(): Promise<void> {
    if (tokenCache.isRefreshing) return;

    tokenCache.isRefreshing = true;

    try {
      const clientSecret = process.env.THREADS_CLIENT_SECRET;
      const currentToken = tokenCache.accessToken;

      if (!clientSecret) {
        throw new Error("THREADS_CLIENT_SECRET not configured");
      }

      console.log("Exchanging token for long-lived access token...");

      const response = await axios.post<TokenResponse>(this.tokenUrl, {
        grant_type: "th_exchange_token",
        client_secret: clientSecret,
        access_token: currentToken,
      });

      const newToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 5184000; // Default 60 days in seconds

      // Update cache
      tokenCache.accessToken = newToken;
      tokenCache.expiresAt = new Date(Date.now() + expiresIn * 1000);

      console.log(" Token refreshed successfully!");
      console.log(
        `📅 New token expires at: ${tokenCache.expiresAt.toLocaleString()}`
      );
      console.log(
        "💡 Consider updating THREADS_ACCESS_TOKEN in your .env file with:"
      );
      console.log(`   ${newToken}`);

      // TODO: When database is implemented, save the new token to DB
    } catch (error: any) {
      console.error("Failed to refresh token automatically");

      if (error.response?.data) {
        const apiError = error.response.data.error;
        console.error(
          "Error details:",
          apiError?.message || apiError?.error_user_msg
        );

        if (apiError?.code === 190 || apiError?.message?.includes("expired")) {
          console.error(
            "\nToken cannot be refreshed. You need to generate a new token."
          );
          console.error("Follow the instructions in TOKEN_REFRESH_GUIDE.md");
        }
      }

      throw error;
    } finally {
      tokenCache.isRefreshing = false;
    }
  }

  /**
   * Exchange authorization code for access token (OAuth callback)
   */
  async exchangeCodeForToken(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string
  ): Promise<{ accessToken: string; userId: string; userName: string }> {
    try {
      // Step 1: Exchange code for short-lived token
      const tokenResponse = await axios.post(this.tokenUrl, {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      });

      const shortLivedToken = tokenResponse.data.access_token;

      // Step 2: Exchange short-lived token for long-lived token
      const longLivedResponse = await axios.post(this.tokenUrl, {
        grant_type: "th_exchange_token",
        client_secret: clientSecret,
        access_token: shortLivedToken,
      });

      const longLivedToken = longLivedResponse.data.access_token;
      const expiresIn = longLivedResponse.data.expires_in || 5184000; // 60 days default

      // Step 3: Get user info
      const meResponse = await axios.get<MeResponse>(`${this.baseUrl}/me`, {
        params: { access_token: longLivedToken },
      });

      const userId = meResponse.data.id;
      const userName = meResponse.data.username;

      // Step 4: Save credentials
      await this.saveCredential({
        clientId,
        clientSecret,
        redirectUri,
        accessToken: longLivedToken,
        threadsUserId: userId,
        threadsUserName: userName,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        scope: ["threads_basic_access", "threads_manage_metadata"],
        status: CredentialStatus.ACTIVE,
        errorCount: 0,
      });

      return {
        accessToken: longLivedToken,
        userId,
        userName,
      };
    } catch (error) {
      const message = this.extractErrorMessage(error);
      throw new Error(`Failed to exchange code for token: ${message}`);
    }
  }

  /**
   * Refresh access token using refresh_token or long-lived token
   */
  async refreshToken(credential: IThreadsCredential): Promise<void> {
    try {
      const refreshResponse = await axios.post(this.tokenUrl, {
        grant_type: "th_refresh_token",
        access_token: credential.refreshToken || credential.accessToken,
      });

      const newAccessToken = refreshResponse.data.access_token;
      const expiresIn = refreshResponse.data.expires_in || 5184000;

      // Update credential
      credential.accessToken = newAccessToken;
      credential.expiresAt = new Date(Date.now() + expiresIn * 1000);
      credential.lastRefreshedAt = new Date();
      credential.errorCount = 0;
      credential.lastError = undefined;
      credential.status = CredentialStatus.ACTIVE;

      await credential.save();
    } catch (error) {
      const message = this.extractErrorMessage(error);

      // Update error count
      credential.errorCount += 1;
      credential.lastError = message;

      // Revoke after 3 failed refresh attempts
      if (credential.errorCount >= 3) {
        credential.status = CredentialStatus.REVOKED;
      }

      await credential.save();
      throw new Error(`Failed to refresh token: ${message}`);
    }
  }

  /**
   * Get credential by Threads user ID, refresh if needed
   */
  /**
   * Get valid credential (using environment variables for now)
   */
  async getValidCredential(threadsUserId: string): Promise<IThreadsCredential> {
    // Get a valid token (will auto-refresh if needed)
    const validToken = await this.getValidToken();

    // For now, use environment variables instead of database lookup
    // This assumes the user is always the one from the environment
    const credential = {
      threadsUserId: process.env.THREADS_USER_ID || threadsUserId,
      accessToken: validToken,
      clientId: process.env.THREADS_CLIENT_ID || "",
      clientSecret: process.env.THREADS_CLIENT_SECRET || "",
      redirectUri: process.env.THREADS_REDIRECT_URI || "",
      status: CredentialStatus.ACTIVE,
      scope: [],
      errorCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IThreadsCredential;

    if (!credential.accessToken) {
      throw new Error(
        `THREADS_ACCESS_TOKEN not configured in environment variables`
      );
    }

    if (!credential.threadsUserId) {
      throw new Error(
        `THREADS_USER_ID not configured in environment variables`
      );
    }

    return credential;
  }

  /**
   * Get all active credentials
   */
  async getAllCredentials(): Promise<IThreadsCredential[]> {
    return ThreadsCredential.find({
      status: CredentialStatus.ACTIVE,
    }).sort({ createdAt: -1 });
  }

  /**
   * Save or update credential
   */
  async saveCredential(
    data: Partial<IThreadsCredential>
  ): Promise<IThreadsCredential> {
    const existingCredential = await ThreadsCredential.findOne({
      threadsUserId: data.threadsUserId,
    });

    if (existingCredential) {
      Object.assign(existingCredential, data);
      return existingCredential.save();
    }

    const credential = new ThreadsCredential(data);
    return credential.save();
  }

  /**
   * Revoke credential
   */
  async revokeCredential(threadsUserId: string): Promise<void> {
    const credential = await ThreadsCredential.findOne({
      threadsUserId,
    });

    if (credential) {
      credential.status = CredentialStatus.REVOKED;
      await credential.save();
    }
  }

  /**
   * Verify credential is valid by calling Threads API
   */
  async verifyCredential(credential: IThreadsCredential): Promise<boolean> {
    try {
      const response = await axios.get<MeResponse>(`${this.baseUrl}/me`, {
        params: { access_token: credential.accessToken },
        timeout: 5000,
      });

      return response.data.id === credential.threadsUserId;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract error message from various error types
   */
  private extractErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      return (
        error.response?.data?.error_description ||
        error.response?.data?.error ||
        error.message
      );
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

export const threadsService = new ThreadsService();
