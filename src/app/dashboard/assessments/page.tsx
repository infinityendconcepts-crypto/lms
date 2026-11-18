import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Plus,
  Timer,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { createAssessmentAction } from "@/lib/actions/assessment";
import { Badge, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate, pct } from "@/lib/utils";

export const metadata = { title: "Assessments" };

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; status?: string; new?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");

  const [courses, assessments] = await Promise.all([
    db.course.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    db.assessment.findMany({
      where: {
        tenantId: ctx.tenant.id,
        ...(sp.course ? { courseId: sp.course } : {}),
        ...(sp.status && ["DRAFT", "PUBLISHED", "CLOSED"].includes(sp.status)
          ? { status: sp.status }
          : {}),
      },
      include: {
        course: { select: { id: true, title: true } },
        _count: { select: { questions: true, attempts: true } },
        attempts: {
          where: { status: { in: ["SUBMITTED", "GRADED"] } },
          select: { status: true, score: true, maxScore: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const awaiting = await db.attempt.count({
    where: { tenantId: ctx.tenant.id, status: "SUBMITTED" },
  });

  const allQuestions = assessments.reduce((sum, a) => sum + a._count.questions, 0);
  const published = assessments.filter((a) => a.status === "PUBLISHED").length;
  const gradedAttempts = assessments.flatMap((a) => a.attempts).filter((a) => a.status === "GRADED");
  const average = gradedAttempts.length
    ? Math.round(
        gradedAttempts.reduce((sum, a) => sum + pct(a.score ?? 0, a.maxScore), 0) /
          gradedAttempts.length
      )
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Assessment engine"
        title="Assessments"
        subtitle="Quizzes, exams and assignments across every course. All nine question types, math-aware grading."
        actions={
          <>
            <Link href="/dashboard/grading" className="btn-secondary btn-sm">
              <GraduationCap className="size-3.5" /> Grading queue
              {awaiting > 0 && (
                <span className="rounded-full bg-rose-600 px-1.5 text-[10px] text-white">
                  {awaiting}
                </span>
              )}
            </Link>
            <a href="#new-assessment" className="btn-primary btn-sm">
              <Plus className="size-3.5" /> New assessment
            </a>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Assessments" value={assessments.length} icon={<ClipboardCheck className="size-4" />} />
        <Stat label="Published" value={published} icon={<CheckCircle2 className="size-4" />} />
        <Stat label="Questions" value={allQuestions} hint="across all assessments" />
        <Stat label="Average" value={`${average}%`} hint={`${gradedAttempts.length} graded attempts`} icon={<Users className="size-4" />} />
      </div>

      <details
        id="new-assessment"
        open={Boolean(sp.new) || courses.length === 0}
        className="card mt-6 mb-6 overflow-hidden"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="flex size-6 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Plus className="size-3.5" />
            </span>
            Create an assessment
          </span>
          <span className="text-[11px] text-slate-400">Pick a course, then add questions</span>
        </summary>
        {courses.length === 0 ? (
          <div className="border-t border-slate-100 p-5 text-sm text-slate-500">
            Create a course first —{" "}
            <Link href="/dashboard/courses?new=1" className="font-semibold text-brand-600 hover:underline">
              open courses
            </Link>
            .
          </div>
        ) : (
          <form
            action={createAssessmentAction}
            className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-[1.5fr_1fr_1fr_auto] sm:items-end"
          >
            <div>
              <label className="label" htmlFor="new-title">
                Title
              </label>
              <input
                id="new-title"
                name="title"
                required
                placeholder="Unit 3 quiz — polynomials"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="new-course">
                Course
              </label>
              <select id="new-course" name="courseId" required className="select">
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="new-type">
                Type
              </label>
              <select id="new-type" name="type" className="select">
                <option value="QUIZ">Quiz</option>
                <option value="EXAM">Exam</option>
                <option value="ASSIGNMENT">Assignment</option>
              </select>
            </div>
            <SubmitButton pendingText="Creating…">Create</SubmitButton>
          </form>
        )}
      </details>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { label: "All", href: "/dashboard/assessments", active: !sp.status },
          { label: "Drafts", href: "/dashboard/assessments?status=DRAFT", active: sp.status === "DRAFT" },
          { label: "Published", href: "/dashboard/assessments?status=PUBLISHED", active: sp.status === "PUBLISHED" },
          { label: "Closed", href: "/dashboard/assessments?status=CLOSED", active: sp.status === "CLOSED" },
        ].map((chip) => (
          <Link
            key={chip.label}
            href={chip.href}
            className={
              chip.active
                ? "rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
                : "chip hover:border-brand-300 hover:text-brand-700"
            }
          >
            {chip.label}
          </Link>
        ))}
        {sp.course && (
          <Link href="/dashboard/assessments" className="text-[11px] font-semibold text-slate-500 hover:underline">
            Clear course filter
          </Link>
        )}
      </div>

      {assessments.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="size-5" />}
          title="No assessments here"
          description="Create an assessment above, or clear the filters to see everything."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Assessment</th>
                <th>Course</th>
                <th>Status</th>
                <th>Questions</th>
                <th>Submissions</th>
                <th>Average</th>
                <th>Due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assessments.map((a) => {
                const submitted = a.attempts.filter((x) => x.status !== "IN_PROGRESS");
                const graded = submitted.filter((x) => x.status === "GRADED");
                const avg = graded.length
                  ? Math.round(
                      graded.reduce((sum, x) => sum + pct(x.score ?? 0, x.maxScore), 0) / graded.length
                    )
                  : null;
                const overdue = a.dueAt && a.dueAt < new Date() && a.status === "PUBLISHED";
                return (
                  <tr key={a.id}>
                    <td>
                      <Link
                        href={`/dashboard/assessments/${a.id}`}
                        className="font-semibold text-slate-900 hover:text-brand-700"
                      >
                        {a.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                        <Badge tone="brand">{a.type.toLowerCase()}</Badge>
                        {a.timeLimitMin && (
                          <span className="inline-flex items-center gap-0.5">
                            <Timer className="size-2.5" /> {a.timeLimitMin}m
                          </span>
                        )}
                        <span>
                          {a.attemptsAllowed} attempt{a.attemptsAllowed === 1 ? "" : "s"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/courses/${a.course.id}?tab=assessments`}
                        className="text-xs text-slate-600 hover:text-brand-700"
                      >
                        {a.course.title}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="tabular-nums">{a._count.questions}</td>
                    <td className="tabular-nums">{submitted.length}</td>
                    <td className="tabular-nums">{avg === null ? "—" : `${avg}%`}</td>
                    <td>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] ${
                          overdue ? "font-semibold text-rose-600" : "text-slate-500"
                        }`}
                      >
                        <CalendarClock className="size-3" />
                        {a.dueAt ? formatDate(a.dueAt) : "None"}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/dashboard/assessments/${a.id}`}
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

      <div className="mt-6 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-xs text-brand-800">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        Objective types grade themselves the moment a learner submits. Open answers and case studies
        route to the grading queue with rubrics and per-answer feedback.
      </div>
    </div>
  );
}
