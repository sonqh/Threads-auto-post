/**
 * Script to refresh Threads access token
 * Run this when your access token expires
 */

import axios from "axios";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, "../.env") });

async function refreshAccessToken() {
  const clientSecret = process.env.THREADS_CLIENT_SECRET;
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const refreshToken = process.env.THREADS_REFRESH_TOKEN;

  if (!clientSecret) {
    console.error("THREADS_CLIENT_SECRET not found in .env file");
    process.exit(1);
  }

  if (!accessToken && !refreshToken) {
    console.error(
      "Neither THREADS_ACCESS_TOKEN nor THREADS_REFRESH_TOKEN found in .env file"
    );
    process.exit(1);
  }

  try {
    console.log("Attempting to refresh access token...");
    console.log("Using refresh token:", refreshToken ? "Yes" : "No");
    console.log("Using access token:", accessToken ? "Yes" : "No");

    // Try to exchange for long-lived token first
    const response = await axios.post(
      "https://graph.threads.net/access_token",
      {
        grant_type: "th_exchange_token",
        client_secret: clientSecret,
        access_token: refreshToken || accessToken,
      }
    );

    console.log("Token refreshed successfully!");
    console.log("New token details:");
    console.log("Access Token:", response.data.access_token);
    console.log("Token Type:", response.data.token_type);
    console.log("Expires In:", response.data.expires_in, "seconds");

    if (response.data.expires_in) {
      const expirationDate = new Date(
        Date.now() + response.data.expires_in * 1000
      );
      console.log("Expires At:", expirationDate.toLocaleString());
    }

    console.log("Update your .env file with:");
    console.log("THREADS_ACCESS_TOKEN=" + response.data.access_token);

    if (response.data.refresh_token) {
      console.log("THREADS_REFRESH_TOKEN=" + response.data.refresh_token);
    }
  } catch (error) {
    console.error("Failed to refresh token");

    if (error.response?.data) {
      console.error(
        "Error details:",
        JSON.stringify(error.response.data, null, 2)
      );

      if (error.response.data.error) {
        const apiError = error.response.data.error;
        console.error(
          "Error message:",
          apiError.message || apiError.error_user_msg
        );

        if (
          apiError.code === 190 ||
          (apiError.message && apiError.message.includes("expired"))
        ) {
          console.error("Your token has expired and cannot be refreshed.");
          console.error("You need to get a new token by:");
          console.error("1. Go to https://developers.facebook.com/apps/");
          console.error("2. Select your app");
          console.error("3. Go to Threads API settings");
          console.error("4. Generate a new long-lived access token");
          console.error("5. Update your .env file with the new token");
        }
      }
    } else {
      console.error("Error:", error.message);
    }

    process.exit(1);
  }
}

refreshAccessToken();
