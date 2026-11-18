import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  GraduationCap,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant, canTeach } from "@/lib/tenant";
import { Avatar, Badge, EmptyState, PageHeader, Progress, Stat, StatusBadge } from "@/components/ui";
import { formatDate, pct } from "@/lib/utils";

export const metadata = { title: "Overview" };

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
    const [enrollments, attempts, completed] = await Promise.all([
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
    ]);

    const scored = attempts.filter((a) => a.score !== null && a.maxScore > 0);
    const average = scored.length
      ? Math.round(scored.reduce((sum, a) => sum + pct(a.score, a.maxScore), 0) / scored.length)
      : 0;

    const upcoming = enrollments
      .flatMap((e) => e.course.assessments.map((a) => ({ ...a, course: e.course })))
      .filter((a) => !a.dueAt || a.dueAt > new Date())
      .slice(0, 4);

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

  const [courses, pending, learners, assessmentCount, graded] = await Promise.all([
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
  ]);

  const average = graded.length
    ? Math.round(graded.reduce((sum, a) => sum + pct(a.score, a.maxScore), 0) / graded.length)
    : 0;
  const passRate = graded.length
    ? Math.round(
        (graded.filter((a) => pct(a.score, a.maxScore) >= 50).length / graded.length) * 100
      )
    : 0;

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
          hint={`${ctx.tenant.kind === "TEACHER" ? "in your studio" : "across the school"}`}
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
