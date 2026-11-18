import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CalendarCheck,
  Clock,
  Gauge,
  GraduationCap,
  Lightbulb,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { providerOptions } from "@/lib/ai/benchmark";
import { runBenchmarkAction } from "@/lib/actions/ai";
import { providerLabel } from "@/lib/ai/catalog";
import { RISK_META, asRiskBand } from "@/lib/ai/format";
import type { BenchmarkDriver } from "@/lib/ai/analytics";
import { Avatar, Badge, EmptyState, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate, timeAgo } from "@/lib/utils";

export const metadata = { title: "Learner insight" };

type Snapshot = {
  courseTitles?: string[];
  attendance?: {
    registers?: number;
    present?: number;
    late?: number;
    absent?: number;
    excused?: number;
    attendanceRate?: number | null;
    recentRate?: number | null;
    absenceStreak?: number;
    excusedShare?: number | null;
  };
  grades?: {
    gradedAttempts?: number;
    average?: number | null;
    passRate?: number | null;
    trend?: number | null;
    overdueAssessments?: number;
    lateSubmissions?: number;
    assessmentCompletion?: number | null;
    publishedAssessments?: number;
  };
  learning?: {
    lessonsCompleted?: number;
    lessonsPublished?: number;
    lessonCompletion?: number | null;
  };
  engagement?: { daysSinceLastActivity?: number | null; activeDays30?: number };
};

function readJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export default async function LearnerInsightPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ run?: string; error?: string }>;
}) {
  const { studentId } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");
  const requestedRun = sp.run?.trim() || "";

  const membership = await db.membership.findFirst({
    where: { tenantId: ctx.tenant.id, userId: studentId, role: "STUDENT" },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });
  if (!membership) notFound();
  const student = membership.user;

  const [options, benchmark] = await Promise.all([
    providerOptions(ctx.tenant.id),
    db.successBenchmark.findFirst({
      where: {
        tenantId: ctx.tenant.id,
        studentId,
        ...(requestedRun ? { runId: requestedRun } : {}),
      },
      include: { run: true, course: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const history = await db.successBenchmark.findMany({
    where: { tenantId: ctx.tenant.id, studentId },
    include: {
      run: { select: { id: true, status: true, provider: true, model: true } },
      course: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  const features = readJson<Snapshot>(benchmark?.features, {});
  const drivers = readJson<BenchmarkDriver[]>(benchmark?.drivers, []);
  const recommendations = readJson<string[]>(benchmark?.recommendations, []);
  const band = asRiskBand(benchmark?.riskBand);
  const meta = RISK_META[band];
  const attendance = features.attendance;
  const grades = features.grades;
  const learning = features.learning;
  const engagement = features.engagement;
  const courses = features.courseTitles ?? (benchmark?.course ? [benchmark.course.title] : []);

  return (
    <div>
      <PageHeader
        eyebrow="Success insight"
        title={
          <span className="flex items-center gap-3">
            <Avatar name={student.name} src={student.avatarUrl} size="md" />
            {student.name}
          </span>
        }
        subtitle={
          <span>
            {student.email}
            {courses.length > 0 ? ` · ${courses.join(", ")}` : ""}
          </span>
        }
        actions={
          <Link href="/dashboard/insights" className="btn-secondary btn-sm">
            <ArrowLeft className="size-3.5" /> All insights
          </Link>
        }
      />

      {sp.error && (
        <div className="mb-5 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{sp.error}</span>
        </div>
      )}

      {benchmark?.run.status === "FAILED" && (
        <div className="mb-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            The hosted model failed during this run, so this estimate comes from the private local
            model. {benchmark.run.error}
          </span>
        </div>
      )}

      {!benchmark ? (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <EmptyState
            icon={<BrainCircuit className="size-5" />}
            title="No estimate for this learner yet"
            description="Run a benchmark to combine attendance, excuses, task grades, submission habits and engagement into an explainable success estimate."
          />
          <RunCard options={options} studentId={student.id} courseId={null} />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-5">
            <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-6 text-white">
              <div
                className="pointer-events-none absolute inset-0 opacity-30"
                style={{
                  background:
                    "radial-gradient(circle at 88% 0%, #6366f1, transparent 55%), radial-gradient(circle at 5% 100%, #0ea5e9, transparent 45%)",
                }}
              />
              <div className="relative">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-300 uppercase">
                      Likelihood of staying on track
                    </p>
                    <div className="mt-1 flex items-end gap-2">
                      <p className="text-5xl font-bold tracking-tight">
                        {benchmark.successProbability}%
                      </p>
                      <span
                        className={`mb-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          band === "ON_TRACK"
                            ? "bg-emerald-500/20 text-emerald-200"
                            : band === "WATCH"
                              ? "bg-amber-500/20 text-amber-200"
                              : "bg-rose-500/20 text-rose-200"
                        }`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-2 max-w-lg text-sm font-semibold text-slate-100">
                      {benchmark.headline}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-3 py-2 text-right text-[10px] text-slate-200">
                    <p className="font-semibold">{benchmark.source === "AI" ? "Hosted model" : "Local model"}</p>
                    <p className="text-slate-400">{benchmark.model}</p>
                  </div>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
                  <div
                    className={`h-full rounded-full ${meta.bar}`}
                    style={{ width: `${benchmark.successProbability}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400">
                  <span>Confidence {benchmark.confidence}%</span>
                  <span>Run {formatDate(benchmark.createdAt, true)}</span>
                  <span>{benchmark.run.studentCount} learners in run</span>
                  <span>{providerLabel(benchmark.provider)}</span>
                </div>
                <p className="mt-4 max-w-2xl text-xs leading-6 text-slate-200">{benchmark.summary}</p>
              </div>
            </div>

            <div className="card p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Gauge className="size-4 text-brand-600" /> What is driving the estimate
              </h2>
              {drivers.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No drivers were captured for this run.</p>
              ) : (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {drivers.map((driver, index) => (
                    <li
                      key={`${driver.label}-${index}`}
                      className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-800">
                          {driver.label}
                        </span>
                        <Badge
                          tone={
                            driver.impact === "POSITIVE"
                              ? "green"
                              : driver.impact === "NEGATIVE"
                                ? "red"
                                : "slate"
                          }
                        >
                          {driver.impact === "POSITIVE"
                            ? "Positive"
                            : driver.impact === "NEGATIVE"
                              ? "Negative"
                              : "Neutral"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-slate-500">{driver.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Lightbulb className="size-4 text-amber-500" /> Recommended next steps
              </h2>
              {recommendations.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No recommendations for this run.</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {recommendations.map((recommendation, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-xs leading-5 text-slate-600">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700">
                        {index + 1}
                      </span>
                      {recommendation}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">
                Estimates support professional judgement. Confirm context with the learner before
                acting, and keep excused absences separate from unexcused ones.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              <Stat
                label="Attendance"
                value={
                  typeof attendance?.attendanceRate === "number"
                    ? `${attendance.attendanceRate}%`
                    : "—"
                }
                hint={`${attendance?.registers ?? 0} marks · ${attendance?.excused ?? 0} excused`}
                icon={<CalendarCheck className="size-4" />}
              />
              <Stat
                label="Grade average"
                value={typeof grades?.average === "number" ? `${grades.average}%` : "—"}
                hint={`${grades?.gradedAttempts ?? 0} graded · ${
                  typeof grades?.trend === "number"
                    ? `${grades.trend > 0 ? "+" : ""}${grades.trend} trend`
                    : "no trend"
                }`}
                icon={<GraduationCap className="size-4" />}
              />
              <Stat
                label="Assessments"
                value={
                  typeof grades?.assessmentCompletion === "number"
                    ? `${grades.assessmentCompletion}%`
                    : "—"
                }
                hint={`${grades?.publishedAssessments ?? 0} published · ${
                  grades?.overdueAssessments ?? 0
                } overdue`}
                icon={<ShieldAlert className="size-4" />}
              />
              <Stat
                label="Lessons"
                value={
                  typeof learning?.lessonCompletion === "number"
                    ? `${learning.lessonCompletion}%`
                    : "—"
                }
                hint={`${learning?.lessonsCompleted ?? 0}/${learning?.lessonsPublished ?? 0} completed`}
                icon={<Users className="size-4" />}
              />
            </div>

            <div className="card p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Clock className="size-4 text-slate-400" /> Attendance &amp; engagement
              </h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(
                  [
                    ["Present", attendance?.present ?? 0],
                    ["Late", attendance?.late ?? 0],
                    ["Absent", attendance?.absent ?? 0],
                    ["Excused", attendance?.excused ?? 0],
                  ] as const
                ).map(([label, value]) => (
                  <span
                    key={label}
                    className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600"
                  >
                    {value} {label.toLowerCase()}
                  </span>
                ))}
              </div>
              <dl className="mt-4 space-y-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Recent attendance (30d)</dt>
                  <dd className="font-semibold text-slate-700">
                    {typeof attendance?.recentRate === "number" ? `${attendance.recentRate}%` : "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Absence streak</dt>
                  <dd className="font-semibold text-slate-700">{attendance?.absenceStreak ?? 0}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Excused share</dt>
                  <dd className="font-semibold text-slate-700">
                    {typeof attendance?.excusedShare === "number"
                      ? `${attendance.excusedShare}%`
                      : "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Last activity</dt>
                  <dd className="font-semibold text-slate-700">
                    {typeof engagement?.daysSinceLastActivity === "number"
                      ? engagement.daysSinceLastActivity === 0
                        ? "Today"
                        : `${engagement.daysSinceLastActivity} days ago`
                      : "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Active days (30d)</dt>
                  <dd className="font-semibold text-slate-700">{engagement?.activeDays30 ?? 0}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400">Late submissions</dt>
                  <dd className="font-semibold text-slate-700">{grades?.lateSubmissions ?? 0}</dd>
                </div>
              </dl>
            </div>

            <RunCard
              options={options}
              studentId={student.id}
              courseId={benchmark.courseId}
            />

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold text-slate-900">Estimate history</h2>
              {history.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-400">No history yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {history.map((entry) => {
                    const entryBand = asRiskBand(entry.riskBand);
                    return (
                      <Link
                        key={entry.id}
                        href={`/dashboard/insights/${student.id}?run=${entry.runId}`}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition hover:border-brand-200 hover:bg-brand-50/40 ${
                          benchmark.id === entry.id
                            ? "border-brand-200 bg-brand-50/50"
                            : "border-slate-200"
                        }`}
                      >
                        <span className={`size-1.5 shrink-0 rounded-full ${RISK_META[entryBand].bar}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold text-slate-800">
                            {entry.successProbability}% · {RISK_META[entryBand].label}
                          </p>
                          <p className="truncate text-[10px] text-slate-400">
                            {entry.course?.title ?? "All courses"} · {providerLabel(entry.provider)} ·{" "}
                            {timeAgo(entry.createdAt)}
                          </p>
                        </div>
                        <ArrowRight className="size-3 shrink-0 text-slate-300" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RunCard({
  options,
  studentId,
  courseId,
}: {
  options: { value: string; label: string }[];
  studentId: string;
  courseId: string | null;
}) {
  return (
    <form action={runBenchmarkAction} className="card-pad">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <Sparkles className="size-4 text-brand-600" /> Re-run for this learner
      </h2>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">
        Recalculate the estimate now, or compare how a hosted model explains the same signals.
      </p>
      <input type="hidden" name="studentId" value={studentId} />
      {courseId && <input type="hidden" name="courseId" value={courseId} />}
      <div className="mt-3 space-y-3">
        <div>
          <label className="label" htmlFor="learner-provider">
            Model
          </label>
          <select id="learner-provider" name="provider" className="select">
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton className="w-full" pendingText="Analysing…">
          <Sparkles className="size-3.5" /> Run benchmark
        </SubmitButton>
      </div>
      <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
        <BrainCircuit className="size-3" />
        The local model always works without an API key.
      </p>
    </form>
  );
}
