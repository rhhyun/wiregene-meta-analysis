export type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
  type?: string;
  project_id?: string;
  private_key_id?: string;
};

const requiredShape =
  'It should start with "{" and include "type": "service_account", "client_email", and "private_key".';

export function googleServiceAccountSecretHelp() {
  return [
    "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON must contain the full Google Cloud service-account key JSON.",
    requiredShape,
    "Do not paste the Drive folder id, Drive folder URL, service-account email, private key alone, or a local .json file path.",
  ].join(" ");
}

export function googleServiceAccountJsonFromEnv() {
  return process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
}

export function validateGoogleServiceAccountSecret(raw: string) {
  if (!raw) return null;

  try {
    parseGoogleServiceAccountSecret(raw);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is invalid. ${message}`;
  }
}

export function parseGoogleServiceAccountSecret(raw: string): GoogleServiceAccount {
  const input = normalize(raw);
  if (!input) throw new Error("The secret is empty.");

  if (input.includes("\uFFFD")) {
    throw new Error(
      [
        "The secret contains U+FFFD replacement characters, which usually means it was pasted with corrupted encoding.",
        "Delete and recreate the GitHub secret from the original service-account key JSON file.",
        "For GitHub Actions, the most reliable option is to store the base64-encoded JSON file contents.",
        googleServiceAccountSecretHelp(),
      ].join(" "),
    );
  }

  const likelyMistake = detectLikelyMistake(input);
  if (likelyMistake) throw new Error(`${likelyMistake} ${googleServiceAccountSecretHelp()}`);

  const jsonCandidates = expandJsonStringCandidates(input);
  for (const candidate of jsonCandidates) {
    const parsed = tryParseJson(candidate);
    if (parsed.ok) return assertGoogleServiceAccount(parsed.value);
  }

  const encodedCandidates = decodeEncodedCandidates(input);
  for (const encodedCandidate of encodedCandidates) {
    for (const candidate of expandJsonStringCandidates(encodedCandidate)) {
      const parsed = tryParseJson(candidate);
      if (parsed.ok) return assertGoogleServiceAccount(parsed.value);
    }
  }

  throw new Error(
    [
      "The value is not raw JSON, a quoted JSON string, a data URI, or base64-encoded JSON.",
      googleServiceAccountSecretHelp(),
    ].join(" "),
  );
}

function normalize(value: string) {
  return value.replace(/^\uFEFF/, "").trim();
}

function expandJsonStringCandidates(value: string) {
  const candidates = [value];
  const parsed = tryParseJson(value);
  if (parsed.ok && typeof parsed.value === "string") {
    candidates.push(normalize(parsed.value));
  }
  return Array.from(new Set(candidates));
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function decodeEncodedCandidates(value: string) {
  const candidates: string[] = [];
  const dataUriMatch = value.match(/^data:([^,]*),([\s\S]*)$/i);
  if (dataUriMatch?.[2]) {
    const metadata = dataUriMatch[1] ?? "";
    const payload = dataUriMatch[2].trim();
    if (metadata.toLowerCase().includes(";base64")) {
      const decoded = decodeBase64(payload);
      if (decoded) candidates.push(decoded);
    } else {
      try {
        candidates.push(normalize(decodeURIComponent(payload)));
      } catch {
        return candidates;
      }
    }
    return candidates;
  }

  const decoded = decodeBase64(value);
  if (decoded) candidates.push(decoded);
  return candidates;
}

function decodeBase64(value: string) {
  const encoded = value.replace(/\s/g, "");

  if (!encoded || !/^[A-Za-z0-9+/=_-]+$/.test(encoded)) return null;

  const standard = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  const decoded = normalize(Buffer.from(padded, "base64").toString("utf8"));
  if (!decoded.startsWith("{") && !decoded.startsWith('"')) return null;
  return decoded;
}

function detectLikelyMistake(value: string) {
  if (/^https?:\/\//i.test(value) || value.includes("/folders/")) {
    return "This looks like a Google Drive URL.";
  }

  if (/^[A-Za-z0-9_-]{20,}$/.test(value) && !value.includes(".")) {
    return "This looks like a Drive folder or file id.";
  }

  if (/\.json$/i.test(value) || /^[A-Za-z]:\\/.test(value) || value.startsWith("/")) {
    return "This looks like a local file path.";
  }

  if (value.includes("BEGIN PRIVATE KEY") && !value.includes("client_email")) {
    return "This looks like only the private key.";
  }

  if (/^[^@\s]+@[^@\s]+$/.test(value)) {
    return "This looks like an email address.";
  }

  return "";
}

function assertGoogleServiceAccount(value: unknown): GoogleServiceAccount {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`The parsed value is not a JSON object. ${googleServiceAccountSecretHelp()}`);
  }

  const account = value as Partial<GoogleServiceAccount>;
  if (!account.client_email || !account.private_key) {
    throw new Error(
      `The JSON object does not include both client_email and private_key. ${googleServiceAccountSecretHelp()}`,
    );
  }

  const privateKey = account.private_key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  if (!privateKey.includes("BEGIN PRIVATE KEY") && !privateKey.includes("BEGIN RSA PRIVATE KEY")) {
    throw new Error(
      `The private_key field does not look like a Google service-account private key. ${googleServiceAccountSecretHelp()}`,
    );
  }

  return {
    ...account,
    private_key: privateKey,
  } as GoogleServiceAccount;
}
