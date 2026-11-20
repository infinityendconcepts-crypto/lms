import "server-only";

import { db } from "@/lib/db";
import { gradeQuestion, parseData } from "@/lib/questions";

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Auto-grade every answer that has not been manually graded yet.
 * Open-ended / case-study answers with rubric-only parts stay unscored
 * and keep the attempt in SUBMITTED until a teacher grades them.
 */
export async function autoGradeAttempt(attemptId: string) {
  const attempt = await db.attempt.findUnique({
    where: { id: attemptId },
    include: { answers: { include: { question: true } } },
  });
  if (!attempt) throw new Error("Attempt not found");

  for (const answer of attempt.answers) {
    if (answer.gradedAt) continue; // manual grade wins
    const result = gradeQuestion(
      {
        type: answer.question.type,
        points: answer.question.points,
        data: answer.question.data,
      },
      parseData(answer.response)
    );

    if (result.needsManual) {
      await db.answer.update({
        where: { id: answer.id },
        data: { score: null, maxScore: result.max },
      });
    } else {
      await db.answer.update({
        where: { id: answer.id },
        data: {
          score: result.score,
          maxScore: result.max,
          gradedAt: new Date(),
        },
      });
    }
  }

  return refreshAttemptTotals(attemptId);
}

/** Recompute score / max / status from answer rows. */
export async function refreshAttemptTotals(attemptId: string) {
  const attempt = await db.attempt.findUnique({
    where: { id: attemptId },
    include: { answers: true, assessment: { include: { questions: true } } },
  });
  if (!attempt) throw new Error("Attempt not found");

  const maxScore = round(attempt.assessment.questions.reduce((sum, q) => sum + q.points, 0));
  const pending = attempt.answers.filter((a) => a.score === null).length;
  const earned = round(attempt.answers.reduce((sum, a) => sum + (a.score ?? 0), 0));

  if (attempt.status === "IN_PROGRESS" || attempt.status === "RETURNED") {
    return db.attempt.update({
      where: { id: attemptId },
      data: { maxScore, score: attempt.status === "RETURNED" ? earned : null },
    });
  }

  const finished = attempt.submittedAt !== null;
  const status = pending === 0 && finished ? "GRADED" : attempt.status;

  return db.attempt.update({
    where: { id: attemptId },
    data: {
      score: earned,
      maxScore,
      status,
      gradedAt: status === "GRADED" ? (attempt.gradedAt ?? new Date()) : null,
    },
  });
}

export async function applyManualGrade(input: {
  answerId: string;
  score: number;
  feedback?: string;
  gradedById: string;
}) {
  const answer = await db.answer.findUnique({ where: { id: input.answerId } });
  if (!answer) throw new Error("Answer not found");

  const safeScore = Math.max(0, Math.min(input.score, answer.maxScore || input.score));
  await db.answer.update({
    where: { id: input.answerId },
    data: {
      score: safeScore,
      feedback: input.feedback?.trim() || null,
      gradedById: input.gradedById,
      gradedAt: new Date(),
    },
  });
  await refreshAttemptTotals(answer.attemptId);
}

export function isAttemptExpired(attempt: {
  startedAt: Date;
  submittedAt: Date | null;
  assessment: { timeLimitMin: number | null };
  status?: string;
}) {
  if (attempt.submittedAt) return false;
  if (attempt.status === "RETURNED") return false;
  const limit = attempt.assessment.timeLimitMin;
  if (!limit) return false;
  return Date.now() > attempt.startedAt.getTime() + limit * 60_000 + 15_000;
}
