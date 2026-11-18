import "server-only";

import { db } from "@/lib/db";
import { trialDaysLeft } from "@/lib/plans";
import { getPlan } from "@/lib/plan-catalog";

export async function getUsage(tenantId: string) {
  const [students, teachers, courses, assessments, storage, submissions] = await Promise.all([
    db.membership.count({ where: { tenantId, role: "STUDENT" } }),
    db.membership.count({ where: { tenantId, role: { in: ["TEACHER", "ADMIN", "OWNER"] } } }),
    db.course.count({ where: { tenantId } }),
    db.assessment.count({ where: { tenantId } }),
    db.attachment.aggregate({ where: { tenantId }, _sum: { size: true } }),
    db.attempt.count({ where: { tenantId, status: { in: ["SUBMITTED", "GRADED"] } } }),
  ]);

  return {
    students,
    teachers,
    courses,
    assessments,
    storageBytes: storage._sum.size ?? 0,
    submissions,
  };
}

export async function getPlanState(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: true },
  });
  if (!tenant) throw new Error("Workspace not found");

  const sub = tenant.subscription;
  const plan = await getPlan(sub?.plan ?? "STARTER");
  const trialLeft = sub?.status === "TRIALING" ? trialDaysLeft(sub.currentPeriodEnd) : 0;
  const usage = await getUsage(tenantId);
  // A saved seat override (admin or promo seat boost) applies to finite plans.
  const seatLimit = plan.seats === null ? null : sub?.seats ?? plan.seats;

  return {
    tenant,
    subscription: sub,
    plan,
    trialLeft,
    usage,
    seatLimit,
    seatsLeft: seatLimit === null ? null : Math.max(0, seatLimit - usage.students),
    overSeats: seatLimit !== null && usage.students >= seatLimit,
  };
}

export async function assertSeatAvailable(tenantId: string) {
  const state = await getPlanState(tenantId);
  if (state.seatLimit !== null && state.usage.students >= state.seatLimit) {
    throw new Error(
      `Your ${state.plan.name} plan includes ${state.seatLimit} learners. Upgrade to add more.`
    );
  }
  return state;
}
