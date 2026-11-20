import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  GraduationCap,
  Home,
  Timer,
} from "lucide-react";
import { db } from "@/lib/db";
import { canTeach, requireTenant } from "@/lib/tenant";
import { Badge, Progress, StatusBadge } from "@/components/ui";
import { QuestionReview } from "@/components/QuestionReview";
import { MathText } from "@/components/MathText";
import { Logo } from "@/components/Logo";
import { parseData } from "@/lib/questions";
import { formatDate, formatDuration, nowMs, pct } from "@/lib/utils";

export const metadata = { title: "Assessment results" };

export default async function AttemptResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { attemptId } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant();

  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, tenantId: ctx.tenant.id },
    include: {
      student: true,
      assessment: { include: { course: true, questions: { orderBy: { order: "asc" } } } },
      answers: { include: { question: true, gradedBy: { select: { name: true } } } },
    },
  });
  if (!attempt) notFound();

  const isTeacher = canTeach(ctx.role);
  const isOwner = attempt.studentId === ctx.user.id;
  if (!isTeacher && !isOwner) notFound();

  if ((attempt.status === "IN_PROGRESS" || attempt.status === "RETURNED") && isOwner) {
    redirect(`/attempt/${attempt.id}`);
  }

  const assessment = attempt.assessment;
  const answers = [...attempt.answers].sort((a, b) => a.question.order - b.question.order);
  const percent = pct(attempt.score ?? 0, attempt.maxScore);
  const passed = percent >= assessment.passScore;
  const duePassed = !assessment.dueAt || assessment.dueAt.getTime() <= nowMs();
  const released =
    assessment.showResults === "AFTER_SUBMIT" ||
    (assessment.showResults === "AFTER_DUE" && duePassed) ||
    (assessment.showResults === "MANUAL" && attempt.status === "GRADED");
  const canSeeScores = isTeacher || released;
  const showKey = canSeeScores;
  const canSeeReturnFeedback = isTeacher || (isOwner && attempt.status === "RETURNED");

  const correctCount = answers.filter((a) => a.score !== null && a.score >= a.maxScore).length;
  const partialCount = answers.filter((a) => a.score !== null && a.score > 0 && a.score < a.maxScore).length;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Logo
              size="sm"
              tenant={{
                id: ctx.tenant.id,
                name: ctx.tenant.name,
                logoUrl: ctx.tenant.logoUrl,
                brandColor: ctx.tenant.brandColor,
                updatedAt: ctx.tenant.logoUpdatedAt?.toISOString() ?? null,
              }}
            />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={isTeacher ? "/dashboard/grading" : "/dashboard/results"}
              className="btn-ghost btn-sm"
            >
              <ArrowLeft className="size-3.5" />
              {isTeacher ? "Grading queue" : "My results"}
            </Link>
            <Link href="/dashboard" className="btn-secondary btn-sm">
              <Home className="size-3.5" /> Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
        {sp.submitted && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">Attempt submitted.</p>
              <p className="text-[11px] text-emerald-700">
                Objective questions are graded automatically. Open answers may need a teacher.
              </p>
            </div>
          </div>
        )}
        {canSeeReturnFeedback && attempt.returnNote && attempt.status === "RETURNED" && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <GraduationCap className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">Returned for revision</p>
              <MathText content={attempt.returnNote} className="mt-1 text-xs leading-5 text-amber-900" />
              {isOwner && (
                <Link href={`/attempt/${attempt.id}`} className="btn-primary btn-sm mt-3 inline-flex">
                  Revise and resubmit
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="card mb-5 overflow-hidden">
          <div className="relative bg-slate-900 px-5 py-6 text-white sm:px-7">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(circle at 85% 0%, #6366f1, transparent 50%), radial-gradient(circle at 10% 100%, #8b5cf6, transparent 45%)",
              }}
            />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={attempt.status} />
                  <Badge tone="brand">{assessment.type.toLowerCase()}</Badge>
                  {attempt.status === "GRADED" && (
                    <Badge tone={passed ? "green" : "red"}>{passed ? "Passed" : "Not passed"}</Badge>
                  )}
                </div>
                <h1 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{assessment.title}</h1>
                <p className="mt-0.5 text-xs text-slate-300">
                  {assessment.course.title} · {attempt.student.name}
                </p>
                <p className="mt-2 text-[11px] text-slate-400">
                  Started {formatDate(attempt.startedAt, true)}
                  {attempt.submittedAt && ` · submitted ${formatDate(attempt.submittedAt, true)}`}
                  {attempt.timeSpentSec > 0 && ` · ${formatDuration(attempt.timeSpentSec)} spent`}
                </p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                {canSeeScores ? (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">Score</p>
                    <p className="text-4xl font-bold">
                      {Math.round((attempt.score ?? 0) * 100) / 100}
                      <span className="text-base font-medium text-slate-300"> / {attempt.maxScore}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-300">
                      {percent}% · pass mark {assessment.passScore}%
                    </p>
                  </>
                ) : (
                  <div className="rounded-xl bg-white/10 px-4 py-3 text-xs text-slate-200">
                    <Clock className="mb-1 size-4" />
                    Results have not been released yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          {canSeeScores && (
            <div className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Progress</p>
                <Progress className="mt-2" value={percent} />
                <p className="mt-1 text-[10px] text-slate-400">{percent}% of total points</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Fully correct</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-emerald-600">
                  <CheckCircle2 className="size-4" /> {correctCount}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Part marks</p>
                <p className="mt-1 text-sm font-bold text-sky-600">{partialCount}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Time</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-slate-700">
                  <Timer className="size-4 text-slate-400" />
                  {attempt.timeSpentSec ? formatDuration(attempt.timeSpentSec) : "—"}
                </p>
              </div>
            </div>
          )}
        </div>

        {!released && !isTeacher ? (
          <div className="card p-8 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Clock className="size-6" />
            </span>
            <h2 className="mt-3 text-base font-bold text-slate-900">Your work is in</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {assessment.showResults === "MANUAL"
                ? "Your teacher releases results manually after grading. You will see your score and feedback here once that happens."
                : "Results are released after the due date. Check back then — your answers are safely stored."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/dashboard/results" className="btn-primary btn-sm">
                My results
              </Link>
              <Link href="/dashboard/courses" className="btn-secondary btn-sm">
                Back to courses
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {assessment.instructions && (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600">
                <span className="font-bold uppercase tracking-wider text-slate-400">Instructions</span>
                <MathText content={assessment.instructions} className="mt-1 text-xs leading-5 text-slate-600" />
              </div>
            )}
            {answers.length === 0 ? (
              <div className="card p-8 text-center text-sm text-slate-500">
                No questions were on this assessment.
              </div>
            ) : (
              answers.map((answer, index) => (
                <QuestionReview
                  key={answer.id}
                  index={index}
                  question={{
                    type: answer.question.type,
                    prompt: answer.question.prompt,
                    mediaUrl: answer.question.mediaUrl,
                    points: answer.question.points,
                    data: answer.question.data,
                    explanation: answer.question.explanation,
                  }}
                  response={parseData<Record<string, unknown>>(answer.response)}
                  score={canSeeScores ? answer.score : undefined}
                  feedback={canSeeScores ? answer.feedback : null}
                  showKey={showKey}
                />
              ))
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center">
          <p className="text-[11px] text-slate-500">
            {attempt.status === "GRADED"
              ? passed
                ? "Nice work — you met the pass mark."
                : "Review the feedback, then ask your teacher about a retake."
              : attempt.status === "SUBMITTED"
                ? "Some answers may still be awaiting manual grading."
                : attempt.status === "RETURNED"
                  ? "Your teacher returned this attempt with comments/instructions. Revise and resubmit when ready."
                  : "This attempt is not finished."}
          </p>
          <div className="flex gap-2">
            {isTeacher && (
              <Link href={`/dashboard/grading/${attempt.id}`} className="btn-secondary btn-sm">
                <GraduationCap className="size-3.5" /> Grade attempt
              </Link>
            )}
            {attempt.status === "RETURNED" && isOwner ? (
              <Link href={`/attempt/${attempt.id}`} className="btn-primary btn-sm">
                Revise and resubmit
              </Link>
            ) : (
              <Link href={`/quiz/${assessment.id}`} className="btn-primary btn-sm">
                {attempt.status === "GRADED" ? "Try again" : "Back to assessment"}
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
