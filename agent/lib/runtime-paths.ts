/**
 * Runtime path helpers for local vs Vercel serverless.
 * Next API routes on Vercel can only write under /tmp.
 */

export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NOW_REGION,
  );
}

/** Prefer Turso when set; otherwise use /tmp for file DBs on serverless. */
export function resolveRuntimeDatabaseUrl(
  configured = process.env.DATABASE_URL,
): string {
  const fallback = "file:./data/gravy-scout.db";
  const url = configured?.trim() || fallback;

  if (!url.startsWith("file:")) {
    return url;
  }

  if (!isServerlessRuntime()) {
    return url;
  }

  // Already pointed at /tmp
  if (url.includes("/tmp/")) {
    return url;
  }

  return "file:/tmp/gravy-scout.db";
}

export function resolveRuntimeProfilePath(
  configured = process.env.USER_PROFILE_PATH,
): string {
  if (configured?.trim()) {
    return configured.trim();
  }

  if (isServerlessRuntime()) {
    return "/tmp/gravy-scout-user-profile.md";
  }

  return "agent/sandbox/workspace/memory/user-profile.md";
}
