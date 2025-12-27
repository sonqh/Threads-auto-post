import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  config: () => {
    // Try to load from backend root directory first
    const envPath = path.resolve(__dirname, "../../.env");
    const result = dotenv.config({ path: envPath });

    if (result.error) {
      console.warn(
        `.env file not found at ${envPath}, trying current directory`
      );
      // Fallback to current directory
      const fallbackResult = dotenv.config({ path: ".env" });

      if (fallbackResult.error) {
        console.warn("No .env file found, using environment variables only");
      } else {
        console.log(" Loaded configuration from current directory .env");
      }
    } else {
      console.log(" Loaded configuration from backend .env");
    }
  },
};
