import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.AUTH_CHALLENGE_SECRET = "test-challenge-secret-0123456789abcdef";
  process.env.AUTH_SESSION_SECRET = "test-session-secret-0123456789abcdefgh";
});

describe("challenge/session tokens", () => {
  it("round-trips a signed challenge token", async () => {
    const { signChallengeToken, verifyChallengeToken } = await import("./tokens");
    const token = await signChallengeToken({
      email: "staff@twoserendra.com",
      codeHash: "some-hash",
      attempts: 0,
    });

    const payload = await verifyChallengeToken(token);
    expect(payload).toEqual({
      email: "staff@twoserendra.com",
      codeHash: "some-hash",
      attempts: 0,
    });
  });

  it("rejects a tampered challenge token", async () => {
    const { signChallengeToken, verifyChallengeToken } = await import("./tokens");
    const token = await signChallengeToken({
      email: "staff@twoserendra.com",
      codeHash: "some-hash",
      attempts: 0,
    });

    const tampered = token.slice(0, -4) + "abcd";
    expect(await verifyChallengeToken(tampered)).toBeNull();
  });

  it("rejects a challenge token signed with a different secret (session secret)", async () => {
    const { signSessionToken, verifyChallengeToken } = await import("./tokens");
    const sessionToken = await signSessionToken({ email: "staff@twoserendra.com" });
    expect(await verifyChallengeToken(sessionToken)).toBeNull();
  });

  it("round-trips a signed session token", async () => {
    const { signSessionToken, verifySessionToken } = await import("./tokens");
    const token = await signSessionToken({ email: "staff@twoserendra.com" });
    expect(await verifySessionToken(token)).toEqual({ email: "staff@twoserendra.com" });
  });
});

describe("otp hashing", () => {
  it("generates a 6-digit numeric code", async () => {
    const { generateOtpCode } = await import("./otp");
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("verifies a matching code and rejects a wrong one", async () => {
    const { hashOtpCode, verifyOtpCode } = await import("./otp");
    const hash = await hashOtpCode("123456");
    expect(await verifyOtpCode("123456", hash)).toBe(true);
    expect(await verifyOtpCode("654321", hash)).toBe(false);
  });
});

describe("allowlist", () => {
  it("matches case-insensitively and ignores whitespace", async () => {
    process.env.OTP_ALLOWLIST = " Staff@TwoSerendra.com , other@example.com";
    const { isAllowedEmail } = await import("./allowlist");
    expect(isAllowedEmail("staff@twoserendra.com")).toBe(true);
    expect(isAllowedEmail("nobody@twoserendra.com")).toBe(false);
  });
});
