"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { applyManualGrade, autoGradeAttempt, refreshAttemptTotals } from "@/lib/grading";
import { audit } from "@/lib/audit";

export async function gradeAnswerAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const attemptId = String(formData.get("attemptId") ?? "");
  const answerId = String(formData.get("answerId") ?? "");
  const score = Number(formData.get("score") ?? 0);
  const feedback = String(formData.get("feedback") ?? "");

  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, tenantId: ctx.tenant.id },
  });
  if (!attempt) throw new Error("Attempt not found");
  const answer = await db.answer.findFirst({ where: { id: answerId, attemptId } });
  if (!answer) throw new Error("Answer not found");

  await applyManualGrade({
    answerId,
    score: Number.isFinite(score) ? score : 0,
    feedback,
    gradedById: ctx.user.id,
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "answer.graded",
    target: answerId,
    meta: { score },
  });
  revalidatePath(`/dashboard/grading/${attemptId}`);
  redirect(`/dashboard/grading/${attemptId}?graded=1`);
}

export async function finalizeAttemptAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const attemptId = String(formData.get("attemptId") ?? "");
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, tenantId: ctx.tenant.id },
    include: { answers: true },
  });
  if (!attempt) throw new Error("Attempt not found");

  await autoGradeAttempt(attemptId);
  const fresh = await db.attempt.findUnique({
    where: { id: attemptId },
    include: { answers: true },
  });
  if (!fresh) throw new Error("Attempt not found");
  if (fresh.answers.some((a) => a.score === null)) {
    redirect(`/dashboard/grading/${attemptId}?error=Grade+every+open+answer+first`);
  }

  await db.attempt.update({
    where: { id: attemptId },
    data: { status: "GRADED", gradedAt: new Date(), gradedById: ctx.user.id },
  });
  await refreshAttemptTotals(attemptId);
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "attempt.finalized",
    target: attemptId,
  });
  revalidatePath(`/dashboard/grading/${attemptId}`);
  revalidatePath("/dashboard/grading");
  redirect(`/dashboard/grading/${attemptId}?finalized=1`);
}
