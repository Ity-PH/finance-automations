import { randomInt } from "crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

export function generateOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

export async function hashOtpCode(code: string): Promise<string> {
  return bcrypt.hash(code, BCRYPT_ROUNDS);
}

export async function verifyOtpCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
