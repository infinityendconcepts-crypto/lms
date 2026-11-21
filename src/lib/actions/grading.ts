"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { applyManualGrade, autoGradeAttempt, refreshAttemptTotals } from "@/lib/grading";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";

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
    include: { answers: true, assessment: { select: { title: true } } },
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
    data: { status: "GRADED", gradedAt: new Date(), gradedById: ctx.user.id, returnedAt: null, returnNote: null },
  });
  await refreshAttemptTotals(attemptId);
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "attempt.finalized",
    target: attemptId,
  });

  if (attempt.studentId !== ctx.user.id) {
    await notifyUsers({
      tenantId: ctx.tenant.id,
      recipientIds: [attempt.studentId],
      senderId: ctx.user.id,
      kind: "SYSTEM",
      title: `Assessment graded: ${attempt.assessment.title}`,
      body: `${ctx.user.name} has graded your submission for "${attempt.assessment.title}". View your results and feedback.`,
      emailSubject: `${ctx.tenant.name}: Assessment graded - ${attempt.assessment.title}`,
      link: `/results/${attemptId}`,
    });
  }

  revalidatePath(`/dashboard/grading/${attemptId}`);
  revalidatePath("/dashboard/grading");
  redirect(`/dashboard/grading/${attemptId}?finalized=1`);
}

export async function returnAttemptAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const attemptId = String(formData.get("attemptId") ?? "");
  const returnNote = String(formData.get("returnNote") ?? "").trim();
  if (!returnNote) {
    redirect(`/dashboard/grading/${attemptId}?error=Add+comments+or+instructions+before+returning`);
  }

  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, tenantId: ctx.tenant.id },
    include: { assessment: true },
  });
  if (!attempt) throw new Error("Attempt not found");
  if (attempt.status === "IN_PROGRESS") {
    redirect(`/dashboard/grading/${attemptId}?error=This+attempt+has+not+been+submitted+yet`);
  }

  await db.attempt.update({
    where: { id: attemptId },
    data: {
      status: "RETURNED",
      returnNote,
      returnedAt: new Date(),
      gradedAt: null,
      gradedById: null,
    },
  });
  await refreshAttemptTotals(attemptId);
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "attempt.returned",
    target: attemptId,
  });

  if (attempt.studentId !== ctx.user.id) {
    await notifyUsers({
      tenantId: ctx.tenant.id,
      recipientIds: [attempt.studentId],
      senderId: ctx.user.id,
      kind: "SYSTEM",
      title: `Assessment returned: ${attempt.assessment.title}`,
      body: `${ctx.user.name} returned your submission for "${attempt.assessment.title}" with feedback. Please review and resubmit.`,
      emailSubject: `${ctx.tenant.name}: Assessment returned - ${attempt.assessment.title}`,
      link: `/results/${attemptId}`,
    });
  }

  revalidatePath(`/dashboard/grading/${attemptId}`);
  revalidatePath("/dashboard/grading");
  revalidatePath(`/results/${attemptId}`);
  revalidatePath(`/quiz/${attempt.assessmentId}`);
  revalidatePath("/dashboard/results");
  redirect(`/dashboard/grading/${attemptId}?returned=1`);
}
