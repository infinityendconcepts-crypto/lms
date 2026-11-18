"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  createSession,
  destroySession,
  getSession,
  requireUser,
  signIn,
  TENANT_COOKIE,
  throttle,
} from "@/lib/auth";
import { hashPassword, newToken, tokenHash } from "@/lib/password";
import { audit } from "@/lib/audit";
import { appUrl, sendEmail } from "@/lib/email";
import { TRIAL_DAYS } from "@/lib/plans";
import { randomSuffix, slugify } from "@/lib/utils";

export type AuthState = { error?: string; success?: string; devLink?: string } | null;

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 86400,
};

function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "";
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const limit = throttle(`login:${email}`, 10, 60_000);
  if (!limit.ok) return { error: "Too many attempts. Please wait a minute." };

  const user = await signIn(email, password);
  if (!user) {
    await audit({ action: "auth.login_failed", target: email });
    return { error: "Those credentials don't match. Try again." };
  }

  const first = await db.membership.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (first) {
    const jar = await cookies();
    jar.set(TENANT_COOKIE, first.tenantId, cookieOptions);
  }
  await audit({ actorId: user.id, tenantId: first?.tenantId, action: "auth.login" });

  redirect(safeNext(formData.get("next")) || (first ? "/dashboard" : "/admin"));
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const workspace = String(formData.get("workspace") ?? "").trim();
  const kind = String(formData.get("kind") ?? "SCHOOL") === "TEACHER" ? "TEACHER" : "SCHOOL";
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  const parsedPassword = passwordSchema.safeParse(formData.get("password"));

  if (name.length < 2) return { error: "Please enter your full name." };
  if (workspace.length < 2) return { error: "Please name your workspace." };
  if (!parsedEmail.success) return { error: "Enter a valid email address." };
  if (!parsedPassword.success) return { error: parsedPassword.error.issues[0]?.message };

  const email = parsedEmail.data;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with this email already exists. Sign in instead." };

  const base = slugify(workspace) || "workspace";
  let slug = base;
  for (let i = 0; i < 5; i++) {
    const clash = await db.tenant.findUnique({ where: { slug } });
    if (!clash) break;
    slug = `${base}-${randomSuffix()}`;
  }

  const passwordHash = await hashPassword(parsedPassword.data);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      memberships: {
        create: {
          role: "OWNER",
          tenant: {
            create: {
              name: workspace,
              slug,
              kind,
              headline:
                kind === "TEACHER"
                  ? "Live and self-paced math classes"
                  : "A modern learning space for every student",
              trialEndsAt,
              subscription: {
                create: {
                  plan: "GROWTH",
                  seats: 400,
                  status: "TRIALING",
                  currentPeriodEnd: trialEndsAt,
                },
              },
            },
          },
        },
      },
    },
    include: { memberships: true },
  });

  const tenantId = user.memberships[0]?.tenantId;
  await createSession(user.id);
  if (tenantId) {
    const jar = await cookies();
    jar.set(TENANT_COOKIE, tenantId, cookieOptions);
  }
  await audit({ tenantId, actorId: user.id, action: "workspace.created", meta: { kind } });
  await sendEmail({
    to: email,
    tenantId,
    kind: "WELCOME",
    subject: "Welcome to Nkanyezi",
    body: `Hi ${name}, your workspace "${workspace}" is ready. Start by creating your first course.`,
  });

  redirect("/dashboard?welcome=1");
}

export async function demoLoginAction(formData: FormData) {
  const role = String(formData.get("role") ?? "teacher");
  const map: Record<string, string> = {
    admin: "admin@nkanyezi.dev",
    teacher: "teacher@northfield.edu",
    student: "student@northfield.edu",
    owner: "owner@northfield.edu",
    solo: "maya@studiomath.io",
  };
  const email = map[role] ?? map.teacher;
  const user = await db.user.findUnique({ where: { email } });
  if (!user) redirect("/login?error=demo");

  const membership = await db.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  await createSession(user.id);
  if (membership) {
    const jar = await cookies();
    jar.set(TENANT_COOKIE, membership.tenantId, cookieOptions);
  }
  // Platform admins also hold a demo membership, but their one-click login
  // should open the cross-tenant admin area instead of a school dashboard.
  redirect(role === "admin" ? "/admin" : "/dashboard");
}

export async function logoutAction() {
  const session = await getSession();
  if (session) await audit({ actorId: session.user.id, action: "auth.logout" });
  await destroySession();
  redirect("/");
}

export async function requestResetAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };

  const user = await db.user.findUnique({ where: { email: parsed.data } });
  if (!user) {
    return { success: "If that email is registered, a reset link is on its way." };
  }

  const token = newToken();
  await db.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });

  const link = appUrl(`/reset-password?token=${token}`);
  await sendEmail({
    to: user.email,
    kind: "PASSWORD_RESET",
    subject: "Reset your Nkanyezi password",
    body: `Open this link within one hour to choose a new password:\n\n${link}`,
  });
  await audit({ actorId: user.id, action: "auth.reset_requested" });

  return {
    success: "If that email is registered, a reset link is on its way.",
    devLink: process.env.NODE_ENV !== "production" ? link : undefined,
  };
}

export async function resetPasswordAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const token = String(formData.get("token") ?? "");
  const password = passwordSchema.safeParse(formData.get("password"));
  const confirm = String(formData.get("confirm") ?? "");
  if (!password.success) return { error: password.error.issues[0]?.message };
  if (password.data !== confirm) return { error: "Passwords do not match." };

  const record = await db.passwordReset.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await hashPassword(password.data);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  await audit({ actorId: record.userId, action: "auth.password_reset" });

  return { success: "Password updated. You can sign in now." };
}

export async function updateProfileAction(formData: FormData) {
  const session = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const avatarUrl = String(formData.get("avatarUrl") ?? "").trim();
  if (name.length >= 2) {
    await db.user.update({
      where: { id: session.user.id },
      data: { name, avatarUrl: avatarUrl || null },
    });
    await audit({ actorId: session.user.id, action: "profile.updated" });
  }
  revalidatePath("/dashboard/settings");
}

export async function revokeSessionAction(formData: FormData) {
  const session = await requireUser();
  const id = String(formData.get("sessionId") ?? "");
  const target = await db.session.findUnique({ where: { id } });
  if (!target || target.userId !== session.user.id) return;

  await db.session.delete({ where: { id } });
  await audit({ actorId: session.user.id, action: "auth.session_revoked" });
  if (target.id === session.id) {
    await destroySession();
    redirect("/login");
  }
  revalidatePath("/dashboard/settings");
}
