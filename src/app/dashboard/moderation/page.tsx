import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  PenLine,
  ShieldCheck,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import {
  finalizeModerationAction,
  moderateAnswerAction,
  reviewCodePadModerationAction,
} from "@/lib/actions/moderation";
import { QuestionReview } from "@/components/QuestionReview";
import { Avatar, Badge, EmptyState, PageHeader, Stat, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { parseData } from "@/lib/questions";
import { formatDate, timeAgo } from "@/lib/utils";

export const metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    saved?: string;
    finalized?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("MODERATOR");
  const tab = sp.tab === "answers" || sp.tab === "finalize" ? sp.tab : "code";

  const [padSubmissions, attempts, padPending, padReviewed, attemptsSubmitted] = await Promise.all([
      db.codePadSubmission.findMany({
        where: { status: "SUBMITTED", pad: { tenantId: ctx.tenant.id } },
        include: {
          pad: { include: { course: { select: { id: true, title: true } } } },
          user: true,
        },
        orderBy: { submittedAt: "asc" },
        take: 200,
      }),
      db.attempt.findMany({
        where: { tenantId: ctx.tenant.id, status: "SUBMITTED" },
        include: {
          student: true,
          assessment: { include: { course: { select: { title: true } } } },
          answers: { include: { question: true } },
        },
        orderBy: { submittedAt: "asc" },
        take: 200,
      }),
      db.codePadSubmission.count({
        where: { status: "SUBMITTED", pad: { tenantId: ctx.tenant.id } },
      }),
      db.codePadSubmission.count({
        where: { status: "REVIEWED", pad: { tenantId: ctx.tenant.id } },
      }),
      db.attempt.count({ where: { tenantId: ctx.tenant.id, status: "SUBMITTED" } }),
    ]);

  const openAnswers = (attempts ?? []).reduce(
    (sum, attempt) => sum + attempt.answers.filter((answer) => answer.score === null).length,
    0
  );

  const needsGrading = attempts.filter((attempt) =>
    attempt.answers.some((answer) => answer.score === null)
  );
  const readyToFinalize = attempts.filter(
    (attempt) =>
      attempt.answers.length > 0 && attempt.answers.every((answer) => answer.score !== null)
  );

  const banner = sp.error
    ? { tone: "error" as const, message: sp.error }
    : sp.finalized
      ? { tone: "ok" as const, message: "Attempt finalized — results are now released." }
      : sp.saved
        ? { tone: "ok" as const, message: "Review saved." }
        : null;

  return (
    <div>
      <PageHeader
        eyebrow={`${ctx.tenant.name} · quality assurance`}
        title="Moderation"
        subtitle="Review submitted coding tasks and exam answers, then finalize grades."
        actions={
          <Badge tone="sky">
            <ShieldCheck className="mr-1 size-3" /> Staff queue
          </Badge>
        }
      />

      {banner && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            banner.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {banner.message}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Code tasks to review" value={padPending} icon={<Code2 className="size-4" />} />
        <Stat label="Code tasks reviewed" value={padReviewed} icon={<CheckCircle2 className="size-4" />} />
        <Stat label="Attempts to moderate" value={attemptsSubmitted} icon={<ClipboardCheck className="size-4" />} />
        <Stat label="Open answers" value={openAnswers} icon={<PenLine className="size-4" />} />
      </div>

      <div className="mt-6">
        <Tabs
          current={`/dashboard/moderation?tab=${tab}`}
          items={[
            { href: "/dashboard/moderation?tab=code", label: "Code tasks", count: padPending },
            { href: "/dashboard/moderation?tab=answers", label: "Open answers", count: needsGrading.length },
            { href: "/dashboard/moderation?tab=finalize", label: "Finalization", count: readyToFinalize.length },
          ]}
        />
      </div>

      {tab === "code" && (
        <section className="mt-5 space-y-4">
          {padSubmissions.length === 0 ? (
            <div className="card p-5">
              <EmptyState
                icon={<Code2 className="size-5" />}
                title="No coding tasks to review"
                description="Submitted coding-pad tasks from across the workspace appear here."
              />
            </div>
          ) : (
            padSubmissions.map((submission) => (
              <article key={submission.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={submission.user.name} src={submission.user.avatarUrl} size="sm" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        {submission.pad.title}
                        <span className="ml-1.5 font-normal text-slate-400">· {submission.user.name}</span>
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {submission.pad.course.title} · {submission.pad.language} · submitted{" "}
                        {submission.submittedAt ? timeAgo(submission.submittedAt) : "recently"}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/learn/${submission.pad.course.id}/pads/${submission.pad.id}`}
                    className="btn-ghost btn-sm"
                  >
                    Preview <ArrowRight className="size-3" />
                  </Link>
                </div>
                <div className="p-5">
                  {submission.pad.prompt && (
                    <p className="mb-3 text-xs leading-5 text-slate-600">{submission.pad.prompt}</p>
                  )}
                  <pre className="max-h-72 overflow-auto rounded-xl bg-slate-900 p-4 text-[11px] leading-5 text-slate-100">
                    {submission.code || "// No code submitted"}
                  </pre>
                  <form
                    action={reviewCodePadModerationAction}
                    className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end"
                  >
                    <input type="hidden" name="submissionId" value={submission.id} />
                    <div>
                      <label className="label">Score (0–100)</label>
                      <input
                        name="score"
                        type="number"
                        min={0}
                        max={100}
                        placeholder="0–100"
                        defaultValue={submission.score ?? ""}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Feedback</label>
                      <input
                        name="feedback"
                        defaultValue={submission.feedback ?? ""}
                        placeholder="What went well, what to improve…"
                        className="input"
                      />
                    </div>
                    <SubmitButton pendingText="Saving…">Approve & finalize</SubmitButton>
                  </form>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {tab === "answers" && (
        <section className="mt-5 space-y-6">
          {needsGrading.length === 0 ? (
            <div className="card p-5">
              <EmptyState
                icon={<ClipboardCheck className="size-5" />}
                title="No open answers"
                description="Exam and assignment answers awaiting a manual score appear here."
              />
            </div>
          ) : (
            needsGrading.map((attempt) => {
              const pending = attempt.answers.filter((answer) => answer.score === null);
              return (
                <article key={attempt.id} className="card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={attempt.student.name} src={attempt.student.avatarUrl} size="sm" />
                      <div>
                        <p className="text-xs font-bold text-slate-900">{attempt.assessment.title}</p>
                        <p className="text-[10px] text-slate-400">
                          {attempt.student.name} · {attempt.assessment.course.title} · submitted{" "}
                          {attempt.submittedAt ? formatDate(attempt.submittedAt, true) : "recently"}
                        </p>
                      </div>
                    </div>
                    <Badge tone="amber">{pending.length} to grade</Badge>
                  </div>
                  <div className="space-y-4 p-5">
                    {pending.map((answer) => {
                      const question = answer.question;
                      return (
                        <div key={answer.id} className="space-y-3">
                          <QuestionReview
                            question={{
                              type: question.type,
                              prompt: question.prompt,
                              mediaUrl: question.mediaUrl,
                              points: question.points,
                              data: question.data,
                            }}
                            response={parseData<Record<string, unknown>>(answer.response)}
                            score={answer.score}
                            feedback={answer.feedback}
                          />
                          <form
                            action={moderateAnswerAction}
                            className="grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end"
                          >
                            <input type="hidden" name="attemptId" value={attempt.id} />
                            <input type="hidden" name="answerId" value={answer.id} />
                            <div>
                              <label className="label">Score (max {answer.maxScore})</label>
                              <input
                                name="score"
                                type="number"
                                min={0}
                                max={answer.maxScore}
                                step={0.25}
                                defaultValue={answer.maxScore}
                                className="input"
                              />
                            </div>
                            <div>
                              <label className="label">Feedback</label>
                              <input
                                name="feedback"
                                defaultValue={answer.feedback ?? ""}
                                placeholder="Optional feedback for the learner"
                                className="input"
                              />
                            </div>
                            <SubmitButton pendingText="Saving…">Save grade</SubmitButton>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })
          )}
        </section>
      )}

      {tab === "finalize" && (
        <section className="mt-5 space-y-3">
          <p className="text-[11px] text-slate-500">
            Attempts where every answer has a score. Finalizing locks the grade and releases results
            for assessments set to manual release.
          </p>
          {readyToFinalize.length === 0 ? (
            <div className="card p-5">
              <EmptyState
                icon={<CheckCircle2 className="size-5" />}
                title="Nothing to finalize"
                description="Grade every open answer first, then return here to finalize."
              />
            </div>
          ) : (
            readyToFinalize.map((attempt) => (
              <article
                key={attempt.id}
                className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="text-xs font-bold text-slate-900">{attempt.assessment.title}</p>
                  <p className="text-[10px] text-slate-400">
                    {attempt.student.name} · {attempt.assessment.course.title} ·{" "}
                    {Math.round((attempt.score ?? 0) * 100) / 100}/{attempt.maxScore} points
                  </p>
                </div>
                <form action={finalizeModerationAction}>
                  <input type="hidden" name="attemptId" value={attempt.id} />
                  <SubmitButton pendingText="Finalizing…" confirm="Finalize and release this grade?">
                    <CheckCircle2 className="size-4" /> Finalize grade
                  </SubmitButton>
                </form>
              </article>
            ))
          )}
        </section>
      )}
    </div>
  );
}
