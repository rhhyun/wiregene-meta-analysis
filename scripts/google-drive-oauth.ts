import http from "http";
import { AddressInfo } from "net";
import { refreshGoogleDriveOauthAccessToken } from "../src/lib/google-drive-oauth";

const googleOauthScopes = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");
const authUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenUrl = "https://oauth2.googleapis.com/token";

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID ?? "";
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "";

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

    await refreshGoogleDriveOauthAccessToken(payload.refresh_token);

    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("Google Drive authorization complete and refresh token verified. You can close this tab.");
    console.log("\nAdd this GitHub repository secret:");
    console.log("\nName:");
    console.log("GOOGLE_DRIVE_REFRESH_TOKEN");
    console.log("\nSecret:");
    console.log(payload.refresh_token);
    console.log("\nKeep GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET configured too.");
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

  console.log("Open this URL in your browser, sign in, and approve Google Drive access:");
  console.log(url.toString());
  console.log("\nWaiting for OAuth callback...");
});

function redirectUri(port?: number) {
  const address = server.address();
  const actualPort = port ?? (address && typeof address !== "string" ? address.port : 0);
  return `http://127.0.0.1:${actualPort}/oauth2callback`;
}
