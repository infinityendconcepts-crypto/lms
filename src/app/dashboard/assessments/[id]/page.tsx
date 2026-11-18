import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Library,
  Plus,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import {
  addFromBankAction,
  deleteQuestionAction,
  duplicateQuestionAction,
  moveQuestionAction,
  saveToBankAction,
  updateAssessmentAction,
} from "@/lib/actions/assessment";
import { Badge, EmptyState, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { MathText } from "@/components/MathText";
import { CopyButton } from "@/components/CopyButton";
import { QuestionBuilder } from "@/components/QuestionBuilder";
import {
  QUESTION_META,
  parseData,
  type QuestionDataShape,
  type QuestionType,
} from "@/lib/questions";
import { appUrl } from "@/lib/email";
import { formatDate, pct } from "@/lib/utils";

export const metadata = { title: "Assessment builder" };

function toLocalInput(date: Date | null) {
  if (!date) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function answerKey(type: string, data: string) {
  const d = parseData<QuestionDataShape>(data);
  switch (type) {
    case "MULTIPLE_CHOICE":
    case "IMAGE_BASED": {
      const options = (d.options ?? []) as { id: string; text: string }[];
      const correct = (d.correct ?? []) as string[];
      const labels = options
        .filter((o) => correct.includes(o.id))
        .map((o, i) => `${String.fromCharCode(65 + i)}. ${o.text || "(empty)"}`);
      return labels.length ? labels.join("  ·  ") : "No correct option set";
    }
    case "YES_NO":
      return d.correct ? "Yes" : "No";
    case "NUMERIC":
      return `${d.answer}${d.tolerance ? ` ± ${d.tolerance}` : ""}${d.units ? ` ${d.units}` : ""}`;
    case "FORMULA":
      return `$$${d.answer}$$`;
    case "FILL_BLANK":
      return ((d.blanks ?? []) as { accepted: string[] }[])
        .map((b, i) => `${i + 1}. ${(b.accepted ?? []).join(" / ")}`)
        .join("  ·  ");
    case "MATCHING":
      return `${Object.keys(d.pairs ?? {}).length} pairs`;
    case "OPEN_ENDED":
      return "Rubric graded";
    case "CASE_STUDY":
      return `${((d.subQuestions ?? []) as unknown[]).length} nested questions`;
    default:
      return "";
  }
}

export default async function AssessmentBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; add?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");

  const assessment = await db.assessment.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      course: true,
      questions: { orderBy: { order: "asc" } },
      attempts: {
        include: { student: true },
        orderBy: { startedAt: "desc" },
      },
    },
  });
  if (!assessment) notFound();

  const [bank, stages] = await Promise.all([
    db.question.findMany({
      where: { tenantId: ctx.tenant.id, assessmentId: null },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.courseStage.findMany({
      where: { courseId: assessment.courseId },
      orderBy: { order: "asc" },
    }),
  ]);

  const totalPoints = assessment.questions.reduce((sum, q) => sum + q.points, 0);
  const submitted = assessment.attempts.filter((a) => a.status !== "IN_PROGRESS");
  const avg = submitted.length
    ? Math.round(
        submitted.reduce((sum, a) => sum + pct(a.score ?? 0, a.maxScore), 0) / submitted.length
      )
    : 0;

  return (
    <div>
      <Link
        href={`/dashboard/courses/${assessment.courseId}?tab=assessments`}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="size-3.5" /> {assessment.course.title}
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={assessment.status} />
            <Badge tone="brand">{assessment.type.toLowerCase()}</Badge>
            <Badge>{assessment.questions.length} questions</Badge>
            <Badge tone="sky">{totalPoints} points</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
            {assessment.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {assessment.timeLimitMin ? `${assessment.timeLimitMin} min limit` : "No time limit"} ·{" "}
            {assessment.attemptsAllowed} attempt{assessment.attemptsAllowed > 1 ? "s" : ""} · pass at{" "}
            {assessment.passScore}%
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {assessment.status === "PUBLISHED" && (
            <CopyButton value={appUrl(`/quiz/${assessment.id}`)} label="Copy learner link" />
          )}
          <Link
            href={`/dashboard/grading?assessment=${assessment.id}`}
            className="btn-secondary btn-sm"
          >
            <ClipboardCheck className="size-3.5" /> Submissions ({submitted.length})
          </Link>
          <a href="#settings" className="btn-primary btn-sm">
            <Settings2 className="size-3.5" /> Settings
          </a>
        </div>
      </div>

      {(sp.saved || sp.error) && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            sp.error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {sp.error ??
            (sp.saved === "question"
              ? "Question saved."
              : sp.saved === "duplicate"
                ? "Question duplicated."
                : sp.saved === "bank"
                  ? "Question copied from the bank."
                  : "Assessment settings saved.")}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Questions", assessment.questions.length],
          ["Total points", totalPoints],
          ["Submitted", submitted.length],
          ["Average", `${avg}%`],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-4">
            <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              {label as string}
            </p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">{value as string}</p>
          </div>
        ))}
      </div>

      {/* Settings */}
      <details id="settings" className="card mb-6 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Settings2 className="size-4 text-slate-400" /> Assessment settings
          </span>
          <span className="text-[11px] text-slate-400">
            {assessment.status === "PUBLISHED" ? "Live for learners" : "Not published"}
          </span>
        </summary>
        <form action={updateAssessmentAction} className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-2">
          <input type="hidden" name="assessmentId" value={assessment.id} />
          <div className="sm:col-span-2">
            <label className="label" htmlFor="a-title">
              Title
            </label>
            <input id="a-title" name="title" defaultValue={assessment.title} required className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="a-instructions">
              Instructions for learners
            </label>
            <textarea
              id="a-instructions"
              name="instructions"
              defaultValue={assessment.instructions}
              rows={3}
              placeholder="Show your working. Calculators are permitted."
              className="textarea"
            />
          </div>
          <div>
            <label className="label" htmlFor="a-type">
              Type
            </label>
            <select id="a-type" name="type" defaultValue={assessment.type} className="select">
              <option value="QUIZ">Quiz — closed questions only</option>
              <option value="EXAM">Exam</option>
              <option value="ASSIGNMENT">Assignment</option>
              <option value="PLACEMENT">Placement pre-assessment</option>
            </select>
            <p className="mt-1 text-[10px] text-slate-400">
              Quizzes cannot contain open-ended questions.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="a-stage">
              Organogram stage
            </label>
            <select id="a-stage" name="stageId" defaultValue={assessment.stageId ?? ""} className="select">
              <option value="">Unassigned</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="a-status">
              Status
            </label>
            <select id="a-status" name="status" defaultValue={assessment.status} className="select">
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:col-span-2">
            <div>
              <label className="label" htmlFor="a-time">
                Time limit (min)
              </label>
              <input
                id="a-time"
                name="timeLimitMin"
                type="number"
                min={1}
                defaultValue={assessment.timeLimitMin ?? ""}
                placeholder="None"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="a-attempts">
                Attempts
              </label>
              <input
                id="a-attempts"
                name="attemptsAllowed"
                type="number"
                min={1}
                max={10}
                defaultValue={assessment.attemptsAllowed}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="a-pass">
                Pass score (%)
              </label>
              <input
                id="a-pass"
                name="passScore"
                type="number"
                min={0}
                max={100}
                defaultValue={assessment.passScore}
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="a-open">
              Opens at (optional)
            </label>
            <input
              id="a-open"
              name="openAt"
              type="datetime-local"
              defaultValue={toLocalInput(assessment.openAt)}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="a-due">
              Due at (optional)
            </label>
            <input
              id="a-due"
              name="dueAt"
              type="datetime-local"
              defaultValue={toLocalInput(assessment.dueAt)}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="a-results">
              Release results
            </label>
            <select
              id="a-results"
              name="showResults"
              defaultValue={assessment.showResults}
              className="select"
            >
              <option value="AFTER_SUBMIT">Immediately after submit</option>
              <option value="AFTER_DUE">After the due date</option>
              <option value="MANUAL">Manually (after I grade)</option>
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                name="randomize"
                defaultChecked={assessment.randomize}
                className="size-4"
              />
              Shuffle question order per learner
            </label>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
          </div>
        </form>
      </details>

      {/* Questions */}
      <section id="questions" className="scroll-mt-20">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-tight text-slate-900">
            Questions <span className="text-slate-400">({assessment.questions.length})</span>
          </h2>
          <span className="text-[11px] text-slate-400">Mix any of the nine types</span>
        </div>

        {assessment.questions.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="size-5" />}
            title="No questions yet"
            description="Add your first question below. Math, images, case studies — all supported."
          />
        ) : (
          <div className="space-y-3">
            {assessment.questions.map((q, index) => {
              const meta = QUESTION_META[q.type as QuestionType] ?? QUESTION_META.MULTIPLE_CHOICE;
              const key = answerKey(q.type, q.data);
              return (
                <div key={q.id} className="card overflow-hidden">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                    <div className="flex items-center gap-2 sm:flex-col">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-500">
                        {index + 1}
                      </span>
                      <div className="flex gap-0.5 sm:flex-col">
                        <form action={moveQuestionAction}>
                          <input type="hidden" name="questionId" value={q.id} />
                          <input type="hidden" name="direction" value="up" />
                          <button
                            className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            disabled={index === 0}
                            title="Move up"
                          >
                            <ArrowUp className="size-3" />
                          </button>
                        </form>
                        <form action={moveQuestionAction}>
                          <input type="hidden" name="questionId" value={q.id} />
                          <input type="hidden" name="direction" value="down" />
                          <button
                            className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                            disabled={index === assessment.questions.length - 1}
                            title="Move down"
                          >
                            <ArrowDown className="size-3" />
                          </button>
                        </form>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`badge ${meta.badge}`}>{meta.label}</span>
                        <Badge>{q.points} pt{q.points === 1 ? "" : "s"}</Badge>
                        <Badge tone={q.difficulty === "HARD" ? "red" : q.difficulty === "EASY" ? "green" : "slate"}>
                          {q.difficulty.toLowerCase()}
                        </Badge>
                        {q.tags && <span className="text-[10px] text-slate-400">#{q.tags}</span>}
                      </div>
                      <div className="mt-2">
                        <MathText content={q.prompt || "_No prompt_"} />
                      </div>
                      {q.mediaUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={q.mediaUrl}
                          alt="Question media"
                          className="mt-2 max-h-40 rounded-lg border border-slate-200"
                        />
                      )}
                      <p className="mt-2 rounded-lg bg-emerald-50/60 px-2.5 py-1.5 text-[10px] text-emerald-800">
                        <span className="font-bold uppercase">Key</span>{" "}
                        {key.includes("$") ? <MathText content={key} inline /> : key}
                      </p>

                      <details className="mt-2">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[10px] font-semibold text-brand-600 hover:underline">
                          Edit question
                        </summary>
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                          <QuestionBuilder
                            assessmentId={assessment.id}
                            courseId={assessment.courseId}
                            allowOpenEnded={assessment.type !== "QUIZ"}
                            initial={{
                              id: q.id,
                              type: q.type,
                              prompt: q.prompt,
                              mediaUrl: q.mediaUrl,
                              points: q.points,
                              difficulty: q.difficulty,
                              tags: q.tags,
                              data: q.data,
                              explanation: q.explanation,
                            }}
                          />
                        </div>
                      </details>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1 sm:flex-col sm:items-stretch">
                      <form action={duplicateQuestionAction}>
                        <input type="hidden" name="questionId" value={q.id} />
                        <SubmitButton variant="ghost" className="btn-sm w-full justify-start" pendingText="…">
                          <Copy className="size-3" /> Duplicate
                        </SubmitButton>
                      </form>
                      <form action={saveToBankAction}>
                        <input type="hidden" name="questionId" value={q.id} />
                        <SubmitButton variant="ghost" className="btn-sm w-full justify-start" pendingText="…">
                          <Banknote className="size-3" /> To bank
                        </SubmitButton>
                      </form>
                      <form action={deleteQuestionAction}>
                        <input type="hidden" name="questionId" value={q.id} />
                        <SubmitButton
                          variant="ghost"
                          className="btn-sm w-full justify-start text-rose-600"
                          confirm="Delete this question?"
                        >
                          <Trash2 className="size-3" /> Delete
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <details open={sp.add === "1" || assessment.questions.length === 0} className="card overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <span className="flex size-6 items-center justify-center rounded-lg bg-brand-600 text-white">
                  <Plus className="size-3.5" />
                </span>
                Add a question
              </span>
              <span className="text-[11px] text-slate-400">Any type · LaTeX ready</span>
            </summary>
            <div className="border-t border-slate-100 p-5">
              <QuestionBuilder
                assessmentId={assessment.id}
                courseId={assessment.courseId}
                allowOpenEnded={assessment.type !== "QUIZ"}
              />
            </div>
          </details>

          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <Library className="size-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">From your question bank</h3>
                  <p className="text-[10px] text-slate-500">Reuse questions across courses</p>
                </div>
              </div>
              {bank.length === 0 ? (
                <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-400">
                  The bank is empty. Use “To bank” on any question to save a copy.
                </p>
              ) : (
                <form action={addFromBankAction} className="mt-3 space-y-2">
                  <input type="hidden" name="assessmentId" value={assessment.id} />
                  <select name="bankQuestionId" required className="select text-xs">
                    <option value="">Choose a bank question…</option>
                    {bank.map((q) => (
                      <option key={q.id} value={q.id}>
                        [{QUESTION_META[q.type as QuestionType]?.short ?? q.type}]{" "}
                        {q.prompt.replace(/[$#*]/g, "").slice(0, 70)}
                      </option>
                    ))}
                  </select>
                  <SubmitButton variant="secondary" className="w-full" pendingText="Adding…">
                    <Plus className="size-3.5" /> Add to assessment
                  </SubmitButton>
                </form>
              )}
              <Link
                href="/dashboard/bank"
                className="mt-3 block text-center text-[11px] font-semibold text-brand-600 hover:underline"
              >
                Open question bank →
              </Link>
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-bold text-slate-900">Learner link</h3>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                Enrolled learners can start the assessment from the course page.
              </p>
              <div className="mt-3">
                <CopyButton value={appUrl(`/quiz/${assessment.id}`)} label="Copy direct link" />
              </div>
              <p className="mt-2 text-[10px] text-slate-400">
                {assessment.status === "PUBLISHED"
                  ? "Link is live while the assessment is published."
                  : "Publish the assessment to activate the link."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Submissions */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-tight text-slate-900">Submissions</h2>
          <Link href="/dashboard/grading" className="text-xs font-semibold text-brand-600 hover:underline">
            Grading queue
          </Link>
        </div>
        {assessment.attempts.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="No submissions yet"
            description="Once learners start this assessment, their attempts appear here."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Started</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assessment.attempts.map((attempt) => {
                  const percent = pct(attempt.score ?? 0, attempt.maxScore);
                  return (
                    <tr key={attempt.id}>
                      <td className="font-medium text-slate-900">{attempt.student.name}</td>
                      <td>
                        <StatusBadge status={attempt.status} />
                      </td>
                      <td className="tabular-nums">
                        {attempt.status === "GRADED"
                          ? `${attempt.score ?? 0} / ${attempt.maxScore} (${percent}%)`
                          : "—"}
                      </td>
                      <td className="text-[11px] text-slate-500">{formatDate(attempt.startedAt, true)}</td>
                      <td className="text-[11px] text-slate-500">
                        {attempt.submittedAt ? formatDate(attempt.submittedAt, true) : "—"}
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/dashboard/grading/${attempt.id}`}
                          className="text-[11px] font-semibold text-brand-600 hover:underline"
                        >
                          {attempt.status === "SUBMITTED" ? "Grade →" : "Review →"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-8 flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-xs text-brand-800">
        <CheckCircle2 className="size-4 shrink-0" />
        Objective answers grade themselves. Case studies and open answers are queued for manual review.
      </div>
    </div>
  );
}
