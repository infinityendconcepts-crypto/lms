import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { autoGradeAttempt, isAttemptExpired } from "@/lib/grading";
import { parseData } from "@/lib/questions";
import { nowMs } from "@/lib/utils";
import { AttemptRunner } from "@/components/AttemptRunner";

export const metadata = { title: "Assessment" };

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const ctx = await requireTenant("STUDENT");

  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, tenantId: ctx.tenant.id, studentId: ctx.user.id },
    include: {
      assessment: { include: { course: true, questions: { orderBy: { order: "asc" } } } },
      answers: true,
    },
  });
  if (!attempt) notFound();

  if (attempt.status !== "IN_PROGRESS") {
    redirect(`/results/${attempt.id}`);
  }

  // A student who closed the tab past the deadline is submitted server-side.
  if (isAttemptExpired(attempt)) {
    const spent = Math.max(0, Math.round((nowMs() - attempt.startedAt.getTime()) / 1000));
    await db.attempt.update({
      where: { id: attempt.id },
      data: { status: "SUBMITTED", submittedAt: new Date(), timeSpentSec: spent },
    });
    await autoGradeAttempt(attempt.id);
    redirect(`/results/${attempt.id}?submitted=1&auto=1`);
  }

  const initialResponses: Record<string, Record<string, unknown>> = {};
  for (const answer of attempt.answers) {
    initialResponses[answer.questionId] = parseData<Record<string, unknown>>(answer.response);
  }

  const questions = attempt.assessment.questions.map((question) => ({
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    mediaUrl: question.mediaUrl,
    points: question.points,
    data: question.data,
  }));

  return (
    <AttemptRunner
      attemptId={attempt.id}
      assessmentTitle={attempt.assessment.title}
      courseTitle={attempt.assessment.course.title}
      instructions={attempt.assessment.instructions}
      questions={questions}
      initialResponses={initialResponses}
      timeLimitMin={attempt.assessment.timeLimitMin}
      startedAt={attempt.startedAt.getTime()}
      passScore={attempt.assessment.passScore}
    />
  );
}
