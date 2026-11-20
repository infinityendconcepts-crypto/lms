import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  GraduationCap,
  Info,
  Sparkles,
  Timer,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { finalizeAttemptAction, gradeAnswerAction, returnAttemptAction } from "@/lib/actions/grading";
import { Avatar, Badge, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { QuestionReview } from "@/components/QuestionReview";
import { MathText } from "@/components/MathText";
import { parseData } from "@/lib/questions";
import { formatDate, formatDuration, pct } from "@/lib/utils";

export const metadata = { title: "Grade attempt" };

export default async function GradingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ graded?: string; finalized?: string; returned?: string; error?: string }>;
}) {
  const { attemptId } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");

  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, tenantId: ctx.tenant.id },
    include: {
      student: true,
      assessment: { include: { course: true, questions: { orderBy: { order: "asc" } } } },
      answers: { include: { question: true } },
    },
  });
  if (!attempt) notFound();

  const answers = [...attempt.answers].sort((a, b) => a.question.order - b.question.order);
  const open = answers.filter((a) => a.score === null);
  const autoGraded = answers.filter((a) => a.score !== null && !a.gradedById);
  const percent = pct(attempt.score ?? 0, attempt.maxScore);
  const passed = percent >= attempt.assessment.passScore;

  return (
    <div>
      <Link
        href="/dashboard/grading"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="size-3.5" /> Grading queue
      </Link>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Avatar name={attempt.student.name} src={attempt.student.avatarUrl} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={attempt.status} />
              {attempt.status === "GRADED" && (
                <Badge tone={passed ? "green" : "red"}>{passed ? "Passed" : "Below pass"}</Badge>
              )}
              {open.length > 0 && <Badge tone="amber">{open.length} open answer(s)</Badge>}
            </div>
            <h1 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
              {attempt.student.name}
            </h1>
            <p className="text-sm text-slate-500">
              {attempt.assessment.title} ·{" "}
              <Link
                href={`/dashboard/courses/${attempt.assessment.courseId}?tab=assessments`}
                className="hover:text-brand-700 hover:underline"
              >
                {attempt.assessment.course.title}
              </Link>
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Started {formatDate(attempt.startedAt, true)}
              {attempt.submittedAt && ` · submitted ${formatDate(attempt.submittedAt, true)}`}
              {attempt.timeSpentSec > 0 && ` · ${formatDuration(attempt.timeSpentSec)} spent`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Score</p>
            <p className="text-2xl font-bold text-slate-900">
              {attempt.score === null ? "—" : Math.round(attempt.score * 100) / 100}
              <span className="text-sm font-medium text-slate-400"> / {attempt.maxScore}</span>
            </p>
            <p className="text-[10px] text-slate-400">{percent}% · pass at {attempt.assessment.passScore}%</p>
          </div>
          {attempt.status !== "GRADED" && (
            <form action={finalizeAttemptAction}>
              <input type="hidden" name="attemptId" value={attempt.id} />
              <SubmitButton
                pendingText="Finalizing…"
                confirm={open.length > 0 ? "Some answers are still ungraded. Grade them first." : undefined}
              >
                <CheckCircle2 className="size-4" /> Finalize grade
              </SubmitButton>
            </form>
          )}
        </div>
      </div>

      {(sp.graded || sp.finalized || sp.returned || sp.error) && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            sp.error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : sp.returned
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {sp.error ??
            (sp.finalized
              ? "Attempt finalized. The learner can now see the outcome."
              : sp.returned
                ? "Attempt returned to the learner with your comments and instructions. It has not been finalized as graded."
                : "Grade saved.")}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Questions", answers.length, GraduationCap],
          ["Auto-graded", autoGraded.length, Sparkles],
          ["Needs review", open.length, Clock],
          ["Time spent", attempt.timeSpentSec ? formatDuration(attempt.timeSpentSec) : "—", Timer],
        ].map(([label, value, Icon]) => {
          const I = Icon as typeof GraduationCap;
          return (
            <div key={label as string} className="card flex items-center gap-3 p-4">
              <span className="flex size-9 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                <I className="size-4" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label as string}</p>
                <p className="text-lg font-bold text-slate-900">{value as string}</p>
              </div>
            </div>
          );
        })}
      </div>

      {attempt.status === "RETURNED" && attempt.returnNote ? (
        <section className="card mb-5 border-amber-200 bg-amber-50/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Returned to learner</p>
          <MathText content={attempt.returnNote} className="mt-1 text-sm leading-6 text-amber-900" />
          <p className="mt-2 text-[11px] text-amber-800/80">
            The learner can revise and resubmit this attempt. You can update the comments below or finalize as graded when ready.
          </p>
        </section>
      ) : null}

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
        Scores are clamped to each question&apos;s maximum. Saving a grade recalculates totals instantly;
        finalize once every open answer has a score. You can also return the attempt to the learner with comments and instructions without finalizing a grade.
      </div>

      <div className="space-y-5">
        {answers.map((answer, index) => {
          const response = parseData<Record<string, unknown>>(answer.response);
          const q = answer.question;
          const needsGrade = answer.score === null;
          return (
            <div key={answer.id} className="space-y-2">
              <QuestionReview
                index={index}
                question={{
                  type: q.type,
                  prompt: q.prompt,
                  mediaUrl: q.mediaUrl,
                  points: q.points,
                  data: q.data,
                  explanation: q.explanation,
                }}
                response={response}
                score={answer.score}
                feedback={answer.feedback}
                showKey
              />

              <div
                className={`rounded-2xl border p-4 ${
                  needsGrade ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-white"
                }`}
              >
                {needsGrade ? (
                  <form action={gradeAnswerAction} className="space-y-3">
                    <input type="hidden" name="attemptId" value={attempt.id} />
                    <input type="hidden" name="answerId" value={answer.id} />
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="label" htmlFor={`score-${answer.id}`}>
                          Score (max {answer.maxScore})
                        </label>
                        <input
                          id={`score-${answer.id}`}
                          name="score"
                          type="number"
                          min={0}
                          max={answer.maxScore}
                          step={0.25}
                          defaultValue={answer.maxScore}
                          required
                          className="input w-28"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <label className="label" htmlFor={`feedback-${answer.id}`}>
                          Feedback (optional)
                        </label>
                        <textarea
                          id={`feedback-${answer.id}`}
                          name="feedback"
                          rows={2}
                          placeholder="Great reasoning — check the sign in step 2."
                          className="textarea"
                        />
                      </div>
                      <SubmitButton pendingText="Saving…">Save grade</SubmitButton>
                    </div>
                  </form>
                ) : (
                  <details>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                        {answer.gradedById ? "Graded manually" : "Auto-graded"}
                        {answer.gradedAt && ` · ${formatDate(answer.gradedAt, true)}`}
                      </span>
                      <span className="font-semibold text-brand-600">Adjust score</span>
                    </summary>
                    <form action={gradeAnswerAction} className="mt-3 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="attemptId" value={attempt.id} />
                      <input type="hidden" name="answerId" value={answer.id} />
                      <div>
                        <label className="label" htmlFor={`regrade-${answer.id}`}>
                          Score (max {answer.maxScore})
                        </label>
                        <input
                          id={`regrade-${answer.id}`}
                          name="score"
                          type="number"
                          min={0}
                          max={answer.maxScore}
                          step={0.25}
                          defaultValue={answer.score ?? 0}
                          required
                          className="input w-28"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <label className="label" htmlFor={`regrade-feedback-${answer.id}`}>
                          Feedback (optional)
                        </label>
                        <textarea
                          id={`regrade-feedback-${answer.id}`}
                          name="feedback"
                          defaultValue={answer.feedback ?? ""}
                          rows={2}
                          className="textarea"
                        />
                      </div>
                      <SubmitButton variant="secondary" pendingText="Saving…">
                        Update
                      </SubmitButton>
                    </form>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {attempt.status !== "GRADED" && attempt.status !== "IN_PROGRESS" && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-bold text-brand-900">
                {open.length > 0
                  ? `${open.length} answer${open.length === 1 ? "" : "s"} still need a score`
                  : "Every answer has a score"}
              </p>
              <p className="text-[11px] text-brand-700">
                {open.length > 0
                  ? "Use the forms above, then finalize the attempt if you are ready to grade it."
                  : "Finalize to lock in the grade and release it to the learner."}
              </p>
            </div>
            <form action={finalizeAttemptAction}>
              <input type="hidden" name="attemptId" value={attempt.id} />
              <SubmitButton pendingText="Finalizing…">
                <CheckCircle2 className="size-4" /> Finalize grade
              </SubmitButton>
            </form>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-white p-5">
            <p className="text-sm font-bold text-slate-900">Return to learner without grading</p>
            <p className="mt-1 text-xs text-slate-600">
              Send this attempt back with comments and instructions for revision. The learner can update their answers and resubmit; this does not finalize a grade.
            </p>
            <form action={returnAttemptAction} className="mt-4 space-y-3">
              <input type="hidden" name="attemptId" value={attempt.id} />
              <div>
                <label htmlFor="returnNote" className="label">
                  Comments & instructions
                </label>
                <textarea
                  id="returnNote"
                  name="returnNote"
                  required
                  defaultValue={attempt.returnNote ?? ""}
                  rows={5}
                  placeholder="Explain what needs improvement and give clear instructions for what the learner should do next…"
                  className="textarea"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SubmitButton variant="secondary" pendingText="Returning…">
                  Return to learner
                </SubmitButton>
                <span className="text-[11px] text-slate-500">
                  Learners will see this feedback and can revise their attempt.
                </span>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
