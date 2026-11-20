import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  Code2,
  DollarSign,
  Download,
  FileText,
  Gauge,
  Layers,
  LayoutGrid,
  Plus,
  Settings2,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { canTeach, requireTenant } from "@/lib/tenant";
import {
  createLessonAction,
  deleteCourseAction,
  deleteAttachmentAction,
  enrollAllStudentsAction,
  enrollStudentAction,
  unenrollStudentAction,
  updateCourseAction,
} from "@/lib/actions/course";
import { createAssessmentAction } from "@/lib/actions/assessment";
import {
  assignStageAction,
  createExpenseAction,
  createStageAction,
  deleteExpenseAction,
  deleteStageAction,
  moveStageAction,
} from "@/lib/actions/course-ops";
import {
  createCodePadAction,
  deleteCodePadAction,
  gradeCodePadAction,
  updateCodePadAction,
} from "@/lib/actions/codepad";
import { revokeInviteAction } from "@/lib/actions/tenant";
import {
  createCoursePlanTaskAction,
  deleteCoursePlanTaskAction,
  updateCoursePlanTaskAction,
} from "@/lib/actions/course-plan";
import {
  PLAN_PRIORITIES,
  PLAN_PRIORITY_META,
  PLAN_STATUSES,
  PLAN_STATUS_META,
  planPriorityFrom,
  planStatusFrom,
} from "@/lib/course-plan";
import { Avatar, Badge, EmptyState, Progress, StatusBadge, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CoursePlanBoard, type PlanTaskView } from "@/components/CoursePlanBoard";
import { UploadField } from "@/components/UploadField";
import { formatBytes } from "@/lib/storage";
import { currencyFor } from "@/lib/plans";
import { formatDate, formatMoney, nowMs } from "@/lib/utils";

export const metadata = { title: "Course" };

function dateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function CourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    saved?: string;
    error?: string;
    enrolled?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant();
  if (!canTeach(ctx.role)) redirect(`/learn/${id}`);

  const course = await db.course.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      lessons: { orderBy: { order: "asc" } },
      assessments: {
        include: { _count: { select: { questions: true, attempts: true } } },
        orderBy: { createdAt: "asc" },
      },
      enrollments: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
      attachments: { orderBy: { createdAt: "desc" } },
      stages: {
        orderBy: { order: "asc" },
        include: {
          lessons: { orderBy: { order: "asc" } },
          assessments: { orderBy: { createdAt: "asc" } },
        },
      },
      expenses: {
        include: { createdBy: { select: { name: true } } },
        orderBy: { incurredAt: "desc" },
      },
      codePads: {
        orderBy: { order: "asc" },
        include: {
          submissions: {
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { updatedAt: "desc" },
          },
        },
      },
      planTasks: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: {
          stage: { select: { title: true } },
          assignee: { select: { name: true } },
        },
      },
    },
  });
  if (!course) notFound();

  const invitations = await db.invitation.findMany({
    where: { courseId: course.id, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const tenantMembers = await db.membership.findMany({
    where: { tenantId: ctx.tenant.id, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const tab = sp.tab ?? "content";
  const documents = course.attachments.filter((a) => !a.lessonId);
  const avgProgress = course.enrollments.length
    ? Math.round(
        course.enrollments.reduce((sum, e) => sum + e.progress, 0) / course.enrollments.length
      )
    : 0;

  const spent = course.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const budget = course.budget ?? null;
  const budgetRemaining = budget === null ? null : budget - spent;
  const budgetUsed = budget && budget > 0 ? Math.round((spent / budget) * 100) : null;
  const expenseCurrency = currencyFor(ctx.tenant.currency);

  const padReviewCount = course.codePads.reduce(
    (sum, pad) => sum + pad.submissions.filter((submission) => submission.status === "SUBMITTED").length,
    0
  );

  const planTaskViews: PlanTaskView[] = course.planTasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: planStatusFrom(task.status),
    priority: planPriorityFrom(task.priority),
    startAt: task.startAt ? task.startAt.toISOString() : null,
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    stageTitle: task.stage?.title ?? null,
    assigneeName: task.assignee?.name ?? null,
  }));
  const planCounts = PLAN_STATUSES.reduce<Record<(typeof PLAN_STATUSES)[number], number>>(
    (counts, status) => {
      counts[status] = planTaskViews.filter((task) => task.status === status).length;
      return counts;
    },
    { NOT_STARTED: 0, IN_PROGRESS: 0, MET: 0 }
  );
  const planCompletion = planTaskViews.length
    ? Math.round((planCounts.MET / planTaskViews.length) * 100)
    : 0;
  const planTodayIso = new Date(nowMs()).toISOString();

  const stageItems = [
    ...course.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      kind: "lesson" as const,
      stageId: lesson.stageId,
      meta: `${lesson.estimatedMinutes} min · ${lesson.published ? "published" : "draft"}`,
    })),
    ...course.assessments.map((assessment) => ({
      id: assessment.id,
      title: assessment.title,
      kind: "assessment" as const,
      stageId: assessment.stageId,
      meta: `${assessment.type.toLowerCase()} · ${assessment.status.toLowerCase()}`,
    })),
  ];
  const unassignedItems = stageItems.filter((item) => !item.stageId);

  const renderStageItem = (item: (typeof stageItems)[number]) => (
    <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
          item.kind === "lesson" ? "bg-brand-50 text-brand-600" : "bg-violet-50 text-violet-600"
        }`}
      >
        {item.kind === "lesson" ? <BookOpen className="size-3.5" /> : <ClipboardCheck className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-slate-800">{item.title}</p>
        <p className="text-[9px] uppercase tracking-wider text-slate-400">{item.meta}</p>
      </div>
      <form action={assignStageAction} className="flex w-full items-center gap-1.5 sm:w-auto sm:shrink-0">
        <input type="hidden" name="courseId" value={course.id} />
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="kind" value={item.kind} />
        <select name="stageId" defaultValue={item.stageId ?? ""} className="select w-full py-1 text-[10px] sm:w-36">
          <option value="">Unassigned</option>
          {course.stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.title}
            </option>
          ))}
        </select>
        <SubmitButton variant="ghost" className="btn-sm px-2" pendingText="…">
          Move
        </SubmitButton>
      </form>
    </li>
  );

  return (
    <div>
      <Link
        href="/dashboard/courses"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="size-3.5" /> All courses
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <span
            className="hidden size-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-sm sm:flex"
            style={{ background: ctx.tenant.brandColor }}
          >
            {course.subject.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={course.status} />
              <Badge tone="brand">{course.subject}</Badge>
              <Badge>{course.level}</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
              {course.title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              {course.subtitle || "No subtitle yet."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/learn/${course.id}`} className="btn-secondary btn-sm">
            <BookOpen className="size-3.5" /> Learner preview
          </Link>
          <Link href={`/dashboard/courses/${course.id}?tab=assessments`} className="btn-secondary btn-sm">
            <ClipboardCheck className="size-3.5" /> Assessments
          </Link>
          <Link href={`/dashboard/courses/${course.id}?tab=settings`} className="btn-primary btn-sm">
            <Settings2 className="size-3.5" /> Manage
          </Link>
        </div>
      </div>

      {(sp.error || sp.saved || sp.enrolled) && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            sp.error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {sp.error ??
            (sp.enrolled
              ? `Enrollment updated${sp.enrolled !== "1" ? ` for ${sp.enrolled} learners` : ""}.`
              : "Changes saved.")}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-4">
        {[
          ["Lessons", course.lessons.length, BookOpen],
          ["Assessments", course.assessments.length, ClipboardCheck],
          ["Learners", course.enrollments.length, Users],
          ["Avg progress", `${avgProgress}%`, Gauge],
        ].map(([label, value, Icon]) => {
          const I = Icon as typeof BookOpen;
          return (
            <div key={label as string} className="card flex items-center gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                <I className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                  {label as string}
                </p>
                <p className="text-lg font-bold text-slate-900">{value as string}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Tabs
        current={`/dashboard/courses/${course.id}?tab=${tab}`}
        items={[
          { href: `/dashboard/courses/${course.id}?tab=content`, label: "Content", count: course.lessons.length },
          {
            href: `/dashboard/courses/${course.id}?tab=assessments`,
            label: "Assessments",
            count: course.assessments.length,
          },
          {
            href: `/dashboard/courses/${course.id}?tab=learners`,
            label: "Learners",
            count: course.enrollments.length,
          },
          {
            href: `/dashboard/courses/${course.id}?tab=structure`,
            label: "Structure",
            count: course.stages.length,
          },
          {
            href: `/dashboard/courses/${course.id}?tab=plan`,
            label: "Course plan",
            count: course.planTasks.length,
          },
          {
            href: `/dashboard/courses/${course.id}?tab=budget`,
            label: "Budget",
            count: course.expenses.length,
          },
          {
            href: `/dashboard/courses/${course.id}?tab=coding`,
            label: "Coding pads",
            count: course.codePads.length,
          },
          { href: `/dashboard/courses/${course.id}?tab=settings`, label: "Settings" },
        ]}
      />

      {tab === "content" && (
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Lessons</h2>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Build the learning path in order.
                </p>
              </div>
              <span className="text-[11px] text-slate-400">{course.lessons.length} lessons</span>
            </div>

            {course.lessons.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<BookOpen className="size-5" />}
                  title="No lessons yet"
                  description="Add a lesson to start the learning path."
                />
              </div>
            ) : (
              <ol className="divide-y divide-slate-100">
                {course.lessons.map((lesson, index) => (
                  <li key={lesson.id}>
                    <Link
                      href={`/dashboard/lessons/${lesson.id}`}
                      className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-500">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 group-hover:text-brand-700">
                          {lesson.title}
                        </p>
                        <p className="truncate text-[10px] text-slate-500">
                          {lesson.summary || "No summary"} · {lesson.estimatedMinutes} min
                        </p>
                      </div>
                      <Badge tone={lesson.published ? "green" : "slate"}>
                        {lesson.published ? "Published" : "Draft"}
                      </Badge>
                      <ArrowRight className="size-3.5 shrink-0 text-slate-300 group-hover:text-brand-600" />
                    </Link>
                  </li>
                ))}
              </ol>
            )}

            <form action={createLessonAction} className="space-y-4 border-t border-slate-100 bg-slate-50/50 p-4">
              <input type="hidden" name="courseId" value={course.id} />
              <div>
                <label className="label" htmlFor="new-lesson-title">
                  New lesson title
                </label>
                <input
                  id="new-lesson-title"
                  name="title"
                  required
                  placeholder="e.g. Build a quadratic explorer"
                  className="input bg-white"
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-end">
                <SubmitButton className="w-full sm:w-auto" pendingText="Adding…">
                  <Plus className="size-3.5" /> Add lesson
                </SubmitButton>
              </div>
            </form>
          </section>

          <section className="space-y-4">
            <div className="card p-5">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Upload className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Course documents</h2>
                  <p className="text-[10px] text-slate-500">Shared with enrolled learners</p>
                </div>
              </div>
              <div className="mt-4">
                <UploadField
                  courseId={course.id}
                  label="Add a file"
                  refreshOnUpload
                  hint="PDF, DOCX, PPTX, XLSX, images, video, audio, ZIP"
                />
              </div>
              <div className="mt-4 space-y-2">
                {documents.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-[11px] text-slate-400">
                    No course documents yet.
                  </p>
                ) : (
                  documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                      <FileText className="size-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-slate-700">{doc.name}</p>
                        <p className="text-[9px] text-slate-400">
                          {formatBytes(doc.size)} · {formatDate(doc.createdAt)}
                        </p>
                      </div>
                      <a
                        href={`/api/files/${doc.id}`}
                        target="_blank"
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Download className="size-3.5" />
                      </a>
                      <form action={deleteAttachmentAction}>
                        <input type="hidden" name="attachmentId" value={doc.id} />
                        <SubmitButton variant="ghost" className="p-1" confirm="Delete this file?">
                          <Trash2 className="size-3.5 text-rose-500" />
                        </SubmitButton>
                      </form>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card p-5">
              <h3 className="text-xs font-bold text-slate-900">Course description</h3>
              <p className="mt-1.5 text-[12px] leading-5 text-slate-500">
                {course.description || "Add a description in Settings so learners know what to expect."}
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
                <Calendar className="size-3" /> Created {formatDate(course.createdAt)}
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === "assessments" && (
        <div className="space-y-5">
          <div className="card overflow-hidden">
            <form action={createAssessmentAction} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-end">
              <input type="hidden" name="courseId" value={course.id} />
              <div className="flex-1">
                <label className="label" htmlFor="assessment-title">
                  New assessment
                </label>
                <input
                  id="assessment-title"
                  name="title"
                  required
                  placeholder="Unit 2 quiz — quadratic functions"
                  className="input"
                />
              </div>
              <div className="sm:w-40">
                <label className="label" htmlFor="assessment-type">
                  Type
                </label>
                <select id="assessment-type" name="type" className="select">
                  <option value="QUIZ">Quiz</option>
                  <option value="EXAM">Exam</option>
                  <option value="ASSIGNMENT">Assignment</option>
                  <option value="PLACEMENT">Placement pre-assessment</option>
                </select>
              </div>
              <SubmitButton pendingText="Creating…">
                <Plus className="size-3.5" /> Create
              </SubmitButton>
            </form>
          </div>

          {course.assessments.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="size-5" />}
              title="No assessments yet"
              description="Create a quiz or exam, then add questions of any type."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Questions</th>
                    <th>Attempts</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {course.assessments.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link
                          href={`/dashboard/assessments/${a.id}`}
                          className="font-semibold text-slate-900 hover:text-brand-700"
                        >
                          {a.title}
                        </Link>
                        <p className="text-[10px] text-slate-400">
                          {a.timeLimitMin ? `${a.timeLimitMin} minute limit` : "No time limit"} ·{" "}
                          {a.attemptsAllowed} attempt(s)
                        </p>
                      </td>
                      <td>
                        <Badge tone="brand">{a.type.toLowerCase()}</Badge>
                      </td>
                      <td>
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="tabular-nums">{a._count.questions}</td>
                      <td className="tabular-nums">{a._count.attempts}</td>
                      <td className="text-right">
                        <Link
                          href={`/dashboard/assessments/${a.id}`}
                          className="text-[11px] font-semibold text-brand-600 hover:underline"
                        >
                          Edit →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "learners" && (
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="table-wrap">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-3">
              <h2 className="text-xs font-bold text-slate-900">Enrolled learners</h2>
              <form action={enrollAllStudentsAction}>
                <input type="hidden" name="courseId" value={course.id} />
                <SubmitButton variant="secondary" className="btn-sm" pendingText="Enrolling…">
                  <UserPlus className="size-3.5" /> Enroll all students
                </SubmitButton>
              </form>
            </div>
            {course.enrollments.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<Users className="size-5" />}
                  title="No learners enrolled"
                  description="Enroll existing members by email, or send an invite from Settings."
                />
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Learner</th>
                    <th>Progress</th>
                    <th>Enrolled</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {course.enrollments.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <Avatar name={e.user.name} src={e.user.avatarUrl} size="sm" />
                          <div>
                            <p className="text-xs font-semibold text-slate-900">{e.user.name}</p>
                            <p className="text-[10px] text-slate-400">{e.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="w-32">
                        <div className="flex items-center gap-2">
                          <Progress value={e.progress} />
                          <span className="text-[10px] text-slate-500">{e.progress}%</span>
                        </div>
                      </td>
                      <td className="text-[11px] text-slate-500">{formatDate(e.createdAt)}</td>
                      <td className="text-right">
                        <form action={unenrollStudentAction}>
                          <input type="hidden" name="courseId" value={course.id} />
                          <input type="hidden" name="enrollmentId" value={e.id} />
                          <SubmitButton
                            variant="ghost"
                            className="btn-sm text-rose-600"
                            confirm={`Remove ${e.user.name} from this course?`}
                          >
                            Remove
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="space-y-4">
            <div className="card p-5">
              <h2 className="text-sm font-bold text-slate-900">Enroll by email</h2>
              <p className="mt-1 text-[11px] text-slate-500">
                The learner must already be a member of this workspace.
              </p>
              <form action={enrollStudentAction} className="mt-3 space-y-3">
                <input type="hidden" name="courseId" value={course.id} />
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="student@school.edu"
                  className="input"
                />
                <SubmitButton className="w-full" pendingText="Enrolling…">
                  Enroll learner
                </SubmitButton>
              </form>
              <Link
                href="/dashboard/settings?tab=members"
                className="mt-3 block text-center text-[11px] font-semibold text-brand-600 hover:underline"
              >
                Invite someone new →
              </Link>
            </div>

            <div className="card p-5">
              <h2 className="text-sm font-bold text-slate-900">Pending invites</h2>
              {invitations.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-400">No pending invitations for this course.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-slate-700">{inv.email}</p>
                        <p className="text-[9px] text-slate-400">
                          {inv.role.toLowerCase()} · expires {formatDate(inv.expiresAt)}
                        </p>
                      </div>
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="invitationId" value={inv.id} />
                        <SubmitButton variant="ghost" className="btn-sm text-rose-600">
                          Revoke
                        </SubmitButton>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "structure" && (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Layers className="size-4 text-brand-500" /> Course organogram
                </h2>
                <p className="text-[11px] text-slate-400">
                  Structural movement from the first layer to the last.
                </p>
              </div>
              <Badge tone="brand">{course.stages.length} stages</Badge>
            </div>

            <div className="p-5">
              {course.stages.length === 0 && unassignedItems.length === 0 ? (
                <EmptyState
                  icon={<Layers className="size-5" />}
                  title="No structure yet"
                  description="Create stages such as Foundations, Practice and Application, then move lessons and assessments into them."
                />
              ) : (
                <div className="space-y-1">
                  {unassignedItems.length > 0 && (
                    <div className="mb-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        Unassigned ({unassignedItems.length})
                      </p>
                      <ul className="mt-1 divide-y divide-amber-100">{unassignedItems.map(renderStageItem)}</ul>
                    </div>
                  )}

                  {course.stages.map((stage, index) => {
                    const items = stageItems.filter((item) => item.stageId === stage.id);
                    return (
                      <div key={stage.id}>
                        {index > 0 && (
                          <div className="flex justify-center py-1 text-slate-300">
                            <ArrowDown className="size-5" />
                          </div>
                        )}
                        <div className="rounded-2xl border border-slate-200 bg-white">
                          <div className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-[11px] font-bold text-white">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-slate-900">{stage.title}</p>
                              <p className="text-[10px] text-slate-500">
                                {stage.description || "No description"}
                              </p>
                            </div>
                            <Badge>{items.length} items</Badge>
                          </div>
                          {items.length === 0 ? (
                            <p className="px-4 py-3 text-[11px] text-slate-400">
                              Nothing in this layer yet. Move an item here.
                            </p>
                          ) : (
                            <ul className="divide-y divide-slate-100 px-4 py-1">{items.map(renderStageItem)}</ul>
                          )}
                          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
                            <div className="flex gap-1">
                              <form action={moveStageAction}>
                                <input type="hidden" name="courseId" value={course.id} />
                                <input type="hidden" name="stageId" value={stage.id} />
                                <input type="hidden" name="direction" value="up" />
                                <SubmitButton variant="ghost" className="btn-sm px-1.5" pendingText="…">
                                  <ArrowUp className="size-3.5" />
                                </SubmitButton>
                              </form>
                              <form action={moveStageAction}>
                                <input type="hidden" name="courseId" value={course.id} />
                                <input type="hidden" name="stageId" value={stage.id} />
                                <input type="hidden" name="direction" value="down" />
                                <SubmitButton variant="ghost" className="btn-sm px-1.5" pendingText="…">
                                  <ArrowDown className="size-3.5" />
                                </SubmitButton>
                              </form>
                            </div>
                            <form action={deleteStageAction}>
                              <input type="hidden" name="courseId" value={course.id} />
                              <input type="hidden" name="stageId" value={stage.id} />
                              <SubmitButton
                                variant="ghost"
                                className="btn-sm text-rose-600"
                                confirm="Delete this stage? Its lessons and assessments move to Unassigned."
                              >
                                <Trash2 className="size-3.5" /> Remove
                              </SubmitButton>
                            </form>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <form action={createStageAction} className="card-pad space-y-3">
              <input type="hidden" name="courseId" value={course.id} />
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Plus className="size-4 text-brand-500" /> Add a stage
              </h2>
              <div>
                <label className="label" htmlFor="stage-title">
                  Stage title
                </label>
                <input id="stage-title" name="title" required placeholder="Foundations" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="stage-description">
                  Description
                </label>
                <textarea
                  id="stage-description"
                  name="description"
                  rows={2}
                  placeholder="What happens at this layer?"
                  className="textarea"
                />
              </div>
              <SubmitButton className="w-full" pendingText="Adding…">
                <Plus className="size-3.5" /> Add stage
              </SubmitButton>
            </form>

            <div className="card p-5">
              <h2 className="text-sm font-bold text-slate-900">How the organogram works</h2>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-500">
                <li>Stages run top to bottom in the order shown.</li>
                <li>Each lesson and assessment can belong to one stage.</li>
                <li>Use the arrows to reorder whole layers.</li>
                <li>Removing a stage leaves its content unassigned — nothing is deleted.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === "plan" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-4">
            {[
              { label: "Total tasks", value: planTaskViews.length, Icon: LayoutGrid, color: "bg-brand-50 text-brand-600" },
              {
                label: "Met",
                value: planCounts.MET,
                Icon: CalendarDays,
                color: "bg-emerald-50 text-emerald-600",
              },
              {
                label: "In progress",
                value: planCounts.IN_PROGRESS,
                Icon: LayoutGrid,
                color: "bg-amber-50 text-amber-600",
              },
              {
                label: "Not yet done",
                value: planCounts.NOT_STARTED,
                Icon: Calendar,
                color: "bg-slate-100 text-slate-500",
              },
            ].map(({ label, value, Icon, color }) => (
              <div key={label} className="card flex items-center gap-3 p-4">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold tracking-wider text-slate-400 uppercase">{label}</p>
                  <p className="text-lg font-bold text-slate-900">{value}</p>
                </div>
              </div>
            ))}
          </div>

          <CoursePlanBoard tasks={planTaskViews} todayIso={planTodayIso} />

          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <LayoutGrid className="size-4 text-brand-500" /> Plan tasks
                  </h2>
                  <p className="text-[11px] text-slate-400">Open a task to edit its schedule, owner and status.</p>
                </div>
                <Badge tone="brand">{planCompletion}% met</Badge>
              </div>
              <div className="divide-y divide-slate-100">
                {course.planTasks.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      icon={<LayoutGrid className="size-5" />}
                      title="No plan tasks yet"
                      description="Add the first task to start tracking what is met, pending and not yet done."
                    />
                  </div>
                ) : (
                  course.planTasks.map((task) => {
                    const status = planStatusFrom(task.status);
                    const priority = planPriorityFrom(task.priority);
                    const meta = PLAN_STATUS_META[status];
                    return (
                      <details key={task.id} className="group px-5 py-3">
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
                          <span className={`size-2 shrink-0 rounded-full ${meta.dot}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-bold text-slate-800">{task.title}</p>
                            <p className="truncate text-[10px] text-slate-400">
                              {task.stage?.title ?? "No stage"} ·{" "}
                              {task.dueAt ? `due ${formatDate(task.dueAt)}` : "no due date"} ·{" "}
                              {task.assignee?.name ?? "Unassigned"}
                            </p>
                          </div>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          <Badge tone={PLAN_PRIORITY_META[priority].tone}>{PLAN_PRIORITY_META[priority].label}</Badge>
                          <span className="text-[10px] font-semibold text-brand-600 group-open:hidden">Edit</span>
                          <span className="hidden text-[10px] font-semibold text-brand-600 group-open:inline">Close</span>
                        </summary>

                        <form
                          action={updateCoursePlanTaskAction}
                          className="mt-4 grid gap-3 rounded-2xl bg-slate-50/70 p-4 sm:grid-cols-2"
                        >
                          <input type="hidden" name="courseId" value={course.id} />
                          <input type="hidden" name="taskId" value={task.id} />
                          <div className="sm:col-span-2">
                            <label className="label" htmlFor={`plan-title-${task.id}`}>
                              Task title
                            </label>
                            <input
                              id={`plan-title-${task.id}`}
                              name="title"
                              defaultValue={task.title}
                              required
                              className="input"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="label" htmlFor={`plan-description-${task.id}`}>
                              Description
                            </label>
                            <textarea
                              id={`plan-description-${task.id}`}
                              name="description"
                              defaultValue={task.description ?? ""}
                              rows={2}
                              className="textarea"
                            />
                          </div>
                          <div>
                            <label className="label" htmlFor={`plan-status-${task.id}`}>
                              Status
                            </label>
                            <select
                              id={`plan-status-${task.id}`}
                              name="status"
                              defaultValue={status}
                              className="select"
                            >
                              {PLAN_STATUSES.map((option) => (
                                <option key={option} value={option}>
                                  {PLAN_STATUS_META[option].label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="label" htmlFor={`plan-priority-${task.id}`}>
                              Priority
                            </label>
                            <select
                              id={`plan-priority-${task.id}`}
                              name="priority"
                              defaultValue={priority}
                              className="select"
                            >
                              {PLAN_PRIORITIES.map((option) => (
                                <option key={option} value={option}>
                                  {PLAN_PRIORITY_META[option].label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="label" htmlFor={`plan-stage-${task.id}`}>
                              Course stage
                            </label>
                            <select
                              id={`plan-stage-${task.id}`}
                              name="stageId"
                              defaultValue={task.stageId ?? ""}
                              className="select"
                            >
                              <option value="">No stage</option>
                              {course.stages.map((stage) => (
                                <option key={stage.id} value={stage.id}>
                                  {stage.title}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="label" htmlFor={`plan-assignee-${task.id}`}>
                              Assignee
                            </label>
                            <select
                              id={`plan-assignee-${task.id}`}
                              name="assigneeId"
                              defaultValue={task.assigneeId ?? ""}
                              className="select"
                            >
                              <option value="">Unassigned</option>
                              {tenantMembers.map((member) => (
                                <option key={member.user.id} value={member.user.id}>
                                  {member.user.name} · {member.user.email}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="label" htmlFor={`plan-start-${task.id}`}>
                              Start date
                            </label>
                            <input
                              id={`plan-start-${task.id}`}
                              name="startAt"
                              type="date"
                              defaultValue={dateInputValue(task.startAt)}
                              className="input"
                            />
                          </div>
                          <div>
                            <label className="label" htmlFor={`plan-due-${task.id}`}>
                              Due date
                            </label>
                            <input
                              id={`plan-due-${task.id}`}
                              name="dueAt"
                              type="date"
                              defaultValue={dateInputValue(task.dueAt)}
                              className="input"
                            />
                          </div>
                          <div className="flex items-center justify-end sm:col-span-2">
                            <SubmitButton variant="secondary" className="btn-sm" pendingText="Saving…">
                              Save task
                            </SubmitButton>
                          </div>
                        </form>
                        <form action={deleteCoursePlanTaskAction} className="mt-2 flex justify-end">
                          <input type="hidden" name="courseId" value={course.id} />
                          <input type="hidden" name="taskId" value={task.id} />
                          <SubmitButton
                            variant="ghost"
                            className="btn-sm text-rose-600"
                            confirm={`Delete "${task.title}" from the course plan?`}
                          >
                            <Trash2 className="size-3.5" /> Remove task
                          </SubmitButton>
                        </form>
                      </details>
                    );
                  })
                )}
              </div>
            </section>

            <div className="space-y-4">
              <form action={createCoursePlanTaskAction} className="card-pad space-y-3">
                <input type="hidden" name="courseId" value={course.id} />
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Plus className="size-4 text-brand-500" /> Add a plan task
                </h2>
                <div>
                  <label className="label" htmlFor="new-plan-title">
                    Task title
                  </label>
                  <input id="new-plan-title" name="title" required placeholder="Draft unit rubric" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="new-plan-description">
                    Description
                  </label>
                  <textarea
                    id="new-plan-description"
                    name="description"
                    rows={2}
                    placeholder="What needs to happen?"
                    className="textarea"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="new-plan-status">
                      Status
                    </label>
                    <select id="new-plan-status" name="status" defaultValue="NOT_STARTED" className="select">
                      {PLAN_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {PLAN_STATUS_META[status].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="new-plan-priority">
                      Priority
                    </label>
                    <select id="new-plan-priority" name="priority" defaultValue="MEDIUM" className="select">
                      {PLAN_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {PLAN_PRIORITY_META[priority].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="new-plan-stage">
                    Course stage
                  </label>
                  <select id="new-plan-stage" name="stageId" className="select">
                    <option value="">No stage</option>
                    {course.stages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="new-plan-assignee">
                    Assignee
                  </label>
                  <select id="new-plan-assignee" name="assigneeId" className="select">
                    <option value="">Unassigned</option>
                    {tenantMembers.map((member) => (
                      <option key={member.user.id} value={member.user.id}>
                        {member.user.name} · {member.user.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="new-plan-start">
                      Start date
                    </label>
                    <input id="new-plan-start" name="startAt" type="date" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="new-plan-due">
                      Due date
                    </label>
                    <input id="new-plan-due" name="dueAt" type="date" className="input" />
                  </div>
                </div>
                <SubmitButton className="w-full" pendingText="Adding…">
                  <Plus className="size-3.5" /> Add task
                </SubmitButton>
              </form>

              <div className="card p-5">
                <h2 className="text-sm font-bold text-slate-900">How the course plan works</h2>
                <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-500">
                  <li>Kanban columns show not yet done, in progress and met work.</li>
                  <li>Drag a card, use its arrows, or change its status selector.</li>
                  <li>The Gantt view places each task between its start and due date.</li>
                  <li>Assign tasks to a stage and a workspace member for accountability.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "budget" && (
        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="card p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Budget</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {budget === null ? "Not set" : formatMoney(budget, expenseCurrency)}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Spent</p>
                <p className="mt-1 text-xl font-bold text-rose-600">
                  {formatMoney(spent, expenseCurrency)}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Remaining</p>
                <p
                  className={`mt-1 text-xl font-bold ${
                    budgetRemaining !== null && budgetRemaining < 0 ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {budgetRemaining === null ? "—" : formatMoney(budgetRemaining, expenseCurrency)}
                </p>
              </div>
            </div>

            {budgetUsed !== null && (
              <div className="card p-4">
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Wallet className="size-3.5" /> Budget used
                  </span>
                  <span className={budgetUsed > 100 ? "text-rose-600" : "text-slate-700"}>{budgetUsed}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${budgetUsed > 100 ? "bg-rose-500" : "bg-gradient-to-r from-brand-500 to-violet-500"}`}
                    style={{ width: `${Math.min(100, Math.max(0, budgetUsed))}%` }}
                  />
                </div>
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <DollarSign className="size-4 text-emerald-600" /> Expenses
                  </h2>
                  <p className="text-[11px] text-slate-400">Everything spent to run this course.</p>
                </div>
                <Badge>{course.expenses.length} records</Badge>
              </div>
              {course.expenses.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Wallet className="size-5" />}
                    title="No expenses recorded"
                    description="Add materials, instructor time, venue hire and other costs to track the budget."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {course.expenses.map((expense) => (
                    <li key={expense.id} className="flex items-start gap-3 px-5 py-3.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <DollarSign className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold text-slate-900">{expense.title}</p>
                          <Badge tone="slate">{expense.category.toLowerCase()}</Badge>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {formatDate(expense.incurredAt)}
                          {expense.vendor ? ` · ${expense.vendor}` : ""}
                          {expense.createdBy ? ` · added by ${expense.createdBy.name}` : ""}
                        </p>
                        {expense.notes && <p className="mt-1 text-[10px] text-slate-400">{expense.notes}</p>}
                      </div>
                      <p className="shrink-0 text-right text-xs font-bold text-slate-800">
                        {formatMoney(expense.amount, expenseCurrency)}
                      </p>
                      <form action={deleteExpenseAction}>
                        <input type="hidden" name="courseId" value={course.id} />
                        <input type="hidden" name="expenseId" value={expense.id} />
                        <SubmitButton variant="ghost" className="btn-sm px-1.5 text-rose-600" confirm="Delete this expense?">
                          <Trash2 className="size-3.5" />
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <form action={createExpenseAction} className="card-pad space-y-3">
            <input type="hidden" name="courseId" value={course.id} />
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Plus className="size-4 text-brand-500" /> Add an expense
            </h2>
            <div>
              <label className="label" htmlFor="expense-title">
                What was it for?
              </label>
              <input id="expense-title" name="title" required placeholder="Printed workbooks" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="expense-amount">
                Amount ({expenseCurrency})
              </label>
              <input
                id="expense-amount"
                name="amount"
                type="number"
                min={0.01}
                step="0.01"
                required
                placeholder="0.00"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="expense-category">
                Category
              </label>
              <select id="expense-category" name="category" className="select">
                <option value="MATERIALS">Materials</option>
                <option value="INSTRUCTOR">Instructor</option>
                <option value="VENUE">Venue</option>
                <option value="TECHNOLOGY">Technology</option>
                <option value="MARKETING">Marketing</option>
                <option value="TRANSPORT">Transport</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="expense-vendor">
                  Vendor
                </label>
                <input id="expense-vendor" name="vendor" placeholder="Optional" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="expense-date">
                  Date
                </label>
                <input id="expense-date" name="incurredAt" type="date" className="input" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="expense-notes">
                Notes
              </label>
              <textarea id="expense-notes" name="notes" rows={2} className="textarea" />
            </div>
            <SubmitButton className="w-full" pendingText="Adding…">
              <Plus className="size-3.5" /> Add expense
            </SubmitButton>
            <p className="text-[10px] text-slate-400">
              Set or change the overall budget in the Settings tab.
            </p>
          </form>
        </div>
      )}

      {tab === "coding" && (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div className="card overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Code2 className="size-4 text-brand-500" /> Coding pads
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Browser labs for HTML, CSS, JavaScript and saved work for other languages.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {padReviewCount > 0 && <Badge tone="sky">{padReviewCount} to review</Badge>}
                  <Badge>{course.codePads.length} pads</Badge>
                </div>
              </div>

              {course.codePads.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Code2 className="size-5" />}
                    title="No coding pads yet"
                    description="Create a pad with starter code. Learners can edit, preview and submit it for review."
                  />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {course.codePads.map((pad) => (
                    <div key={pad.id} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-slate-900">{pad.title}</p>
                            <Badge tone="brand">{pad.language}</Badge>
                            <Badge tone={pad.published ? "green" : "slate"}>
                              {pad.published ? "Published" : "Draft"}
                            </Badge>
                          </div>
                          {pad.prompt && (
                            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{pad.prompt}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/learn/${course.id}/pads/${pad.id}`}
                            className="btn-ghost btn-sm"
                            target="_blank"
                          >
                            Preview
                          </Link>
                          <form action={deleteCodePadAction}>
                            <input type="hidden" name="padId" value={pad.id} />
                            <SubmitButton
                              variant="ghost"
                              className="btn-sm text-rose-600"
                              confirm="Delete this coding pad and all learner submissions?"
                            >
                              <Trash2 className="size-3.5" />
                            </SubmitButton>
                          </form>
                        </div>
                      </div>

                      <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/50">
                        <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-slate-600">
                          Edit pad settings & starter code
                        </summary>
                        <form action={updateCodePadAction} className="grid gap-3 border-t border-slate-200 p-3 sm:grid-cols-2">
                          <input type="hidden" name="padId" value={pad.id} />
                          <div>
                            <label className="label">Title</label>
                            <input name="title" defaultValue={pad.title} required className="input" />
                          </div>
                          <div>
                            <label className="label">Language</label>
                            <select name="language" defaultValue={pad.language} className="select">
                              {["html", "css", "javascript", "typescript", "python", "java", "c", "cpp", "csharp", "go", "rust", "sql", "bash", "other"].map((language) => (
                                <option key={language} value={language}>
                                  {language}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="label">Prompt</label>
                            <textarea name="prompt" defaultValue={pad.prompt} rows={2} className="textarea" />
                          </div>
                          <div>
                            <label className="label">Starter code</label>
                            <textarea
                              name="starterCode"
                              defaultValue={pad.starterCode}
                              rows={7}
                              spellCheck={false}
                              className="textarea font-mono text-[11px]"
                            />
                          </div>
                          <div>
                            <label className="label">Reference solution (private)</label>
                            <textarea
                              name="solution"
                              defaultValue={pad.solution ?? ""}
                              rows={7}
                              spellCheck={false}
                              className="textarea font-mono text-[11px]"
                            />
                          </div>
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 sm:col-span-2">
                            <input type="checkbox" name="published" defaultChecked={pad.published} />
                            Visible to learners
                          </label>
                          <div className="sm:col-span-2">
                            <SubmitButton pendingText="Saving…">Save pad</SubmitButton>
                          </div>
                        </form>
                      </details>

                      <div className="mt-3">
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Learner submissions ({pad.submissions.length})
                        </p>
                        {pad.submissions.length === 0 ? (
                          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-400">
                            No submissions yet.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {pad.submissions.map((submission) => (
                              <details key={submission.id} className="rounded-lg border border-slate-200">
                                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 text-[11px]">
                                  <Avatar name={submission.user.name} size="sm" />
                                  <span className="font-semibold text-slate-800">{submission.user.name}</span>
                                  <Badge
                                    tone={
                                      submission.status === "REVIEWED"
                                        ? "green"
                                        : submission.status === "SUBMITTED"
                                          ? "sky"
                                          : "slate"
                                    }
                                  >
                                    {submission.status.toLowerCase()}
                                  </Badge>
                                  {submission.score !== null && (
                                    <span className="font-bold text-slate-700">{Math.round(submission.score)}/100</span>
                                  )}
                                  <span className="ml-auto text-[9px] text-slate-400">
                                    {formatDate(submission.updatedAt, true)}
                                  </span>
                                </summary>
                                <div className="border-t border-slate-100 p-3">
                                  <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[10px] leading-5 text-slate-100">
                                    {submission.code || "// empty"}
                                  </pre>
                                  <form action={gradeCodePadAction} className="mt-3 grid gap-2 sm:grid-cols-[100px_1fr_auto] sm:items-end">
                                    <input type="hidden" name="submissionId" value={submission.id} />
                                    <div>
                                      <label className="label">Score</label>
                                      <input
                                        name="score"
                                        type="number"
                                        min={0}
                                        max={100}
                                        defaultValue={submission.score ?? ""}
                                        placeholder="0–100"
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
                                    <SubmitButton pendingText="Saving…">Save review</SubmitButton>
                                  </form>
                                </div>
                              </details>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form action={createCodePadAction} className="card-pad space-y-3">
              <input type="hidden" name="courseId" value={course.id} />
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Plus className="size-4 text-brand-500" /> New coding pad
              </h2>
              <div>
                <label className="label" htmlFor="pad-title">
                  Title
                </label>
                <input id="pad-title" name="title" required placeholder="Build a calculator" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="pad-language">
                  Language
                </label>
                <select id="pad-language" name="language" className="select">
                  <option value="javascript">JavaScript</option>
                  <option value="html">HTML</option>
                  <option value="css">CSS</option>
                  <option value="typescript">TypeScript</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                  <option value="c">C</option>
                  <option value="cpp">C++</option>
                  <option value="csharp">C#</option>
                  <option value="go">Go</option>
                  <option value="rust">Rust</option>
                  <option value="sql">SQL</option>
                  <option value="bash">Bash</option>
                  <option value="other">Other</option>
                </select>
                <p className="mt-1 text-[10px] text-slate-400">
                  HTML, CSS and JavaScript run in a sandboxed preview. Other languages are saved for review.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="pad-prompt">
                  Prompt
                </label>
                <textarea
                  id="pad-prompt"
                  name="prompt"
                  rows={2}
                  placeholder="What should the learner build?"
                  className="textarea"
                />
              </div>
              <div>
                <label className="label" htmlFor="pad-starter">
                  Starter code
                </label>
                <textarea
                  id="pad-starter"
                  name="starterCode"
                  rows={7}
                  spellCheck={false}
                  placeholder="// Write a function that…"
                  className="textarea font-mono text-[11px]"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" name="published" />
                Publish immediately
              </label>
              <SubmitButton className="w-full" pendingText="Creating…">
                <Plus className="size-3.5" /> Create pad
              </SubmitButton>
            </form>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="card-pad">
            <h2 className="text-sm font-bold text-slate-900">Course settings</h2>
            <form action={updateCourseAction} className="mt-4 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="courseId" value={course.id} />
              <div className="sm:col-span-2">
                <label className="label" htmlFor="course-title">
                  Title
                </label>
                <input id="course-title" name="title" defaultValue={course.title} required className="input" />
              </div>
              <div>
                <label className="label" htmlFor="course-subject">
                  Subject
                </label>
                <input id="course-subject" name="subject" defaultValue={course.subject} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="course-level">
                  Level
                </label>
                <input id="course-level" name="level" defaultValue={course.level} className="input" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="course-subtitle">
                  Subtitle
                </label>
                <input id="course-subtitle" name="subtitle" defaultValue={course.subtitle ?? ""} className="input" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="course-description">
                  Description
                </label>
                <textarea
                  id="course-description"
                  name="description"
                  defaultValue={course.description}
                  rows={4}
                  className="textarea"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="course-entry">
                  Entry requirements
                </label>
                <textarea
                  id="course-entry"
                  name="entryRequirements"
                  defaultValue={course.entryRequirements}
                  rows={3}
                  placeholder="What should a learner know before starting? Used by AI qualification checks."
                  className="textarea"
                />
              </div>
              <div>
                <label className="label" htmlFor="course-min-entry">
                  Minimum entry score (%)
                </label>
                <input
                  id="course-min-entry"
                  name="minEntryScore"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={course.minEntryScore}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="course-budget">
                  Course budget ({expenseCurrency})
                </label>
                <input
                  id="course-budget"
                  name="budget"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={course.budget ?? ""}
                  placeholder="No budget set"
                  className="input"
                />
              </div>
              <div className="sm:col-span-2">
                <UploadField name="coverUrl" defaultUrl={course.coverUrl ?? ""} label="Cover image" accept="image/*" />
              </div>
              <div>
                <label className="label" htmlFor="course-status">
                  Visibility
                </label>
                <select id="course-status" name="status" defaultValue={course.status} className="select">
                  <option value="DRAFT">Draft — hidden</option>
                  <option value="PUBLISHED">Published — learners can join</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              <div className="flex items-end">
                <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
              </div>
            </form>
          </div>

          <div className="space-y-4">
            <div className="card-pad">
              <h2 className="text-sm font-bold text-slate-900">Publishing checklist</h2>
              <ul className="mt-3 space-y-2 text-[12px] text-slate-600">
                {[
                  [course.lessons.some((l) => l.published), "At least one published lesson"],
                  [course.assessments.some((a) => a.status === "PUBLISHED"), "A published assessment"],
                  [course.enrollments.length > 0, "Learners enrolled"],
                  [Boolean(course.subtitle), "A learner-facing subtitle"],
                ].map(([done, label]) => (
                  <li key={label as string} className="flex items-center gap-2">
                    <span
                      className={`flex size-4 items-center justify-center rounded-full text-[9px] font-bold ${
                        done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {done ? "✓" : "·"}
                    </span>
                    {label as string}
                  </li>
                ))}
              </ul>
            </div>

            {["OWNER", "ADMIN"].includes(ctx.role) && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
                <h2 className="text-sm font-bold text-rose-900">Danger zone</h2>
                <p className="mt-1 text-[11px] leading-5 text-rose-700">
                  Deleting a course removes its lessons, assessments, attempts and enrollments.
                </p>
                <form action={deleteCourseAction} className="mt-3">
                  <input type="hidden" name="courseId" value={course.id} />
                  <SubmitButton
                    variant="danger"
                    className="btn-sm"
                    confirm={`Delete "${course.title}" and all its data? This cannot be undone.`}
                  >
                    <Trash2 className="size-3.5" /> Delete course
                  </SubmitButton>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
