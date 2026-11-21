import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Lightbulb,
  Plus,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant, canTeach } from "@/lib/tenant";
import { Avatar, Badge, EmptyState, PageHeader, Progress, Stat, StatusBadge } from "@/components/ui";
import { BarChart, ChartCard, DonutChart, HorizontalBarChart, ScoreDistributionChart } from "@/components/charts";
import { RISK_META, asRiskBand, type RiskBand } from "@/lib/ai/format";
import { formatDate, pct, timeAgo } from "@/lib/utils";

export const metadata = { title: "Overview" };

type LearnerRiskSnapshot = {
  courseTitles?: string[];
  attendance?: {
    registers?: number;
    attendanceRate?: number | null;
    recentRate?: number | null;
    absenceStreak?: number;
    excusedShare?: number | null;
  };
  grades?: {
    average?: number | null;
    passRate?: number | null;
    trend?: number | null;
    overdueAssessments?: number;
    lateSubmissions?: number;
    assessmentCompletion?: number | null;
    publishedAssessments?: number;
    gradedAttempts?: number;
  };
  learning?: {
    lessonsCompleted?: number;
    lessonsPublished?: number;
    lessonCompletion?: number | null;
  };
  engagement?: { daysSinceLastActivity?: number | null; activeDays30?: number };
};

function readLearnerRiskJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function learnerMitigationSuggestions(band: RiskBand, features: LearnerRiskSnapshot): string[] {
  const tips: string[] = [];
  const attendance = features.attendance ?? {};
  const grades = features.grades ?? {};
  const learning = features.learning ?? {};
  const engagement = features.engagement ?? {};

  if ((attendance.attendanceRate ?? 100) < 80 || (attendance.absenceStreak ?? 0) >= 2) {
    tips.push("Prioritize attending upcoming classes and let your teacher know early if you can't make it.");
  }
  if ((grades.overdueAssessments ?? 0) > 0 || (grades.assessmentCompletion ?? 100) < 70) {
    tips.push("Check for missing or overdue assessments and submit them as soon as you can.");
  }
  if ((grades.average ?? 100) < 60 || (grades.passRate ?? 100) < 60) {
    tips.push("Review feedback on recent attempts and focus practice on topics where you lost marks.");
  }
  if ((grades.trend ?? 0) <= -5) {
    tips.push("Your recent scores dipped—revisit lesson materials and ask for help on tricky areas.");
  }
  if ((grades.lateSubmissions ?? 0) > 0) {
    tips.push("Plan ahead for deadlines so you have time to submit work on time.");
  }
  if ((engagement.daysSinceLastActivity ?? 0) > 7) {
    tips.push("Log in regularly and complete a small task each day to rebuild momentum.");
  }
  if ((learning.lessonCompletion ?? 100) < 60 && (learning.lessonsPublished ?? 0) > 0) {
    tips.push("Work through unfinished lessons step by step to stay caught up.");
  }
  if ((attendance.excusedShare ?? 0) >= 25) {
    tips.push("Follow up on missed sessions and complete any make-up work shared by your teacher.");
  }

  if (tips.length === 0) {
    if (band === "ON_TRACK") {
      tips.push("Keep up your current routine and ask your teacher for extension work if you want a challenge.");
    } else {
      tips.push("Keep checking your tasks and reach out to your teacher if anything is unclear or difficult.");
    }
  }

  return tips.slice(0, 4);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; joined?: string; error?: string; denied?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant();
  const teacher = canTeach(ctx.role);

  const banner = sp.welcome
    ? "Your workspace is ready. Create a course, add a lesson and publish your first assessment."
    : sp.joined
      ? `Welcome to ${ctx.tenant.name}! Your courses are waiting below.`
      : sp.error
        ? sp.error
        : sp.denied
          ? "You do not have permission to open that page."
          : null;

  if (!teacher) {
    const [enrollments, attempts, completed, riskBenchmark] = await Promise.all([
      db.enrollment.findMany({
        where: { userId: ctx.user.id, tenantId: ctx.tenant.id },
        include: {
          course: {
            include: {
              lessons: { where: { published: true }, orderBy: { order: "asc" } },
              assessments: { where: { status: "PUBLISHED" }, orderBy: { dueAt: "asc" } },
              owner: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.attempt.findMany({
        where: {
          studentId: ctx.user.id,
          tenantId: ctx.tenant.id,
          status: { in: ["SUBMITTED", "GRADED"] },
        },
        include: { assessment: { include: { course: true } } },
        orderBy: { submittedAt: "desc" },
        take: 6,
      }),
      db.lessonCompletion.count({ where: { userId: ctx.user.id } }),
      db.successBenchmark.findFirst({
        where: { tenantId: ctx.tenant.id, studentId: ctx.user.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const scored = attempts.filter((a) => a.score !== null && a.maxScore > 0);
    const average = scored.length
      ? Math.round(scored.reduce((sum, a) => sum + pct(a.score, a.maxScore), 0) / scored.length)
      : 0;

    const upcoming = enrollments
      .flatMap((e) => e.course.assessments.map((a) => ({ ...a, course: e.course })))
      .filter((a) => !a.dueAt || a.dueAt > new Date())
      .slice(0, 4);

    const progressChartData = enrollments.map(({ course, progress }) => ({
      label: course.title.length > 18 ? `${course.title.slice(0, 18)}…` : course.title,
      value: progress,
      color: progress >= 80 ? "bg-emerald-500" : progress >= 40 ? "bg-brand-500" : "bg-amber-500",
    }));
    const scoreChartData = attempts
      .filter((a) => a.status === "GRADED" && a.maxScore > 0)
      .slice(0, 6)
      .reverse()
      .map((a) => ({
        label: a.assessment.title.length > 12 ? `${a.assessment.title.slice(0, 12)}…` : a.assessment.title,
        value: pct(a.score, a.maxScore),
        color: pct(a.score, a.maxScore) >= 60 ? "bg-emerald-500" : "bg-rose-500",
      }));

    const riskBand = riskBenchmark ? asRiskBand(riskBenchmark.riskBand) : null;
    const riskMeta = riskBand ? RISK_META[riskBand] : null;
    const riskFeatures = readLearnerRiskJson<LearnerRiskSnapshot>(riskBenchmark?.features, {});
    const riskSuggestions = riskBand ? learnerMitigationSuggestions(riskBand, riskFeatures) : [];
    const riskSummary =
      typeof riskBenchmark?.summary === "string" && riskBenchmark.summary.trim()
        ? riskBenchmark.summary.trim()
        : null;

    return (
      <div>
        <PageHeader
          eyebrow={`${ctx.tenant.name} · learner`}
          title={`Hi ${ctx.user.name.split(" ")[0]}`}
          subtitle="Pick up where you left off, or see what is coming next."
          actions={
            <Link href="/dashboard/courses" className="btn-primary btn-sm">
              <BookOpen className="size-3.5" /> Browse courses
            </Link>
          }
        />

        {banner && (
          <div
            className={`mb-6 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${
              sp.denied || sp.error
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-brand-200 bg-brand-50 text-brand-800"
            }`}
          >
            <Sparkles className="mt-0.5 size-4 shrink-0" />
            {banner}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Enrolled courses" value={enrollments.length} icon={<BookOpen className="size-4" />} />
          <Stat label="Lessons completed" value={completed} icon={<GraduationCap className="size-4" />} />
          <Stat label="Average score" value={`${average}%`} hint={`${scored.length} graded attempts`} />
          <Stat label="Upcoming work" value={upcoming.length} hint="published assessments" icon={<CalendarClock className="size-4" />} />
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Course progress" subtitle="How far you are in each enrolled course">
            <HorizontalBarChart
              data={progressChartData}
              empty="Enroll in a course to see your progress chart."
            />
          </ChartCard>
          <ChartCard title="Recent scores" subtitle="Your latest graded assessment results">
            <BarChart
              data={scoreChartData}
              empty="Complete and get graded on assessments to see score trends."
              colorClass="bg-brand-500"
            />
          </ChartCard>
        </div>

        {riskBenchmark && riskBand && riskMeta && (
          <section className="mt-8">
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <BrainCircuit className="size-3.5 text-brand-600" /> Learning progress check
                  </p>
                  <h2 className="mt-1 text-sm font-bold text-slate-900">
                    Your current support level: <span className={riskMeta.text}>{riskMeta.label}</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Based on attendance, grades, submissions, and engagement
                    {riskBenchmark.createdAt ? ` · updated ${timeAgo(riskBenchmark.createdAt)}` : ""}.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">On-track likelihood</p>
                    <p className={`text-2xl font-bold ${riskMeta.text}`}>{Math.round(riskBenchmark.successProbability)}%</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      riskMeta.tone === "green"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : riskMeta.tone === "amber"
                          ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                          : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                    }`}
                  >
                    <ShieldAlert className="size-3.5" />
                    {riskMeta.label}
                  </span>
                </div>
              </div>

              <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_1fr]">
                <div>
                  <div className="mb-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${riskMeta.bar}`}
                      style={{ width: `${Math.max(4, Math.min(100, Math.round(riskBenchmark.successProbability)))}%` }}
                    />
                  </div>
                  {riskBenchmark.headline ? (
                    <p className="text-sm font-semibold text-slate-900">{riskBenchmark.headline}</p>
                  ) : null}
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {riskSummary || riskMeta.description}
                  </p>
                  <p className="mt-3 text-[11px] text-slate-400">
                    This is a supportive estimate to help you plan next steps, not a final judgment.
                    {typeof riskBenchmark.confidence === "number" ? ` Confidence: ${Math.round(riskBenchmark.confidence)}%.` : ""}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                    <Lightbulb className="size-3.5 text-amber-500" /> Mitigation suggestions
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {riskSuggestions.map((tip, index) => (
                      <li key={`${index}-${tip.slice(0, 16)}`} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11px] text-slate-500">
                    If you need support, talk to your teacher or course facilitator—they can help you make a plan.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-tight text-slate-900">Continue learning</h2>
          <Link href="/dashboard/courses" className="text-xs font-semibold text-brand-600 hover:underline">
            All courses
          </Link>
        </div>

        {enrollments.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={<BookOpen className="size-5" />}
              title="No courses yet"
              description="Your teachers have not enrolled you in a course. You can also join any published course."
              action={
                <Link href="/dashboard/courses" className="btn-primary btn-sm">
                  Browse the catalog
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {enrollments.slice(0, 4).map(({ course, progress }) => {
              return (
                <Link
                  key={course.id}
                  href={`/learn/${course.id}`}
                  className="card group p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold tracking-wider text-brand-600 uppercase">
                        {course.subject} · {course.level}
                      </p>
                      <h3 className="mt-1 truncate text-sm font-bold text-slate-900 group-hover:text-brand-700">
                        {course.title}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{course.subtitle}</p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-slate-300 transition group-hover:text-brand-600" />
                  </div>
                  <div className="mt-3.5 flex items-center gap-2">
                    <Progress value={progress} />
                    <span className="w-9 text-right text-[10px] font-semibold text-slate-500">
                      {progress}%
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    {course.lessons.length} lessons · {course.assessments.length} assessments ·{" "}
                    {course.owner.name}
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-sm font-bold text-slate-900">Due soon</h2>
              <Badge tone="amber">{upcoming.length}</Badge>
            </div>
            <div className="divide-y divide-slate-100">
              {upcoming.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500">Nothing scheduled. Enjoy the calm.</p>
              ) : (
                upcoming.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <ClipboardCheck className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-900">{a.title}</p>
                      <p className="truncate text-[10px] text-slate-500">{a.course.title}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-slate-700">
                        {a.dueAt ? formatDate(a.dueAt) : "No due date"}
                      </p>
                      <Link
                        href={`/quiz/${a.id}`}
                        className="text-[10px] font-semibold text-brand-600 hover:underline"
                      >
                        Start →
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-sm font-bold text-slate-900">Recent results</h2>
              <Link href="/dashboard/results" className="text-[11px] font-semibold text-brand-600 hover:underline">
                All results
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {attempts.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500">No submissions yet.</p>
              ) : (
                attempts.map((a) => {
                  const percent = pct(a.score, a.maxScore);
                  return (
                    <Link
                      key={a.id}
                      href={`/results/${a.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50"
                    >
                      <span
                        className={`flex size-9 items-center justify-center rounded-lg text-xs font-bold ${
                          percent >= 60 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {a.status === "GRADED" ? `${percent}%` : "…"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900">{a.assessment.title}</p>
                        <p className="truncate text-[10px] text-slate-500">{a.assessment.course.title}</p>
                      </div>
                      <StatusBadge status={a.status} />
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const [courses, pending, learners, assessmentCount, graded, inProgressCount] = await Promise.all([
    db.course.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        _count: { select: { lessons: true, enrollments: true, assessments: true } },
      },
    }),
    db.attempt.findMany({
      where: { tenantId: ctx.tenant.id, status: "SUBMITTED" },
      orderBy: { submittedAt: "desc" },
      take: 5,
      include: { student: true, assessment: { include: { course: true } } },
    }),
    db.membership.count({ where: { tenantId: ctx.tenant.id, role: "STUDENT" } }),
    db.assessment.count({ where: { tenantId: ctx.tenant.id } }),
    db.attempt.findMany({
      where: { tenantId: ctx.tenant.id, status: "GRADED" },
      select: { score: true, maxScore: true },
    }),
    db.attempt.count({ where: { tenantId: ctx.tenant.id, status: "IN_PROGRESS" } }),
  ]);

  const gradedPercents = graded.map((a) => pct(a.score, a.maxScore));
  const average = gradedPercents.length
    ? Math.round(gradedPercents.reduce((sum, value) => sum + value, 0) / gradedPercents.length)
    : 0;
  const passedCount = gradedPercents.filter((value) => value >= 50).length;
  const passRate = gradedPercents.length ? Math.round((passedCount / gradedPercents.length) * 100) : 0;

  return (
    <div>
      <PageHeader
        eyebrow={`${ctx.tenant.name} · ${ctx.role.toLowerCase()}`}
        title={`Good to see you, ${ctx.user.name.split(" ")[0]}`}
        subtitle="Here is what is happening across your workspace."
        actions={
          <>
            <Link href="/dashboard/courses?new=1" className="btn-primary btn-sm">
              <Plus className="size-3.5" /> New course
            </Link>
            <Link href="/dashboard/grading" className="btn-secondary btn-sm">
              <GraduationCap className="size-3.5" /> Grading
              {pending.length > 0 && (
                <span className="rounded-full bg-rose-600 px-1.5 text-[10px] text-white">
                  {pending.length}
                </span>
              )}
            </Link>
          </>
        }
      />

      {banner && (
        <div
          className={`mb-6 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${
            sp.denied || sp.error
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-brand-200 bg-brand-50 text-brand-800"
          }`}
        >
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          {banner}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Learners"
          value={learners}
          hint={`${ctx.tenant.kind === "TEACHER" ? "in your studio" : ctx.tenant.kind === "CRECHE" ? "across the creche" : "across the school"}`}
          icon={<Users className="size-4" />}
        />
        <Stat label="Courses" value={courses.length} hint={`${assessmentCount} assessments`} icon={<BookOpen className="size-4" />} />
        <Stat
          label="Awaiting grading"
          value={pending.length}
          hint={pending.length ? "Open answers submitted" : "All caught up"}
          icon={<GraduationCap className="size-4" />}
        />
        <Stat label="Average score" value={`${average}%`} hint={`${passRate}% pass rate`} icon={<ClipboardCheck className="size-4" />} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Assessment outcomes" subtitle="Graded, pending and in-progress attempts">
          <DonutChart
            segments={[
              { label: "Passed", value: passedCount, color: "text-emerald-500" },
              { label: "Below pass", value: Math.max(0, gradedPercents.length - passedCount), color: "text-rose-500" },
              { label: "Awaiting grading", value: pending.length, color: "text-amber-500" },
              { label: "In progress", value: inProgressCount, color: "text-slate-400" },
            ]}
            centerValue={`${average}%`}
            centerLabel="average"
          />
        </ChartCard>
        <ChartCard title="Score distribution" subtitle="How graded attempts are spread across score bands">
          <ScoreDistributionChart scores={gradedPercents} />
        </ChartCard>
        <ChartCard title="Learners by course" subtitle="Enrollment across your most recent courses">
          <BarChart
            data={courses.map((course) => ({
              label: course.title.length > 12 ? `${course.title.slice(0, 12)}…` : course.title,
              value: course._count.enrollments,
              color: "bg-brand-500",
            }))}
            max={Math.max(1, ...courses.map((course) => course._count.enrollments))}
            valueSuffix=""
            empty="Create courses and enroll learners to see this chart."
          />
        </ChartCard>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Your courses</h2>
            <Link href="/dashboard/courses" className="text-xs font-semibold text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {courses.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="size-5" />}
              title="Create your first course"
              description="Group lessons, assessments and documents into a course learners can join."
              action={
                <Link href="/dashboard/courses?new=1" className="btn-primary btn-sm">
                  <Plus className="size-3.5" /> New course
                </Link>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {courses.map((course) => (
                <Link
                  key={course.id}
                  href={`/dashboard/courses/${course.id}`}
                  className="card group p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Badge tone={course.status === "PUBLISHED" ? "green" : "slate"}>
                      {course.status.toLowerCase()}
                    </Badge>
                    <ArrowRight className="size-4 text-slate-300 transition group-hover:text-brand-600" />
                  </div>
                  <h3 className="mt-2.5 truncate text-sm font-bold text-slate-900 group-hover:text-brand-700">
                    {course.title}
                  </h3>
                  <p className="mt-0.5 line-clamp-2 min-h-8 text-[11px] leading-4 text-slate-500">
                    {course.subtitle || course.description || "No description yet"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <BookOpen className="size-3" /> {course._count.lessons} lessons
                    </span>
                    <span className="flex items-center gap-1">
                      <ClipboardCheck className="size-3" /> {course._count.assessments} assessments
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3" /> {course._count.enrollments} learners
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <AlertTriangle className="size-4 text-amber-500" /> Needs grading
              </h2>
              <Link href="/dashboard/grading" className="text-[11px] font-semibold text-brand-600 hover:underline">
                Open queue
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {pending.length === 0 ? (
                <div className="px-5 py-7 text-center">
                  <p className="text-2xl">🎉</p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">Everything is graded</p>
                  <p className="text-[11px] text-slate-400">Open answers will appear here.</p>
                </div>
              ) : (
                pending.map((attempt) => (
                  <Link
                    key={attempt.id}
                    href={`/dashboard/grading/${attempt.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50"
                  >
                    <Avatar name={attempt.student.name} src={attempt.student.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {attempt.student.name}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        {attempt.assessment.title} · {attempt.assessment.course.title}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold text-rose-600">Grade →</span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 85% 10%, #6366f1, transparent 45%), radial-gradient(circle at 10% 90%, #8b5cf6, transparent 40%)",
              }}
            />
            <div className="relative">
              <p className="text-[10px] font-semibold tracking-wider text-indigo-200 uppercase">
                Workspace snapshot
              </p>
              <p className="mt-1.5 text-lg font-bold">{ctx.tenant.name}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/10 py-2">
                  <p className="text-base font-bold">{learners}</p>
                  <p className="text-[9px] text-slate-300 uppercase">learners</p>
                </div>
                <div className="rounded-xl bg-white/10 py-2">
                  <p className="text-base font-bold">{courses.length}</p>
                  <p className="text-[9px] text-slate-300 uppercase">courses</p>
                </div>
                <div className="rounded-xl bg-white/10 py-2">
                  <p className="text-base font-bold">{average}%</p>
                  <p className="text-[9px] text-slate-300 uppercase">average</p>
                </div>
              </div>
              <Link
                href="/dashboard/settings"
                className="mt-4 flex items-center justify-between text-[11px] font-semibold text-indigo-200 hover:text-white"
              >
                Brand & workspace settings <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
