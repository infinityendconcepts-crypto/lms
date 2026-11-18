"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { applyManualGrade, autoGradeAttempt, refreshAttemptTotals } from "@/lib/grading";
import { audit } from "@/lib/audit";

function revalidateModeration() {
  revalidatePath("/dashboard/moderation");
  revalidatePath("/dashboard/grading");
}

/** Save a moderator's score + feedback for a single open answer. */
export async function moderateAnswerAction(formData: FormData) {
  const ctx = await requireTenant("MODERATOR");
  const attemptId = String(formData.get("attemptId") ?? "");
  const answerId = String(formData.get("answerId") ?? "");
  const score = Number(formData.get("score") ?? 0);
  const feedback = String(formData.get("feedback") ?? "");

  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, tenantId: ctx.tenant.id },
    select: { id: true },
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
    action: "moderation.answer_graded",
    target: answerId,
    meta: { attemptId, score },
  });
  revalidateModeration();
  redirect("/dashboard/moderation?tab=answers&saved=1");
}

/** Re-run auto grading, require every answer graded, then finalize an attempt. */
export async function finalizeModerationAction(formData: FormData) {
  const ctx = await requireTenant("MODERATOR");
  const attemptId = String(formData.get("attemptId") ?? "");
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!attempt) throw new Error("Attempt not found");

  await autoGradeAttempt(attemptId);
  const fresh = await db.attempt.findUnique({
    where: { id: attemptId },
    include: { answers: { select: { score: true } } },
  });
  if (!fresh) throw new Error("Attempt not found");
  if (fresh.answers.some((answer) => answer.score === null)) {
    redirect("/dashboard/moderation?tab=finalize&error=Grade+every+open+answer+first");
  }

  await db.attempt.update({
    where: { id: attemptId },
    data: { status: "GRADED", gradedAt: new Date(), gradedById: ctx.user.id },
  });
  await refreshAttemptTotals(attemptId);
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "moderation.attempt_finalized",
    target: attemptId,
  });
  revalidateModeration();
  redirect("/dashboard/moderation?tab=finalize&finalized=1");
}

/** Review a submitted coding-pad task (tenant scope via the parent pad). */
export async function reviewCodePadModerationAction(formData: FormData) {
  const ctx = await requireTenant("MODERATOR");
  const submissionId = String(formData.get("submissionId") ?? "");
  const submission = await db.codePadSubmission.findFirst({
    where: { id: submissionId, pad: { tenantId: ctx.tenant.id } },
    select: { id: true, padId: true },
  });
  if (!submission) throw new Error("Submission not found");

  const rawScore = Number(formData.get("score") ?? 0);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0;
  await db.codePadSubmission.update({
    where: { id: submissionId },
    data: {
      status: "REVIEWED",
      score,
      feedback: String(formData.get("feedback") ?? "").trim().slice(0, 4000) || null,
    },
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "moderation.codepad_reviewed",
    target: submissionId,
    meta: { padId: submission.padId, score },
  });
  revalidateModeration();
  redirect("/dashboard/moderation?tab=code&saved=1");
}
