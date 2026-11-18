"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant, atLeast, type Role } from "@/lib/tenant";
import { createSession, getSession, requireUser, TENANT_COOKIE } from "@/lib/auth";
import { hashPassword, newToken, tokenHash } from "@/lib/password";
import { assertSeatAvailable } from "@/lib/usage";
import { audit } from "@/lib/audit";
import { appUrl, sendEmail } from "@/lib/email";
import { randomSuffix, slugify } from "@/lib/utils";
import { TRIAL_DAYS } from "@/lib/plans";

const COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 86400,
};

export async function switchTenantAction(tenantId: string) {
  const session = await requireUser();
  const membership = await db.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId: session.user.id } },
  });
  if (!membership || membership.status !== "ACTIVE") throw new Error("Not a member");
  const jar = await cookies();
  jar.set(TENANT_COOKIE, tenantId, COOKIE);
  revalidatePath("/dashboard");
}

export async function updateWorkspaceAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const name = String(formData.get("name") ?? "").trim();
  const headline = String(formData.get("headline") ?? "").trim();
  const about = String(formData.get("about") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const rawColor = String(formData.get("brandColor") ?? "#4f46e5");
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : "#4f46e5";

  if (name.length < 2) redirect("/dashboard/settings?error=Workspace+name+is+too+short");

  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: {
      name,
      headline: headline || null,
      about: about || null,
      website: website || null,
      brandColor,
    },
  });
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "workspace.updated" });
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/settings?saved=1");
}

export async function inviteMemberAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  const role = String(formData.get("role") ?? "STUDENT") as Role;
  const courseId = String(formData.get("courseId") ?? "") || null;
  const allowed: Role[] = ["ADMIN", "TEACHER", "STUDENT"];

  if (!email.success) redirect("/dashboard/settings?tab=members&error=Enter+a+valid+email");
  if (!allowed.includes(role)) redirect("/dashboard/settings?tab=members&error=Invalid+role");

  const existingUser = await db.user.findUnique({ where: { email: email.data } });
  if (existingUser) {
    const existing = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId: ctx.tenant.id, userId: existingUser.id } },
    });
    if (existing) {
      redirect("/dashboard/settings?tab=members&error=That+person+is+already+a+member");
    }
  }

  if (role === "STUDENT") {
    try {
      await assertSeatAvailable(ctx.tenant.id);
    } catch (e) {
      redirect(
        `/dashboard/settings?tab=billing&error=${encodeURIComponent(
          e instanceof Error ? e.message : "Seat limit reached"
        )}`
      );
    }
  }

  let course = null;
  if (courseId) {
    course = await db.course.findFirst({ where: { id: courseId, tenantId: ctx.tenant.id } });
    if (!course) redirect("/dashboard/settings?tab=members&error=Course+not+found");
  }

  await db.invitation.deleteMany({
    where: { tenantId: ctx.tenant.id, email: email.data, acceptedAt: null },
  });

  const token = newToken();
  await db.invitation.create({
    data: {
      tenantId: ctx.tenant.id,
      email: email.data,
      role,
      courseId: course?.id ?? null,
      invitedById: ctx.user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });

  const link = appUrl(`/join/${token}`);
  await sendEmail({
    to: email.data,
    tenantId: ctx.tenant.id,
    kind: "INVITATION",
    subject: `${ctx.user.name} invited you to ${ctx.tenant.name}`,
    body: `You've been invited to join ${ctx.tenant.name} on Nkanyezi as ${role.toLowerCase()}.\n\nAccept your invitation:\n${link}\n\nThis link expires in 7 days.`,
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "member.invited",
    target: email.data,
    meta: { role, courseId },
  });

  revalidatePath("/dashboard/settings");
  redirect(`/dashboard/settings?tab=members&invited=${encodeURIComponent(email.data)}`);
}

export async function revokeInviteAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const id = String(formData.get("invitationId") ?? "");
  await db.invitation.deleteMany({ where: { id, tenantId: ctx.tenant.id } });
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "invitation.revoked" });
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?tab=members");
}

export async function changeRoleAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const membershipId = String(formData.get("membershipId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!["ADMIN", "TEACHER", "STUDENT"].includes(role)) return;

  const target = await db.membership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenant.id },
  });
  if (!target) return;
  if (target.role === "OWNER") return;
  if (target.userId === ctx.user.id) return;
  if (role === "ADMIN" && !atLeast(ctx.role, "OWNER") && target.role === "ADMIN") return;

  await db.membership.update({ where: { id: target.id }, data: { role } });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "member.role_changed",
    target: target.userId,
    meta: { role },
  });
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?tab=members&saved=1");
}

export async function removeMemberAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const membershipId = String(formData.get("membershipId") ?? "");
  const target = await db.membership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenant.id },
    include: { user: true },
  });
  if (!target || target.role === "OWNER" || target.userId === ctx.user.id) return;

  const courses = await db.course.findMany({
    where: { tenantId: ctx.tenant.id },
    select: { id: true },
  });
  await db.$transaction([
    db.enrollment.deleteMany({
      where: { userId: target.userId, courseId: { in: courses.map((c) => c.id) } },
    }),
    db.membership.delete({ where: { id: target.id } }),
  ]);
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "member.removed",
    target: target.user.email,
  });
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?tab=members&removed=1");
}

export type JoinState = { error?: string } | null;

export async function acceptInviteAction(
  _prev: JoinState,
  formData: FormData
): Promise<JoinState> {
  const token = String(formData.get("token") ?? "");
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { tenant: true },
  });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    return { error: "This invitation is invalid or has expired." };
  }

  const session = await getSession();
  let userId = "";
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (session) {
    if (session.user.email !== invitation.email) {
      return { error: `This invite belongs to ${invitation.email}. Sign in with that account.` };
    }
    userId = session.user.id;
  } else {
    const existing = await db.user.findUnique({ where: { email: invitation.email } });
    if (existing) {
      return { error: "You already have an Nkanyezi account. Sign in, then reopen this invite link." };
    }
    if (name.length < 2) return { error: "Enter your full name." };
    if (password.length < 8) return { error: "Choose a password of at least 8 characters." };
    const user = await db.user.create({
      data: {
        name,
        email: invitation.email,
        passwordHash: await hashPassword(password),
      },
    });
    userId = user.id;
    await createSession(user.id);
  }

  try {
    if (invitation.role === "STUDENT") await assertSeatAvailable(invitation.tenantId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "This workspace is full." };
  }

  const existingMembership = await db.membership.findUnique({
    where: { tenantId_userId: { tenantId: invitation.tenantId, userId } },
  });

  if (existingMembership) {
    if (!atLeast(existingMembership.role, invitation.role as Role)) {
      await db.membership.update({
        where: { id: existingMembership.id },
        data: { role: invitation.role },
      });
    }
  } else {
    await db.membership.create({
      data: { tenantId: invitation.tenantId, userId, role: invitation.role, status: "ACTIVE" },
    });
  }

  if (invitation.courseId) {
    await db.enrollment.upsert({
      where: { courseId_userId: { courseId: invitation.courseId, userId } },
      create: {
        tenantId: invitation.tenantId,
        courseId: invitation.courseId,
        userId,
      },
      update: { status: "ACTIVE" },
    });
  }

  await db.invitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() },
  });
  await audit({
    tenantId: invitation.tenantId,
    actorId: userId,
    action: "invitation.accepted",
    target: invitation.email,
  });

  const jar = await cookies();
  jar.set(TENANT_COOKIE, invitation.tenantId, COOKIE);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard?joined=1");
}

export async function createWorkspaceAction(formData: FormData) {
  const session = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "SCHOOL") === "TEACHER" ? "TEACHER" : "SCHOOL";
  if (name.length < 2) redirect("/onboarding?error=1");

  const base = slugify(name) || "workspace";
  let slug = base;
  for (let i = 0; i < 5; i++) {
    const clash = await db.tenant.findUnique({ where: { slug } });
    if (!clash) break;
    slug = `${base}-${randomSuffix()}`;
  }
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

  const tenant = await db.tenant.create({
    data: {
      name,
      slug,
      kind,
      trialEndsAt,
      subscription: {
        create: {
          plan: "GROWTH",
          seats: 400,
          status: "TRIALING",
          currentPeriodEnd: trialEndsAt,
        },
      },
      memberships: { create: { userId: session.user.id, role: "OWNER" } },
    },
  });
  await audit({ tenantId: tenant.id, actorId: session.user.id, action: "workspace.created" });
  const jar = await cookies();
  jar.set(TENANT_COOKIE, tenant.id, COOKIE);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
