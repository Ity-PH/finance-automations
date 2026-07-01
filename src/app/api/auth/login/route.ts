import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { getClientIp } from "@/lib/auth/client-ip";
import { sendOtpEmail } from "@/lib/email/sendOtpEmail";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { checkRateLimit, recordViolation } from "@/lib/auth/rate-limit";
import {
  CHALLENGE_COOKIE_MAX_AGE,
  CHALLENGE_COOKIE_NAME,
  CHALLENGE_COOKIE_PATH,
  signChallengeToken,
} from "@/lib/auth/tokens";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email() });

const GENERIC_MESSAGE = "If this address is authorized, a login code has been sent.";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip, "auth/login");
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
    recordViolation(ip, "auth/login");
    return NextResponse.json({ success: false, error: "Valid email required" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const response = NextResponse.json({ success: true, message: GENERIC_MESSAGE });

  if (!isAllowedEmail(email)) {
    return response;
  }

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code);
  const token = await signChallengeToken({ email, codeHash, attempts: 0 });

  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error("Failed to send OTP email:", err);
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ success: false, error: "Failed to send login code" }, { status: 502 });
    }
    // Local dev without email creds configured: let the flow continue so the
    // code can be copied from the server console instead of a real inbox.
    console.warn(`[dev] OTP code for ${email}: ${code}`);
  }

  response.cookies.set(CHALLENGE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CHALLENGE_COOKIE_MAX_AGE,
    path: CHALLENGE_COOKIE_PATH,
  });

  return response;
}
