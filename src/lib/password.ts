import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

/** Hash a password with scrypt (salt$hash). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

/** Random opaque token for sessions / invites / resets. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Tokens are stored hashed so a database leak cannot be replayed. */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Short classroom code without easily confused characters (I/O/0/1). */
const ATTENDANCE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newAttendanceCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += ATTENDANCE_CODE_ALPHABET[randomInt(ATTENDANCE_CODE_ALPHABET.length)];
  }
  return code;
}
