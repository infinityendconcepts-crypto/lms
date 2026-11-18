import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CalendarCheck,
  Clock,
  Gauge,
  Settings2,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { canAdmin, requireTenant } from "@/lib/tenant";
import { providerOptions } from "@/lib/ai/benchmark";
import { runBenchmarkAction } from "@/lib/actions/ai";
import { providerLabel } from "@/lib/ai/catalog";
import { RISK_BANDS, RISK_META, asRiskBand, type RiskBand } from "@/lib/ai/format";
import { Avatar, Badge, EmptyState, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate, timeAgo } from "@/lib/utils";

export const metadata = { title: "Success insights" };

type FeatureSnapshot = {
  courseTitles?: string[];
  attendance?: { attendanceRate?: number | null; registers?: number };
  grades?: { average?: number | null; overdueAssessments?: number };
  engagement?: { daysSinceLastActivity?: number | null };
};

function readJson<T>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function riskTone(band: RiskBand) {
  return RISK_META[band].tone;
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; course?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");
  const admin = canAdmin(ctx.role);
  const requestedRun = sp.run?.trim() || "";
  const courseFilter = sp.course?.trim() || "";

  const [courses, options, runs] = await Promise.all([
    db.course.findMany({
      where: { tenantId: ctx.tenant.id },
      select: { id: true, title: true, status: true },
      orderBy: { title: "asc" },
    }),
    providerOptions(ctx.tenant.id),
    db.aiBenchmarkRun.findMany({
      where: { tenantId: ctx.tenant.id },
      include: {
        course: { select: { title: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const latestRun = await db.aiBenchmarkRun.findFirst({
    where: {
      tenantId: ctx.tenant.id,
      ...(requestedRun ? { id: requestedRun } : {}),
    },
    include: {
      course: { select: { id: true, title: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const missingRun = Boolean(requestedRun) && !latestRun;

  const benchmarks =
    latestRun && !missingRun
      ? await db.successBenchmark.findMany({
          where: { runId: latestRun.id },
          include: {
            student: { select: { id: true, name: true, email: true, avatarUrl: true } },
            course: { select: { title: true } },
          },
          orderBy: [{ successProbability: "asc" }, { student: { name: "asc" } }],
        })
      : [];

  const bands = RISK_BANDS.reduce(
    (acc, band) => {
      acc[band] = benchmarks.filter((b) => asRiskBand(b.riskBand) === band).length;
      return acc;
    },
    { ON_TRACK: 0, WATCH: 0, AT_RISK: 0, CRITICAL: 0 } as Record<RiskBand, number>
  );
  const average =
    benchmarks.length > 0
      ? Math.round(
          benchmarks.reduce((sum, b) => sum + b.successProbability, 0) / benchmarks.length
        )
      : 0;
  const needsSupport = bands.AT_RISK + bands.CRITICAL;
  const hostedModels = options.filter(
    (option) => option.value.startsWith("config:") || option.value.startsWith("env:")
  );
  const activeModel = hostedModels[0];

  return (
    <div>
      <PageHeader
        eyebrow="People & insight"
        title="Success insights"
        subtitle="Estimate how likely each learner is to stay on track using attendance, excuses, task grades, submission habits and engagement. The local model always works — connect a hosted model to refine it."
        actions={
          admin ? (
            <Link href="/dashboard/settings?tab=ai" className="btn-secondary btn-sm">
              <Settings2 className="size-3.5" /> AI models
            </Link>
          ) : undefined
        }
      />

      {sp.error && (
        <div className="mb-5 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{sp.error}</span>
        </div>
      )}

      {latestRun?.status === "FAILED" && (
        <div className="mb-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>{providerLabel(latestRun.provider)}</b> could not complete this run, so Nkanyezi fell
            back to the private local model. {latestRun.error}
          </span>
        </div>
      )}

      {latestRun?.status === "PARTIAL" && (
        <div className="mb-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{latestRun.error ?? "The model returned predictions for some learners only."}</span>
        </div>
      )}

      {missingRun && (
        <div className="mb-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>That benchmark run could not be found. Showing your most recent run instead.</span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.65fr_1fr]">
        <div className="space-y-5">
          <form
            action={runBenchmarkAction}
            className="card grid gap-3 p-4 sm:grid-cols-[1.2fr_1fr_auto] sm:items-end"
          >
            <div>
              <label className="label" htmlFor="bench-course">
                Cohort
              </label>
              <select id="bench-course" name="courseId" defaultValue={courseFilter} className="select">
                <option value="">All learners in this workspace</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                    {course.status !== "PUBLISHED" ? " (draft)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="bench-provider">
                Model
              </label>
              <select id="bench-provider" name="provider" className="select">
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton pendingText="Analysing…">
              <Sparkles className="size-3.5" /> Run benchmark
            </SubmitButton>
            <p className="text-[10px] leading-4 text-slate-400 sm:col-span-3">
              {admin ? (
                <>
                  Hosted models receive a learner ID, first name and learning signals only — never
                  email addresses or free-text notes.{" "}
                  <Link href="/dashboard/settings?tab=ai" className="font-semibold text-brand-600 hover:underline">
                    Configure models →
                  </Link>
                </>
              ) : (
                <>The local model runs privately with no API key. Ask an admin to connect a hosted model.</>
              )}
            </p>
          </form>

          {latestRun ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  label="Cohort outlook"
                  value={`${average}%`}
                  hint={latestRun.course?.title ?? "All courses"}
                  icon={<Gauge className="size-4" />}
                />
                <Stat
                  label="On track"
                  value={bands.ON_TRACK}
                  hint={`${benchmarks.length} learner${benchmarks.length === 1 ? "" : "s"} analysed`}
                  icon={<Users className="size-4" />}
                />
                <Stat
                  label="Need support"
                  value={needsSupport}
                  hint={`${bands.CRITICAL} critical · ${bands.AT_RISK} at risk`}
                  icon={<TriangleAlert className="size-4" />}
                />
                <Stat
                  label="Run time"
                  value={`${(latestRun.latencyMs / 1000).toFixed(1)}s`}
                  hint={
                    latestRun.source === "AI"
                      ? `Hosted model · ${latestRun.model}`
                      : "Local model · nkanyezi-local-v1"
                  }
                  icon={<Clock className="size-4" />}
                />
              </div>

              <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <BrainCircuit className="size-4 text-brand-600" /> Risk distribution
                  </h2>
                  <span className="text-[10px] text-slate-400">
                    {formatDate(latestRun.createdAt, true)} · run by{" "}
                    {latestRun.createdBy?.name ?? "system"}
                  </span>
                </div>
                <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                  {RISK_BANDS.map((band) =>
                    bands[band] > 0 ? (
                      <div
                        key={band}
                        className={RISK_META[band].bar}
                        style={{ width: `${(bands[band] / benchmarks.length) * 100}%` }}
                        title={`${RISK_META[band].label}: ${bands[band]}`}
                      />
                    ) : null
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {RISK_BANDS.map((band) => (
                    <div key={band} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                        <span className={`size-1.5 rounded-full ${RISK_META[band].bar}`} />
                        {RISK_META[band].label}
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-slate-900">{bands[band]}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] leading-4 text-slate-400">
                  {latestRun.status === "SUCCESS"
                    ? `${latestRun.okCount} of ${latestRun.studentCount} learners analysed`
                    : `${latestRun.okCount} of ${latestRun.studentCount} learners have a usable estimate`}
                  {latestRun.tokensIn + latestRun.tokensOut > 0
                    ? ` · ${(latestRun.tokensIn + latestRun.tokensOut).toLocaleString()} tokens`
                    : ""}
                  {latestRun.course ? ` · ${latestRun.course.title}` : " · all courses"}.
                </p>
              </div>

              {benchmarks.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-5" />}
                  title="No learner snapshots in this run"
                  description="Run the benchmark again with a cohort that has learners enrolled."
                />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Learner</th>
                        <th>Likelihood</th>
                        <th>Signals</th>
                        <th className="text-right">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarks.map((benchmark) => {
                        const band = asRiskBand(benchmark.riskBand);
                        const meta = RISK_META[band];
                        const features = readJson<FeatureSnapshot>(benchmark.features, {});
                        const attendance = features.attendance?.attendanceRate;
                        const grades = features.grades?.average;
                        const idle = features.engagement?.daysSinceLastActivity;
                        const courseTitle =
                          benchmark.course?.title ?? features.courseTitles?.[0] ?? "—";
                        return (
                          <tr key={benchmark.id}>
                            <td>
                              <div className="flex items-center gap-2.5">
                                <Avatar
                                  name={benchmark.student.name}
                                  src={benchmark.student.avatarUrl}
                                  size="sm"
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-slate-900">
                                    {benchmark.student.name}
                                  </p>
                                  <p className="truncate text-[10px] text-slate-400">
                                    {courseTitle}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="min-w-36">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${meta.text}`}>
                                  {benchmark.successProbability}%
                                </span>
                                <Badge tone={riskTone(band)}>{meta.label}</Badge>
                              </div>
                              <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${meta.bar}`}
                                  style={{ width: `${benchmark.successProbability}%` }}
                                />
                              </div>
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                                {typeof attendance === "number" && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-0.5">
                                    <CalendarCheck className="size-2.5" /> {attendance}% present
                                  </span>
                                )}
                                {typeof grades === "number" && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-0.5">
                                    <Gauge className="size-2.5" /> {grades}% grades
                                  </span>
                                )}
                                {typeof idle === "number" && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-0.5">
                                    <Clock className="size-2.5" />{" "}
                                    {idle === 0 ? "active today" : `${idle}d idle`}
                                  </span>
                                )}
                                {(features.grades?.overdueAssessments ?? 0) > 0 && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-600">
                                    {features.grades?.overdueAssessments} overdue
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="text-right">
                              <Link
                                href={`/dashboard/insights/${benchmark.student.id}?run=${latestRun.id}`}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline"
                              >
                                Open <ArrowRight className="size-3" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={<BrainCircuit className="size-5" />}
              title="No benchmark run yet"
              description="Run the local model to get an instant, private estimate for every learner. Connecting a hosted model adds richer explanations and recommendations."
            />
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">How it works</h2>
            <ul className="mt-3 space-y-2.5 text-[11px] leading-5 text-slate-600">
              <li>
                <b className="text-slate-800">Grades (34%)</b> — average task score, pass rate and
                grade trend.
              </li>
              <li>
                <b className="text-slate-800">Attendance (26%)</b> — present and late marks, with
                excused absences handled separately.
              </li>
              <li>
                <b className="text-slate-800">Completion (24%)</b> — submitted assessments and
                completed lessons.
              </li>
              <li>
                <b className="text-slate-800">Behaviour (14%)</b> — engagement recency, overdue
                work, late submissions and absence streaks.
              </li>
            </ul>
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">
              Estimates support professional judgement. They are not a grade, a diagnosis or a
              decision about a learner.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">Current model</h2>
              <Badge tone={activeModel ? "brand" : "slate"}>
                {activeModel ? "Hosted ready" : "Local only"}
              </Badge>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-600">
              {activeModel
                ? `${activeModel.label} is available. Pick it in the model menu for richer explanations.`
                : admin
                  ? "The deterministic local model is active. Add a hosted model in Settings → AI models whenever you are ready."
                  : "The deterministic local model is active and always available. Ask a workspace admin to connect a hosted model for richer explanations."}
            </p>
            {admin && (
              <Link
                href="/dashboard/settings?tab=ai"
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline"
              >
                Manage AI models <ArrowRight className="size-3" />
              </Link>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">Recent runs</h2>
            {runs.length === 0 ? (
              <p className="mt-2 text-[11px] text-slate-400">No runs yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {runs.map((run) => (
                  <Link
                    key={run.id}
                    href={`/dashboard/insights?run=${run.id}`}
                    className={`block rounded-xl border px-3 py-2.5 transition hover:border-brand-200 hover:bg-brand-50/40 ${
                      latestRun?.id === run.id ? "border-brand-200 bg-brand-50/50" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-semibold text-slate-800">
                        {run.course?.title ?? "All courses"}
                      </span>
                      <Badge
                        tone={
                          run.status === "SUCCESS"
                            ? "green"
                            : run.status === "PARTIAL"
                              ? "amber"
                              : "red"
                        }
                      >
                        {run.status.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-slate-400">
                      {providerLabel(run.provider)} · {run.studentCount} learners ·{" "}
                      {timeAgo(run.createdAt)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
