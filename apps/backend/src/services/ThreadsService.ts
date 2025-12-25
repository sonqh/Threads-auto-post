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

export class ThreadsService {
  private apiVersion: string = "v1.0";
  private baseUrl: string = `https://graph.threads.net/${this.apiVersion}`;
  private tokenUrl: string = "https://graph.threads.net/access_token";

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
  async getValidCredential(threadsUserId: string): Promise<IThreadsCredential> {
    const credential = await ThreadsCredential.findOne({
      threadsUserId,
      status: CredentialStatus.ACTIVE,
    });

    if (!credential) {
      throw new Error(
        `No active credential found for Threads user ${threadsUserId}`
      );
    }

    // Check if token is about to expire (within 1 hour)
    if (
      credential.expiresAt &&
      credential.expiresAt.getTime() < Date.now() + 3600000
    ) {
      await this.refreshToken(credential);
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
