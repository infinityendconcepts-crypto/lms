"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { isMonitorType } from "@/lib/monitor";

type TenantContext = Awaited<ReturnType<typeof requireTenant>>;

const organizationSchema = z.string().trim().max(120).nullable();

function monitorRedirect(query?: string): never {
  redirect(query ? `/dashboard/monitor?${query}` : "/dashboard/monitor");
}

function selectedLearnerIds(formData: FormData) {
  return Array.from(
    new Set(formData.getAll("learnerIds").map(String).filter((id) => id.length > 0))
  ).slice(0, 200);
}

async function requireMonitorMembership(ctx: TenantContext, membershipId: string) {
  const membership = await db.membership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenant.id, role: "MONITOR" },
    select: { id: true, userId: true, user: { select: { name: true, email: true } } },
  });
  if (!membership) monitorRedirect("tab=monitors&error=Monitor+not+found");
  return membership;
}

function revalidateMonitorPages() {
  revalidatePath("/dashboard/monitor");
  revalidatePath("/dashboard/monitoring");
  revalidatePath("/dashboard/settings");
}

export async function updateMonitorAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const membershipId = String(formData.get("membershipId") ?? "");
  const membership = await requireMonitorMembership(ctx, membershipId);
  const rawType = String(formData.get("monitorType") ?? "");
  if (!isMonitorType(rawType)) monitorRedirect("tab=monitors&error=Choose+a+valid+monitor+type");

  const organizationResult = organizationSchema.safeParse(
    String(formData.get("monitorOrganization") ?? "").trim() || null
  );
  if (!organizationResult.success) {
    monitorRedirect("tab=monitors&error=Organization+name+is+too+long");
  }

  await db.membership.update({
    where: { id: membership.id },
    data: { monitorType: rawType, monitorOrganization: organizationResult.data },
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "monitor.updated",
    target: membership.user.email,
    meta: { monitorType: rawType, organization: organizationResult.data },
  });
  revalidateMonitorPages();
  monitorRedirect("tab=monitors&saved=monitor");
}

export async function assignMonitorAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const membershipId = String(formData.get("membershipId") ?? "");
  const membership = await requireMonitorMembership(ctx, membershipId);
  const ids = selectedLearnerIds(formData);
  if (ids.length === 0) monitorRedirect("tab=monitors&error=Select+at+least+one+learner");

  const learners = await db.membership.findMany({
    where: { tenantId: ctx.tenant.id, role: "STUDENT", userId: { in: ids } },
    select: { userId: true },
  });
  const validIds = new Set(learners.map((learner) => learner.userId));

  let assigned = 0;
  for (const learnerId of validIds) {
    await db.monitorAssignment.upsert({
      where: {
        tenantId_monitorId_learnerId: {
          tenantId: ctx.tenant.id,
          monitorId: membership.id,
          learnerId,
        },
      },
      create: {
        tenantId: ctx.tenant.id,
        monitorId: membership.id,
        learnerId,
        createdById: ctx.user.id,
      },
      update: {},
    });
    assigned += 1;
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "monitor.assigned",
    target: membership.user.email,
    meta: { assigned, skipped: ids.length - assigned },
  });
  revalidateMonitorPages();
  monitorRedirect(
    `tab=monitors&assigned=${assigned}${ids.length - assigned ? `&skipped=${ids.length - assigned}` : ""}`
  );
}

export async function unassignMonitorAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const assignment = await db.monitorAssignment.findFirst({
    where: { id: assignmentId, tenantId: ctx.tenant.id, monitor: { role: "MONITOR" } },
    select: {
      id: true,
      learner: { select: { name: true } },
      monitor: { select: { user: { select: { email: true } } } },
    },
  });
  if (!assignment) monitorRedirect("tab=monitors&error=Assignment+not+found");

  await db.monitorAssignment.delete({ where: { id: assignment.id } });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "monitor.unassigned",
    target: assignment.learner.name,
    meta: { monitor: assignment.monitor.user.email },
  });
  revalidateMonitorPages();
  monitorRedirect("tab=monitors&unassigned=1");
}

export async function assignMonitorToLearnerAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const learnerId = String(formData.get("learnerId") ?? "");
  const monitorIds = Array.from(
    new Set(formData.getAll("monitorIds").map(String).filter((id) => id.length > 0))
  ).slice(0, 100);
  if (monitorIds.length === 0) monitorRedirect("tab=learners&error=Select+at+least+one+monitor");

  const learner = await db.membership.findFirst({
    where: { tenantId: ctx.tenant.id, role: "STUDENT", userId: learnerId },
    select: { userId: true, user: { select: { name: true } } },
  });
  if (!learner) monitorRedirect("tab=learners&error=Learner+not+found");

  const monitors = await db.membership.findMany({
    where: { tenantId: ctx.tenant.id, role: "MONITOR", id: { in: monitorIds } },
    select: { id: true, user: { select: { email: true } } },
  });

  let assigned = 0;
  for (const monitor of monitors) {
    await db.monitorAssignment.upsert({
      where: {
        tenantId_monitorId_learnerId: {
          tenantId: ctx.tenant.id,
          monitorId: monitor.id,
          learnerId,
        },
      },
      create: {
        tenantId: ctx.tenant.id,
        monitorId: monitor.id,
        learnerId,
        createdById: ctx.user.id,
      },
      update: {},
    });
    assigned += 1;
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "monitor.assigned",
    target: learner.user.name,
    meta: { monitors: monitors.map((monitor) => monitor.user.email), assigned },
  });
  revalidateMonitorPages();
  monitorRedirect(
    `tab=learners&learner=${encodeURIComponent(learnerId)}&assigned=${assigned}`
  );
}
