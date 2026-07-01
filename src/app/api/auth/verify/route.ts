import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/lib/auth/client-ip";
import { verifyOtpCode } from "@/lib/auth/otp";
import { checkRateLimit, recordViolation } from "@/lib/auth/rate-limit";
import {
  CHALLENGE_COOKIE_NAME,
  CHALLENGE_COOKIE_MAX_AGE,
  CHALLENGE_COOKIE_PATH,
  MAX_OTP_ATTEMPTS,
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
  signChallengeToken,
  signSessionToken,
  verifyChallengeToken,
} from "@/lib/auth/tokens";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  code: z.string().length(6).regex(/^\d{6}$/),
});

function clearChallengeCookie(response: NextResponse) {
  response.cookies.set(CHALLENGE_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: CHALLENGE_COOKIE_PATH,
  });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip, "auth/verify");
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    recordViolation(ip, "auth/verify");
    return NextResponse.json({ success: false, error: "Email and 6-digit code required" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const challengeToken = request.cookies.get(CHALLENGE_COOKIE_NAME)?.value;

  if (!challengeToken) {
    return NextResponse.json(
      { success: false, error: "No active login request. Please request a new code." },
      { status: 400 },
    );
  }

  const challenge = await verifyChallengeToken(challengeToken);
  if (!challenge || challenge.email !== email) {
    recordViolation(ip, "auth/verify");
    const response = NextResponse.json(
      { success: false, error: "Code expired or invalid. Please request a new code." },
      { status: 400 },
    );
    clearChallengeCookie(response);
    return response;
  }

  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    const response = NextResponse.json(
      { success: false, error: "Too many incorrect attempts. Please request a new code." },
      { status: 400 },
    );
    clearChallengeCookie(response);
    return response;
  }

  const isMatch = await verifyOtpCode(parsed.data.code, challenge.codeHash);

  if (!isMatch) {
    recordViolation(ip, "auth/verify");
    const attempts = challenge.attempts + 1;

    if (attempts >= MAX_OTP_ATTEMPTS) {
      const response = NextResponse.json(
        { success: false, error: "Too many incorrect attempts. Please request a new code." },
        { status: 400 },
      );
      clearChallengeCookie(response);
      return response;
    }

    const response = NextResponse.json(
      {
        success: false,
        error: "Incorrect code.",
        remainingAttempts: MAX_OTP_ATTEMPTS - attempts,
      },
      { status: 400 },
    );
    const nextToken = await signChallengeToken({ ...challenge, attempts });
    response.cookies.set(CHALLENGE_COOKIE_NAME, nextToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: CHALLENGE_COOKIE_MAX_AGE,
      path: CHALLENGE_COOKIE_PATH,
    });
    return response;
  }

  const sessionToken = await signSessionToken({ email });
  const response = NextResponse.json({ success: true, email });

  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: "/",
  });
  clearChallengeCookie(response);

  return response;
}
