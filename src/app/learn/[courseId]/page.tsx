import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Code2,
  GraduationCap,
  Lock,
  PlayCircle,
  Trophy,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { canTeach, requireTenant } from "@/lib/tenant";
import { enrollSelfAction } from "@/lib/actions/course";
import { Avatar, Badge, Progress } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { MathText } from "@/components/MathText";
import { getLessonLockReason } from "@/lib/lesson-access";
import { formatDate, nowMs, pct } from "@/lib/utils";

export const metadata = { title: "Learn" };

export default async function LearnCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { courseId } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant();
  const teacher = canTeach(ctx.role);

  const course = await db.course.findFirst({
    where: { id: courseId, tenantId: ctx.tenant.id },
    include: {
      owner: true,
      lessons: {
        where: teacher ? undefined : { published: true },
        orderBy: { order: "asc" },
        include: { stage: { select: { id: true, title: true } } },
      },
      assessments: {
        where: teacher ? undefined : { status: "PUBLISHED" },
        include: { _count: { select: { questions: true } } },
        orderBy: { createdAt: "asc" },
      },
      codePads: {
        where: teacher ? undefined : { published: true },
        orderBy: { order: "asc" },
      },
      _count: { select: { enrollments: true } },
    },
  });
  if (!course) notFound();

  const allLessons = await db.lesson.findMany({
    where: { courseId, course: { tenantId: ctx.tenant.id } },
    orderBy: { order: "asc" },
    select: { id: true, title: true, prerequisiteIds: true, opensAt: true, closesAt: true },
  });
  const enrollment = await db.enrollment.findUnique({
    where: { courseId_userId: { courseId, userId: ctx.user.id } },
  });
  const enrolled = Boolean(enrollment) || teacher;

  const completions = enrolled
    ? await db.lessonCompletion.findMany({
        where: { userId: ctx.user.id, lesson: { courseId } },
        select: { lessonId: true },
      })
    : [];
  const completed = new Set(completions.map((c) => c.lessonId));
  const now = nowMs();

  const attempts = await db.attempt.findMany({
    where: { assessment: { courseId }, studentId: ctx.user.id },
    orderBy: { startedAt: "desc" },
  });
  const attemptsByAssessment = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const list = attemptsByAssessment.get(attempt.assessmentId) ?? [];
    list.push(attempt);
    attemptsByAssessment.set(attempt.assessmentId, list);
  }

  const lessonProgress = course.lessons.length
    ? Math.round((course.lessons.filter((l) => completed.has(l.id)).length / course.lessons.length) * 100)
    : 0;

  const padSubmissions = enrolled
    ? await db.codePadSubmission.findMany({
        where: { userId: ctx.user.id, pad: { courseId } },
      })
    : [];
  const submissionByPad = new Map(padSubmissions.map((submission) => [submission.padId, submission]));

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard/courses" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="size-4" /> All courses
          </Link>
          <div className="flex items-center gap-2">
            {teacher && (
              <Link href={`/dashboard/courses/${course.id}`} className="btn-secondary btn-sm">
                <GraduationCap className="size-3.5" /> Manage course
              </Link>
            )}
            {!teacher && (
              <Link href="/learn/check-in" className="btn-secondary btn-sm">
                <CalendarCheck className="size-3.5" /> Attendance
              </Link>
            )}
            <Link href="/dashboard" className="btn-ghost btn-sm">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
        {sp.error && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {sp.error}
          </div>
        )}

        <section className="card overflow-hidden">
          <div className="relative bg-slate-900 px-5 py-8 text-white sm:px-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(circle at 85% 0%, #6366f1, transparent 50%), radial-gradient(circle at 10% 100%, #8b5cf6, transparent 45%)",
              }}
            />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{course.subject}</Badge>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/80">
                  {course.level}
                </span>
                {teacher && <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-[10px] font-semibold text-amber-100">Teacher preview</span>}
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{course.title}</h1>
              {course.subtitle && <p className="mt-1 max-w-2xl text-sm text-white/70">{course.subtitle}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-white/70">
                <span className="flex items-center gap-1.5">
                  <Avatar name={course.owner.name} size="sm" /> {course.owner.name}
                </span>
                <span className="flex items-center gap-1.5">
                  <BookOpen className="size-3.5" /> {course.lessons.length} lessons
                </span>
                <span className="flex items-center gap-1.5">
                  <ClipboardCheck className="size-3.5" /> {course.assessments.length} assessments
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5" /> {course._count.enrollments} learners
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="min-w-0 flex-1">
              {course.description && <MathText content={course.description} className="text-sm text-slate-600" />}
            </div>
            {enrolled ? (
              <div className="w-full shrink-0 sm:w-56">
                <div className="mb-1.5 flex justify-between text-[10px] font-semibold text-slate-500">
                  <span>{lessonProgress}% complete</span>
                  <span>
                    {course.lessons.filter((l) => completed.has(l.id)).length}/{course.lessons.length} lessons
                  </span>
                </div>
                <Progress value={lessonProgress} />
              </div>
            ) : (
              <form action={enrollSelfAction} className="shrink-0">
                <input type="hidden" name="courseId" value={course.id} />
                <SubmitButton pendingText="Joining…">
                  <PlayCircle className="size-4" /> Join this course
                </SubmitButton>
              </form>
            )}
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <BookOpen className="size-4 text-brand-500" /> Lessons
              </h2>
              <span className="text-[11px] text-slate-400">{course.lessons.length} total</span>
            </div>

            {course.lessons.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center text-sm text-slate-500">
                No lessons published yet.
              </div>
            ) : (
              <ol className="space-y-2">
                {course.lessons.map((lesson, index) => {
                  const done = completed.has(lesson.id);
                  const lockReason = getLessonLockReason({
                    lesson,
                    lessons: allLessons,
                    completedLessonIds: completed,
                    now,
                    teacher,
                  });
                  const accessReason = !enrolled ? "Enroll to open this lesson" : lockReason;
                  const canOpen = enrolled && !lockReason;
                  return (
                    <li key={lesson.id}>
                      <Link
                        href={canOpen ? `/learn/${course.id}/lessons/${lesson.id}` : "#"}
                        aria-disabled={!canOpen}
                        className={`group flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 transition ${
                          canOpen
                            ? "border-slate-200 hover:border-brand-300 hover:shadow-sm"
                            : "cursor-not-allowed border-slate-200 opacity-60"
                        }`}
                      >
                        <span
                          className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                            done ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {done ? <CheckCircle2 className="size-4" /> : index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{lesson.title}</p>
                          <p className="truncate text-[11px] text-slate-500">
                            {lesson.stage ? `${lesson.stage.title} · ` : ""}
                            {lesson.summary || (lesson.published ? "Lesson" : "Draft")}
                          </p>
                          {accessReason && (
                            <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                              <Lock className="size-3" /> {accessReason}
                            </p>
                          )}
                        </div>
                        <span className="flex shrink-0 items-center gap-1 text-[10px] text-slate-400">
                          <Clock className="size-3" /> {lesson.estimatedMinutes} min
                        </span>
                        {canOpen ? (
                          <ArrowRight className="size-4 shrink-0 text-slate-300 group-hover:text-brand-500" />
                        ) : (
                          <Lock className="size-3.5 shrink-0 text-slate-300" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <ClipboardCheck className="size-4 text-brand-500" /> Assessments
              </h2>
            </div>

            {course.assessments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center text-sm text-slate-500">
                No assessments yet.
              </div>
            ) : (
              <div className="space-y-2">
                {course.assessments.map((assessment) => {
                  const list = attemptsByAssessment.get(assessment.id) ?? [];
                  const inProgress = list.find((a) => a.status === "IN_PROGRESS");
                  const finished = list.filter((a) => a.status !== "IN_PROGRESS");
                  const best = finished.reduce(
                    (max, a) => Math.max(max, pct(a.score ?? 0, a.maxScore)),
                    0
                  );
                  const needsGrading = finished.some((a) => a.status === "SUBMITTED");
                  const usedUp = finished.length >= assessment.attemptsAllowed;
                  return (
                    <div key={assessment.id} className="card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{assessment.title}</p>
                          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            {assessment.type.toLowerCase()} · {assessment._count.questions} questions
                          </p>
                        </div>
                        {assessment.status !== "PUBLISHED" && <Badge tone="slate">Draft</Badge>}
                      </div>

                      <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                        {assessment.timeLimitMin && (
                          <p className="flex items-center gap-1.5">
                            <Clock className="size-3" /> {assessment.timeLimitMin} minute limit
                          </p>
                        )}
                        {assessment.dueAt && (
                          <p className="flex items-center gap-1.5">
                            <Trophy className="size-3" /> Due {formatDate(assessment.dueAt, true)}
                          </p>
                        )}
                        <p className="flex items-center gap-1.5">
                          <CheckCircle2 className="size-3" /> {finished.length}/{assessment.attemptsAllowed} attempts used
                          {finished.length > 0 && !needsGrading && ` · best ${best}%`}
                        </p>
                        {needsGrading && <p className="text-sky-600">Awaiting teacher grading</p>}
                      </div>

                      <div className="mt-3">
                        {teacher ? (
                          <Link href={`/dashboard/assessments/${assessment.id}`} className="btn-secondary btn-sm w-full">
                            Open builder
                          </Link>
                        ) : inProgress ? (
                          <Link href={`/attempt/${inProgress.id}`} className="btn-primary btn-sm w-full">
                            Continue attempt <ArrowRight className="size-3.5" />
                          </Link>
                        ) : usedUp ? (
                          <Link href={`/results/${finished[0]?.id ?? ""}`} className="btn-secondary btn-sm w-full">
                            View results
                          </Link>
                        ) : (
                          <Link href={`/quiz/${assessment.id}`} className="btn-primary btn-sm w-full">
                            <PlayCircle className="size-3.5" />
                            {finished.length ? "Try again" : "Start assessment"}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {course.codePads.length > 0 && (
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Code2 className="size-4 text-brand-500" /> Coding pads
              </h2>
              <span className="text-[11px] text-slate-400">{course.codePads.length} labs</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {course.codePads.map((pad) => {
                const submission = submissionByPad.get(pad.id);
                const status = submission?.status ?? "NOT_STARTED";
                return (
                  <Link
                    key={pad.id}
                    href={enrolled ? `/learn/${courseId}/pads/${pad.id}` : "#"}
                    aria-disabled={!enrolled}
                    className={`card flex items-start gap-3 p-4 transition ${
                      enrolled
                        ? "hover:border-brand-300 hover:shadow-sm"
                        : "pointer-events-none opacity-60"
                    }`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                      <Code2 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{pad.title}</p>
                        <Badge tone={status === "REVIEWED" ? "green" : status === "SUBMITTED" ? "sky" : "slate"}>
                          {status === "REVIEWED"
                            ? "Reviewed"
                            : status === "SUBMITTED"
                              ? "Submitted"
                              : status === "DRAFT"
                                ? "Draft"
                                : "Not started"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-slate-500">
                        {pad.prompt || "Open the pad to start coding."}
                      </p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        {pad.language}
                      </p>
                    </div>
                    {enrolled ? (
                      <ArrowRight className="mt-1 size-4 shrink-0 text-slate-300" />
                    ) : (
                      <Lock className="mt-1 size-3.5 shrink-0 text-slate-300" />
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
