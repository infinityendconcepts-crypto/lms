import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, TENANT_COOKIE } from "@/lib/auth";

export type Role = "OWNER" | "ADMIN" | "TEACHER" | "MODERATOR" | "STUDENT";

const RANK: Record<Role, number> = {
  STUDENT: 1,
  MODERATOR: 2,
  TEACHER: 3,
  ADMIN: 4,
  OWNER: 5,
};

export function atLeast(role: string, min: Role) {
  return (RANK[role as Role] ?? 0) >= RANK[min];
}

export function canTeach(role: string) {
  return atLeast(role, "TEACHER");
}

export function canAdmin(role: string) {
  return atLeast(role, "ADMIN");
}

/** Moderators review submitted work but do not build courses or manage billing. */
export function canModerate(role: string) {
  return atLeast(role, "MODERATOR");
}

export const getAppContext = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/login");

  const memberships = await db.membership.findMany({
    where: { userId: session.user.id, status: "ACTIVE", tenant: { suspended: false } },
    include: { tenant: { include: { subscription: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    if (session.user.isSuperAdmin) redirect("/admin");
    redirect("/onboarding");
  }

  const jar = await cookies();
  const wanted = jar.get(TENANT_COOKIE)?.value;
  const membership = memberships.find((m) => m.tenantId === wanted) ?? memberships[0];

  return {
    session,
    user: session.user,
    memberships,
    membership,
    tenant: membership.tenant,
    role: membership.role as Role,
  };
});

export async function requireTenant(minRole?: Role) {
  const ctx = await getAppContext();
  if (minRole && !atLeast(ctx.role, minRole)) {
    redirect(`/dashboard?denied=${encodeURIComponent(minRole)}`);
  }
  return ctx;
}

export async function requireSuperAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/dashboard");
  return session;
}

/** Guard used by server actions / route handlers (throws instead of redirecting). */
export async function assertTenantMember(tenantId: string, minRole: Role = "STUDENT") {
  const ctx = await getAppContext();
  if (ctx.tenant.id !== tenantId) throw new Error("Wrong workspace");
  if (!atLeast(ctx.role, minRole)) throw new Error("Insufficient permissions");
  return ctx;
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  TEACHER: "Teacher",
  MODERATOR: "Moderator",
  STUDENT: "Student",
};

/** Roles that make up a workspace's staff (everyone who is not a learner). */
export const STAFF_ROLES: Role[] = ["OWNER", "ADMIN", "TEACHER", "MODERATOR"];
