import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  GraduationCap,
  ListChecks,
  PlayCircle,
  Repeat,
  Target,
  Trophy,
} from "lucide-react";
import { db } from "@/lib/db";
import { canTeach, requireTenant } from "@/lib/tenant";
import { startAttemptAction } from "@/lib/actions/attempt";
import { SubmitButton } from "@/components/SubmitButton";
import { MathText } from "@/components/MathText";
import { StatusBadge } from "@/components/ui";
import { formatDate, nowMs, pct } from "@/lib/utils";

export const metadata = { title: "Assessment" };

export default async function QuizLandingPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  const ctx = await requireTenant();

  const assessment = await db.assessment.findFirst({
    where: { id: assessmentId, tenantId: ctx.tenant.id },
    include: {
      course: true,
      questions: { orderBy: { order: "asc" } },
    },
  });
  if (!assessment) notFound();

  if (canTeach(ctx.role)) redirect(`/dashboard/assessments/${assessment.id}`);

  const enrollment = await db.enrollment.findUnique({
    where: { courseId_userId: { courseId: assessment.courseId, userId: ctx.user.id } },
  });
  if (!enrollment && assessment.type !== "PLACEMENT") {
    redirect(`/learn/${assessment.courseId}?error=Enroll+in+the+course+first`);
  }

  const attempts = await db.attempt.findMany({
    where: { assessmentId, studentId: ctx.user.id },
    orderBy: { startedAt: "desc" },
  });
  const inProgress = attempts.find((a) => a.status === "IN_PROGRESS" || a.status === "RETURNED");
  const finished = attempts.filter((a) => a.status !== "IN_PROGRESS" && a.status !== "RETURNED");
  const best = finished.reduce((max, a) => Math.max(max, pct(a.score ?? 0, a.maxScore)), 0);
  const remaining = Math.max(0, assessment.attemptsAllowed - finished.length);
  const now = nowMs();
  const notOpen = assessment.openAt && assessment.openAt.getTime() > now;
  const pastDue = assessment.dueAt && assessment.dueAt.getTime() < now;
  const closed = assessment.status !== "PUBLISHED" || notOpen || pastDue || (remaining <= 0 && !inProgress);

  const totalPoints = assessment.questions.reduce((sum, q) => sum + q.points, 0);
  const typeCounts = new Map<string, number>();
  for (const question of assessment.questions) {
    typeCounts.set(question.type, (typeCounts.get(question.type) ?? 0) + 1);
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link
            href={`/learn/${assessment.courseId}`}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" /> {assessment.course.title}
          </Link>
          <Link href="/dashboard/results" className="btn-ghost btn-sm">
            My results
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="card overflow-hidden">
          <div className="relative bg-slate-900 px-5 py-7 text-white sm:px-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(circle at 85% 0%, #6366f1, transparent 50%), radial-gradient(circle at 10% 100%, #8b5cf6, transparent 45%)",
              }}
            />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/85">
                  {assessment.type.toLowerCase()}
                </span>
                {assessment.status !== "PUBLISHED" && <StatusBadge status={assessment.status} />}
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{assessment.title}</h1>
              <p className="mt-1 text-sm text-white/70">{assessment.course.title}</p>
              <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-white/75">
                <span className="flex items-center gap-1.5">
                  <ListChecks className="size-3.5" /> {assessment.questions.length} questions
                </span>
                <span className="flex items-center gap-1.5">
                  <Target className="size-3.5" /> {totalPoints} points
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {assessment.timeLimitMin ? `${assessment.timeLimitMin} minutes` : "No time limit"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Repeat className="size-3.5" /> {assessment.attemptsAllowed} attempt
                  {assessment.attemptsAllowed === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-5 px-5 py-6 sm:px-8 sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Before you begin</h2>
              {assessment.instructions ? (
                <MathText content={assessment.instructions} className="mt-2 text-sm text-slate-600" />
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Answer every question you can. Your work saves automatically as you type.
                </p>
              )}
              {assessment.type === "PLACEMENT" && (
                <p className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-[11px] leading-5 text-brand-800">
                  This is a placement pre-assessment. It helps your teacher decide whether this
                  course is the right fit before you enrol — it is not a graded course task.
                </p>
              )}
              <ul className="mt-3 space-y-1.5 text-[11px] leading-5 text-slate-500">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                  You can move between questions freely.
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                  Answers autosave, but submit before you close the tab.
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                  Math can be written in LaTeX with $…$ or $$…$$.
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Your standing</h2>
              <dl className="mt-2 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Passing score</dt>
                  <dd className="font-semibold text-slate-800">{assessment.passScore}%</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Attempts used</dt>
                  <dd className="font-semibold text-slate-800">
                    {finished.length}/{assessment.attemptsAllowed}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Best score</dt>
                  <dd className="font-semibold text-slate-800">
                    {finished.length ? `${best}%` : "—"}
                  </dd>
                </div>
                {assessment.openAt && (
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-1 text-slate-500">
                      <CalendarClock className="size-3.5" /> Opens
                    </dt>
                    <dd className="font-semibold text-slate-800">{formatDate(assessment.openAt, true)}</dd>
                  </div>
                )}
                {assessment.dueAt && (
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-1 text-slate-500">
                      <CalendarClock className="size-3.5" /> Due
                    </dt>
                    <dd className="font-semibold text-slate-800">{formatDate(assessment.dueAt, true)}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Results</dt>
                  <dd className="font-semibold text-slate-800">
                    {assessment.showResults === "AFTER_SUBMIT"
                      ? "Right after submitting"
                      : assessment.showResults === "AFTER_DUE"
                        ? "After the due date"
                        : "When your teacher releases them"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="border-t border-slate-100 px-5 py-5 sm:px-8">
            {inProgress ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {inProgress.status === "RETURNED"
                      ? "Your teacher returned this attempt for revision."
                      : "You have an attempt in progress."}
                  </p>
                  <p className="text-xs text-slate-500">
                    {inProgress.status === "RETURNED"
                      ? inProgress.returnNote
                        ? "Review the comments and instructions, then revise and resubmit."
                        : "Review the feedback, then revise and resubmit."
                      : `Started ${formatDate(inProgress.startedAt, true)}. Continue where you left off.`}
                  </p>
                </div>
                <Link href={`/attempt/${inProgress.id}`} className="btn-primary">
                  {inProgress.status === "RETURNED" ? "Revise attempt" : "Continue attempt"} <ArrowRight className="size-4" />
                </Link>
              </div>
            ) : closed ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {assessment.status !== "PUBLISHED"
                  ? "This assessment is not open."
                  : notOpen
                    ? `This assessment opens ${formatDate(assessment.openAt, true)}.`
                    : pastDue
                      ? "The due date has passed. Contact your teacher if you need an extension."
                      : "You have used all your attempts."}
              </div>
            ) : (
              <form action={startAttemptAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <input type="hidden" name="assessmentId" value={assessment.id} />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {finished.length ? "Ready for another attempt?" : "Ready when you are."}
                  </p>
                  <p className="text-xs text-slate-500">
                    {remaining} attempt{remaining === 1 ? "" : "s"} remaining
                    {assessment.timeLimitMin ? ` · ${assessment.timeLimitMin}-minute timer starts immediately` : ""}.
                  </p>
                </div>
                <SubmitButton pendingText="Starting…">
                  <PlayCircle className="size-4" />
                  {finished.length ? "Start new attempt" : "Start assessment"}
                </SubmitButton>
              </form>
            )}
          </div>
        </div>

        {finished.length > 0 && (
          <section className="card mt-5 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Trophy className="size-3.5" /> Previous attempts
              </h2>
              <span className="text-[11px] text-slate-400">{finished.length}</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {finished.map((attempt, i) => (
                <li key={attempt.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-slate-100 text-[11px] font-bold text-slate-500">
                    {finished.length - i}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {attempt.status === "SUBMITTED"
                        ? "Submitted — awaiting grading"
                        : attempt.status === "RETURNED"
                          ? "Returned for revision"
                          : `${pct(attempt.score ?? 0, attempt.maxScore)}%`}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatDate(attempt.submittedAt ?? attempt.startedAt, true)}
                    </p>
                  </div>
                  <StatusBadge status={attempt.status} />
                  <Link href={`/results/${attempt.id}`} className="btn-ghost btn-sm">
                    View
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {[...typeCounts.entries()].map(([type, count]) => (
            <div
              key={type}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500"
            >
              <ClipboardCheck className="size-3.5 text-slate-400" />
              <span className="font-semibold text-slate-700">{count}</span>
              {type.replaceAll("_", " ").toLowerCase()}
              {count === 1 ? " question" : " questions"}
            </div>
          ))}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <GraduationCap className="size-3.5" /> Offered by {ctx.tenant.name}
        </p>
      </main>
    </div>
  );
}
