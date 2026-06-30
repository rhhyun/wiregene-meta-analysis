import http from "http";
import { AddressInfo } from "net";
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { refreshGoogleDriveOauthAccessToken } from "../src/lib/google-drive-oauth";

const googleOauthScopes = [
  "https://www.googleapis.com/auth/drive.file",
].join(" ");
const authUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenUrl = "https://oauth2.googleapis.com/token";
const tokenOutputPath = process.env.GOOGLE_DRIVE_REFRESH_TOKEN_OUT ?? "google-drive-refresh-token.local.txt";
const printToken = process.argv.includes("--print-token");
const applyVercelProduction = process.argv.includes("--vercel-production");
const deployVercelProduction = process.argv.includes("--deploy");
const vercelScope = argValue("--scope") ?? process.env.VERCEL_SCOPE ?? "rhhyuns-projects";

const localOAuthClient = readLocalGoogleOAuthClient();
const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID ?? localOAuthClient.clientId ?? "";
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? localOAuthClient.clientSecret ?? "";

if (!clientId || !clientSecret) {
  console.error(
    [
      "Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET first.",
      "Create an OAuth client in Google Cloud Console, then run this script locally.",
    ].join("\n"),
  );
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  const host = request.headers.host ?? "";
  const callbackUrl = new URL(request.url ?? "/", `http://${host}`);
  const code = callbackUrl.searchParams.get("code");
  const error = callbackUrl.searchParams.get("error");

  if (error) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Google authorization failed: ${error}`);
    server.close();
    return;
  }

  if (!code) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Waiting for Google OAuth callback.");
    return;
  }

  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });

    const payload = (await tokenResponse.json()) as {
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !payload.refresh_token) {
      throw new Error(
        payload.error_description ??
          payload.error ??
          `Token request failed with ${tokenResponse.status}`,
      );
    }

    await refreshGoogleDriveOauthAccessToken(payload.refresh_token, { clientId, clientSecret });
    writeFileSync(tokenOutputPath, `${payload.refresh_token}\n`, { encoding: "utf8" });

    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("Google Drive authorization complete and refresh token verified. You can close this tab.");
    console.log("\nGoogle Drive authorization complete and refresh token verified.");
    console.log(`Refresh token saved locally: ${tokenOutputPath}`);
    console.log(`Refresh token sha256 prefix: ${createHash("sha256").update(payload.refresh_token).digest("hex").slice(0, 12)}`);
    console.log("\nVercel/GitHub secret name:");
    console.log("GOOGLE_DRIVE_REFRESH_TOKEN");
    if (printToken) {
      console.log("\nSecret:");
      console.log(payload.refresh_token);
    } else {
      console.log("\nSecret value was not printed. Re-run with --print-token only when you intentionally need terminal copy/paste.");
    }
    console.log("\nKeep GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET configured too.");
    if (applyVercelProduction) {
      applyTokenToVercelProduction(payload.refresh_token);
      if (deployVercelProduction) deployProduction();
    }
  } catch (exchangeError) {
    const message = exchangeError instanceof Error ? exchangeError.message : String(exchangeError);
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Token exchange failed: ${message}`);
    console.error(`Token exchange failed: ${message}`);
  } finally {
    server.close();
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address() as AddressInfo;
  const url = new URL(authUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri(address.port));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleOauthScopes);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");

  console.log("Open this URL in your browser, sign in, and approve Google Drive access:");
  console.log(url.toString());
  console.log("\nWaiting for OAuth callback...");
});

function redirectUri(port?: number) {
  const address = server.address();
  const actualPort = port ?? (address && typeof address !== "string" ? address.port : 0);
  return `http://127.0.0.1:${actualPort}/oauth2callback`;
}

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : "";
}

function readLocalGoogleOAuthClient() {
  if (!existsSync("credentials.json")) return {};

  try {
    const payload = JSON.parse(readFileSync("credentials.json", "utf8")) as {
      installed?: { client_id?: string; client_secret?: string };
      web?: { client_id?: string; client_secret?: string };
      client_id?: string;
      client_secret?: string;
    };
    const source = payload.web ?? payload.installed ?? payload;
    return {
      clientId: source.client_id?.trim() || "",
      clientSecret: source.client_secret?.trim() || "",
    };
  } catch {
    return {};
  }
}

function applyTokenToVercelProduction(refreshToken: string) {
  const values: Record<string, string> = {
    GOOGLE_DRIVE_AUTH_MODE: "oauth",
    GOOGLE_DRIVE_CLIENT_ID: clientId,
    GOOGLE_DRIVE_CLIENT_SECRET: clientSecret,
    GOOGLE_DRIVE_REFRESH_TOKEN: refreshToken,
    GOOGLE_DRIVE_OAUTH_EXPECTED_CLIENT_ID: clientId,
    META_ALLOW_GOOGLE_DRIVE_STORAGE: "true",
    META_PROJECT_STORAGE_BACKEND: "google-drive",
    META_USER_PROJECTS_STORAGE_BACKEND: "google-drive",
    META_AI_SETTINGS_STORAGE_BACKEND: "google-drive",
    META_FULL_TEXT_HISTORY_STORAGE_BACKEND: "google-drive",
    META_FULL_TEXT_SOURCE_STORAGE_BACKEND: "google-drive",
  };
  for (const optionalKey of ["GOOGLE_DRIVE_FOLDER_ID", "GOOGLE_DRIVE_FOLDER_URL"]) {
    const value = process.env[optionalKey]?.trim();
    if (value) values[optionalKey] = value;
  }

  console.log("\nApplying verified Google Drive OAuth values to Vercel Production.");
  for (const [key, value] of Object.entries(values)) {
    runVercel(["env", "rm", key, "production", "--yes", "--scope", vercelScope], { allowFailure: true });
    runVercel(["env", "add", key, "production", "--scope", vercelScope], { input: `${value}\n` });
    const hash = createHash("sha256").update(value).digest("hex").slice(0, 12);
    console.log(`Updated ${key} in Vercel Production (sha256 prefix ${hash}).`);
  }
}

function deployProduction() {
  console.log("\nDeploying Vercel Production with updated Google Drive environment variables.");
  runVercel(["deploy", "--prod", "--yes", "--scope", vercelScope]);
}

function runVercel(args: string[], options: { input?: string; allowFailure?: boolean } = {}) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(executable, ["vercel", ...args], {
    input: options.input,
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`Vercel command failed: vercel ${args.join(" ")}`);
  }
}
