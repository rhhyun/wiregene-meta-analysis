import { config, isProduction } from "./config";

export function isCronAuthorized(request: Request) {
  if (!config.cronSecret && !isProduction()) return true;
  if (!config.cronSecret) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const token = request.headers.get("x-cron-secret") ?? "";
  return authorization === `Bearer ${config.cronSecret}` || token === config.cronSecret;
}

export function isManualRunAllowed() {
  return !isProduction() || process.env.ALLOW_PUBLIC_RUN === "true";
}
