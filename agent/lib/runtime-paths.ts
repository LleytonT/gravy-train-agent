/** Runtime path helpers for the remaining prototype profile file. */

export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NOW_REGION,
  );
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
