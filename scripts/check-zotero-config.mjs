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

const missing = ["ZOTERO_API_KEY", "ZOTERO_LIBRARY_ID"].filter((key) => !process.env[key]);
const libraryType = process.env.ZOTERO_LIBRARY_TYPE || "user";
const invalid = libraryType === "user" || libraryType === "group" ? [] : ["ZOTERO_LIBRARY_TYPE"];

if (missing.length > 0 || invalid.length > 0) {
  console.error("Zotero config check failed.");
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
  }
  if (invalid.length > 0) {
    console.error(`Invalid env vars: ${invalid.join(", ")} must be either "user" or "group".`);
  }
  console.error("Set these values in CI secrets or .env.local before running Zotero sync.");
  process.exit(1);
}

console.log("Zotero config check passed.");
