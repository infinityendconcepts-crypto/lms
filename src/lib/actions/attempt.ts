"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { autoGradeAttempt, isAttemptExpired } from "@/lib/grading";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";

export async function startAttemptAction(formData: FormData) {
  const ctx = await requireTenant("STUDENT");
  const assessmentId = String(formData.get("assessmentId") ?? "");

  const assessment = await db.assessment.findFirst({
    where: { id: assessmentId, tenantId: ctx.tenant.id },
    include: { questions: true },
  });
  if (!assessment) redirect("/dashboard/courses?error=Assessment+not+found");
  const isPlacement = assessment.type === "PLACEMENT";
  const backTo = isPlacement ? `/quiz/${assessmentId}` : `/learn/${assessment.courseId}`;
  if (assessment.status !== "PUBLISHED") {
    redirect(`${backTo}?error=This+assessment+is+not+open`);
  }

  const enrollment = await db.enrollment.findUnique({
    where: {
      courseId_userId: { courseId: assessment.courseId, userId: ctx.user.id },
    },
  });
  if (!enrollment && !isPlacement) {
    redirect("/dashboard/courses?error=Enroll+in+the+course+first");
  }

  const now = new Date();
  if (assessment.openAt && assessment.openAt > now) {
    redirect(`${backTo}?error=This+assessment+has+not+opened+yet`);
  }
  if (assessment.dueAt && assessment.dueAt < now) {
    redirect(`${backTo}?error=The+due+date+has+passed`);
  }

  const existing = await db.attempt.findFirst({
    where: { assessmentId, studentId: ctx.user.id, status: { in: ["IN_PROGRESS", "RETURNED"] } },
    orderBy: { startedAt: "desc" },
  });
  if (existing) redirect(`/attempt/${existing.id}`);

  const used = await db.attempt.count({
    where: { assessmentId, studentId: ctx.user.id, status: { in: ["SUBMITTED", "GRADED"] } },
  });
  if (used >= assessment.attemptsAllowed) {
    redirect(`${backTo}?error=No+attempts+remaining`);
  }

  const maxScore = assessment.questions.reduce((sum, q) => sum + q.points, 0);
  const attempt = await db.attempt.create({
    data: {
      tenantId: ctx.tenant.id,
      assessmentId,
      studentId: ctx.user.id,
      maxScore,
      answers: {
        create: assessment.questions.map((q) => ({
          questionId: q.id,
          maxScore: q.points,
          response: "{}",
        })),
      },
    },
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "attempt.started",
    target: attempt.id,
    meta: { assessmentId },
  });
  redirect(`/attempt/${attempt.id}`);
}

export async function saveAnswerAction(input: {
  attemptId: string;
  questionId: string;
  response: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string; expired?: boolean }> {
  const ctx = await requireTenant("STUDENT");
  const attempt = await db.attempt.findFirst({
    where: {
      id: input.attemptId,
      studentId: ctx.user.id,
      tenantId: ctx.tenant.id,
    },
    include: { assessment: true, answers: true },
  });
  if (!attempt) return { ok: false, error: "Attempt not found" };
  if (!["IN_PROGRESS", "RETURNED"].includes(attempt.status)) return { ok: false, error: "Attempt already submitted" };
  if (isAttemptExpired({ ...attempt, status: attempt.status })) return { ok: false, expired: true };

  const answer = attempt.answers.find((a) => a.questionId === input.questionId);
  if (!answer) return { ok: false, error: "Question not in this attempt" };

  await db.answer.update({
    where: { id: answer.id },
    data: { response: JSON.stringify(input.response ?? {}) },
  });
  return { ok: true };
}

export async function submitAttemptAction(formData: FormData) {
  const ctx = await requireTenant("STUDENT");
  const attemptId = String(formData.get("attemptId") ?? "");

  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, studentId: ctx.user.id, tenantId: ctx.tenant.id },
    include: {
      assessment: {
        include: { course: { select: { ownerId: true, title: true } } },
      },
    },
  });
  if (!attempt) redirect("/dashboard");

  if (["IN_PROGRESS", "RETURNED"].includes(attempt.status)) {
    const spent = Math.max(0, Math.round((Date.now() - attempt.startedAt.getTime()) / 1000));
    await db.attempt.update({
      where: { id: attemptId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        timeSpentSec: Math.max(attempt.timeSpentSec, spent),
        returnedAt: null,
        returnNote: null,
        gradedAt: null,
        gradedById: null,
      },
    });
    await autoGradeAttempt(attemptId);
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.id,
      action: "attempt.submitted",
      target: attemptId,
    });

    const courseOwnerId = attempt.assessment.course.ownerId;
    if (courseOwnerId && courseOwnerId !== ctx.user.id) {
      await notifyUsers({
        tenantId: ctx.tenant.id,
        recipientIds: [courseOwnerId],
        senderId: ctx.user.id,
        kind: "SYSTEM",
        title: `Task submitted: ${attempt.assessment.title}`,
        body: `${ctx.user.name} submitted "${attempt.assessment.title}" in ${attempt.assessment.course.title}. Review it in the grading queue.`,
        emailSubject: `${ctx.tenant.name}: Task submitted - ${attempt.assessment.title}`,
        link: `/dashboard/grading/${attemptId}`,
      });
    }
  }

  redirect(`/results/${attemptId}?submitted=1`);
}

/** Called by the runner when the clock hits zero. */
export async function autoSubmitAttemptAction(attemptId: string) {
  const ctx = await requireTenant("STUDENT");
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, studentId: ctx.user.id, tenantId: ctx.tenant.id },
    include: {
      assessment: {
        include: { course: { select: { ownerId: true, title: true } } },
      },
    },
  });
  if (!attempt || !["IN_PROGRESS", "RETURNED"].includes(attempt.status)) return { ok: false };

  const spent = Math.max(0, Math.round((Date.now() - attempt.startedAt.getTime()) / 1000));
  await db.attempt.update({
    where: { id: attemptId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      timeSpentSec: Math.max(attempt.timeSpentSec, spent),
      returnedAt: null,
      returnNote: null,
      gradedAt: null,
      gradedById: null,
    },
  });
  await autoGradeAttempt(attemptId);

  const courseOwnerId = attempt.assessment.course.ownerId;
  if (courseOwnerId && courseOwnerId !== ctx.user.id) {
    await notifyUsers({
      tenantId: ctx.tenant.id,
      recipientIds: [courseOwnerId],
      senderId: ctx.user.id,
      kind: "SYSTEM",
      title: `Task submitted: ${attempt.assessment.title}`,
      body: `${ctx.user.name} submitted "${attempt.assessment.title}" in ${attempt.assessment.course.title}. Review it in the grading queue.`,
      emailSubject: `${ctx.tenant.name}: Task submitted - ${attempt.assessment.title}`,
      link: `/dashboard/grading/${attemptId}`,
    });
  }

  return { ok: true };
}
