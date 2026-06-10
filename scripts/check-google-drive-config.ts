import { validateGoogleDriveScheduledConfig } from "../src/lib/google-drive-config";
import { refreshGoogleDriveOauthAccessToken } from "../src/lib/google-drive-oauth";

const config = validateGoogleDriveScheduledConfig();

async function main() {
  for (const warning of config.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  if (!config.ok) {
    console.error("Missing or invalid GitHub Actions configuration:");
    for (const missing of config.missing) {
      console.error(` - Missing: ${missing}`);
    }
    for (const failure of config.failures) {
      console.error(` - ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  if (config.mode === "oauth") {
    try {
      await refreshGoogleDriveOauthAccessToken();
      console.log("Google Drive OAuth refresh token is valid.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Missing or invalid GitHub Actions configuration:");
      console.error(` - ${message}`);
      process.exitCode = 1;
      return;
    }
  }

  console.log(`Google Drive (${config.mode}) and NCBI configuration parsed successfully.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
