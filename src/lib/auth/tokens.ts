import { SignJWT, jwtVerify } from "jose";

const rawChallengeSecret = process.env.AUTH_CHALLENGE_SECRET;
if (!rawChallengeSecret) throw new Error("AUTH_CHALLENGE_SECRET environment variable is required");
const CHALLENGE_SECRET = new TextEncoder().encode(rawChallengeSecret);

const rawSessionSecret = process.env.AUTH_SESSION_SECRET;
if (!rawSessionSecret) throw new Error("AUTH_SESSION_SECRET environment variable is required");
const SESSION_SECRET = new TextEncoder().encode(rawSessionSecret);

const ISSUER = "finance-automations-auth";

export const CHALLENGE_COOKIE_NAME = "fa_otp_challenge";
export const CHALLENGE_COOKIE_MAX_AGE = 60 * 10; // 10 minutes
export const CHALLENGE_COOKIE_PATH = "/api/auth";

export const SESSION_COOKIE_NAME = "fa_session";
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

export const MAX_OTP_ATTEMPTS = 5;

export interface ChallengePayload {
  email: string;
  codeHash: string;
  attempts: number;
}

export interface SessionPayload {
  email: string;
}

export async function signChallengeToken(payload: ChallengePayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(`${CHALLENGE_COOKIE_MAX_AGE}s`)
    .sign(CHALLENGE_SECRET);
}

export async function verifyChallengeToken(token: string): Promise<ChallengePayload | null> {
  try {
    const { payload } = await jwtVerify(token, CHALLENGE_SECRET, { issuer: ISSUER });
    if (
      typeof payload.email !== "string" ||
      typeof payload.codeHash !== "string" ||
      typeof payload.attempts !== "number"
    ) {
      return null;
    }
    return { email: payload.email, codeHash: payload.codeHash, attempts: payload.attempts };
  } catch {
    return null;
  }
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(`${SESSION_COOKIE_MAX_AGE}s`)
    .sign(SESSION_SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET, { issuer: ISSUER });
    if (typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
