function parseAllowlist(): Set<string> {
  const raw = process.env.OTP_ALLOWLIST ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedEmail(email: string): boolean {
  return parseAllowlist().has(email.trim().toLowerCase());
}
