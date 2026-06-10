import fs from "node:fs";
import path from "node:path";

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

const root = process.cwd();
loadDotEnv(path.join(root, ".env"));
loadDotEnv(path.join(root, ".env.local"));

const apiKey = process.env.ZOTERO_API_KEY ?? "";

if (!apiKey) {
  console.error("ZOTERO_API_KEY is missing.");
  console.error("Create one at https://www.zotero.org/settings/keys/new");
  console.error("Required access: personal library read/write, or group library read/write if using a group.");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch("https://api.zotero.org/keys/current", {
      headers: {
        "Zotero-API-Key": apiKey,
        "Zotero-API-Version": "3",
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      console.error(`Zotero key lookup failed: ${response.status} ${response.statusText}`);
      console.error(JSON.stringify(payload, null, 2));
      process.exitCode = 1;
    } else {
      console.log("Zotero API key is valid.");
      console.log(`Username: ${payload.username ?? "(unknown)"}`);
      console.log(`User library ID: ${payload.userID}`);
      console.log("");
      console.log("Put these in .env.local:");
      console.log("ZOTERO_LIBRARY_TYPE=user");
      console.log(`ZOTERO_LIBRARY_ID=${payload.userID}`);
      console.log("");
      console.log("For GitHub Actions, add the same values as repository secrets or variables.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
