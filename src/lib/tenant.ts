import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, TENANT_COOKIE } from "@/lib/auth";

export type Role =
  | "OWNER"
  | "ADMIN"
  | "TEACHER"
  | "MODERATOR"
  | "MONITOR"
  | "STUDENT";

const RANK: Record<Role, number> = {
  STUDENT: 1,
  MONITOR: 2,
  MODERATOR: 3,
  TEACHER: 4,
  ADMIN: 5,
  OWNER: 6,
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

/**
 * Monitors are workspace users with a dedicated read-only area. Every normal
 * dashboard page and action goes through here, so they are redirected to their
 * limited view unless a caller explicitly opts in.
 */
export async function requireTenant(
  minRole?: Role,
  options?: { allowMonitor?: boolean }
) {
  const ctx = await getAppContext();
  if (ctx.role === "MONITOR" && !options?.allowMonitor) {
    redirect("/dashboard/monitoring");
  }
  if (minRole && !atLeast(ctx.role, minRole)) {
    redirect(`/dashboard?denied=${encodeURIComponent(minRole)}`);
  }
  return ctx;
}

/** Guard for the limited MONITOR-only learner view. */
export async function requireMonitor() {
  const ctx = await getAppContext();
  if (ctx.role !== "MONITOR") {
    redirect("/dashboard?denied=MONITOR");
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
export async function assertTenantMember(
  tenantId: string,
  minRole: Role = "STUDENT",
  options?: { allowMonitor?: boolean }
) {
  const ctx = await getAppContext();
  if (ctx.tenant.id !== tenantId) throw new Error("Wrong workspace");
  if (ctx.role === "MONITOR" && !options?.allowMonitor) {
    throw new Error("Insufficient permissions");
  }
  if (!atLeast(ctx.role, minRole)) throw new Error("Insufficient permissions");
  return ctx;
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  TEACHER: "Teacher",
  MODERATOR: "Moderator",
  MONITOR: "Monitor",
  STUDENT: "Student",
};

/** Roles that make up a workspace's staff (everyone who is not a learner). */
export const STAFF_ROLES: Role[] = ["OWNER", "ADMIN", "TEACHER", "MODERATOR"];
