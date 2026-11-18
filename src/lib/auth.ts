import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { newToken, tokenHash, verifyPassword } from "@/lib/password";

export const SESSION_COOKIE = "axiom_session";
export const TENANT_COOKIE = "axiom_tenant";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
};

export const getSession = cache(async () => {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(raw) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }
  return session;
});

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

function clientMeta(h: Headers) {
  return {
    userAgent: h.get("user-agent")?.slice(0, 250) ?? null,
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null,
  };
}

export async function createSession(userId: string) {
  const jar = await cookies();
  const h = await headers();
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const meta = clientMeta(h);

  await db.session.create({
    data: { userId, tokenHash: tokenHash(token), expiresAt, ...meta },
  });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });

  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    await db.session.deleteMany({ where: { tokenHash: tokenHash(raw) } });
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(TENANT_COOKIE);
}

export async function signIn(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  await createSession(user.id);
  return user;
}

/** Token-bucket-ish in-memory throttle for credential endpoints. */
const attempts = new Map<string, { count: number; resetAt: number }>();
export function throttle(key: string, limit = 8, windowMs = 60_000) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  entry.count += 1;
  if (entry.count > limit) return { ok: false, remaining: 0 };
  return { ok: true, remaining: limit - entry.count };
}
