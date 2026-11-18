import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Download,
  BookOpen,
  CheckCircle2,
  Clock,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { Avatar, Badge, EmptyState, PageHeader, Progress, Stat } from "@/components/ui";
import { gradeLetter, pct } from "@/lib/utils";

export const metadata = { title: "Gradebook" };

type AttemptRow = {
  id: string;
  assessmentId: string;
  studentId: string;
  status: string;
  score: number | null;
  maxScore: number;
  submittedAt: Date | null;
};

export default async function GradebookPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");

  const courses = await db.course.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });

  const courseId = sp.course && courses.some((c) => c.id === sp.course) ? sp.course : courses[0]?.id;

  const course = courseId
    ? await db.course.findFirst({
        where: { id: courseId, tenantId: ctx.tenant.id },
        include: {
          assessments: {
            orderBy: { createdAt: "asc" },
            include: {
              attempts: {
                where: { status: { in: ["SUBMITTED", "GRADED"] } },
                select: {
                  id: true,
                  assessmentId: true,
                  studentId: true,
                  status: true,
                  score: true,
                  maxScore: true,
                  submittedAt: true,
                },
              },
            },
          },
          enrollments: {
            include: { user: true },
            orderBy: { createdAt: "asc" },
          },
        },
      })
    : null;

  if (!course) {
    return (
      <div>
        <PageHeader title="Gradebook" subtitle="Scores across every learner and assessment." />
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title="No courses yet"
          description="Create a course and enroll learners to start building a gradebook."
          action={
            <Link href="/dashboard/courses?new=1" className="btn-primary btn-sm">
              Create a course
            </Link>
          }
        />
      </div>
    );
  }

  const byStudent = new Map<string, AttemptRow[]>();
  for (const assessment of course.assessments) {
    for (const attempt of assessment.attempts as AttemptRow[]) {
      const list = byStudent.get(attempt.studentId) ?? [];
      list.push(attempt);
      byStudent.set(attempt.studentId, list);
    }
  }

  const rows = course.enrollments.map((enrollment) => {
    const attempts = byStudent.get(enrollment.userId) ?? [];
    const latest = new Map<string, AttemptRow>();
    for (const attempt of attempts) {
      const current = latest.get(attempt.assessmentId);
      if (
        !current ||
        (attempt.submittedAt?.getTime() ?? 0) > (current.submittedAt?.getTime() ?? 0)
      ) {
        latest.set(attempt.assessmentId, attempt);
      }
    }
    const graded = [...latest.values()].filter((a) => a.status === "GRADED");
    const percentages = graded.map((a) => pct(a.score ?? 0, a.maxScore));
    const average = percentages.length
      ? Math.round(percentages.reduce((sum, n) => sum + n, 0) / percentages.length)
      : null;
    return { enrollment, latest, average, graded: graded.length };
  });

  const averages = rows.map((r) => r.average).filter((n): n is number => n !== null);
  const classAverage = averages.length
    ? Math.round(averages.reduce((sum, n) => sum + n, 0) / averages.length)
    : 0;
  const passRate = averages.length
    ? Math.round((averages.filter((n) => n >= 50).length / averages.length) * 100)
    : 0;
  const submissionRate = rows.length
    ? Math.round(
        (rows.filter((r) => r.latest.size > 0).length / rows.length) * 100
      )
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Insight"
        title="Gradebook"
        subtitle="A live matrix of learner performance. Latest submitted attempt counts for each assessment."
        actions={
          <>
            <a href="/api/gradebook/export" className="btn-secondary btn-sm">
              <Download className="size-3.5" /> Export CSV
            </a>
            <Link href="/dashboard/grading" className="btn-primary btn-sm">
              <Clock className="size-3.5" /> Grading queue
            </Link>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {courses.map((c) => (
          <Link
            key={c.id}
            href={`/dashboard/gradebook?course=${c.id}`}
            className={
              c.id === course.id
                ? "rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
                : "chip hover:border-brand-300 hover:text-brand-700"
            }
          >
            {c.title}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Learners" value={rows.length} icon={<Users className="size-4" />} />
        <Stat label="Class average" value={`${classAverage}%`} hint={`letter ${gradeLetter(classAverage)}`} icon={<BarChart3 className="size-4" />} />
        <Stat label="Pass rate" value={`${passRate}%`} hint="at or above 50%" icon={<CheckCircle2 className="size-4" />} />
        <Stat label="Participated" value={`${submissionRate}%`} hint="submitted at least one assessment" icon={<BookOpen className="size-4" />} />
      </div>

      <div className="mt-6 mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">
          {course.title}
          <span className="ml-2 text-[11px] font-normal text-slate-400">
            {course.assessments.length} assessments · {rows.length} learners
          </span>
        </h2>
        <Link
          href={`/dashboard/courses/${course.id}?tab=assessments`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline"
        >
          Manage assessments <ArrowRight className="size-3" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No learners enrolled"
          description="Enroll learners in this course to populate the gradebook."
          action={
            <Link href={`/dashboard/courses/${course.id}?tab=learners`} className="btn-primary btn-sm">
              Manage learners
            </Link>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50/95">Learner</th>
                <th>Progress</th>
                {course.assessments.map((a) => (
                  <th key={a.id} className="max-w-32">
                    <Link href={`/dashboard/assessments/${a.id}`} className="hover:text-brand-700 hover:underline">
                      {a.title}
                    </Link>
                    <p className="mt-0.5 text-[9px] font-normal normal-case tracking-normal text-slate-400">
                      {a.status.toLowerCase()}
                    </p>
                  </th>
                ))}
                <th>Average</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ enrollment, latest, average, graded }) => {
                const percent = average ?? 0;
                return (
                  <tr key={enrollment.id}>
                    <td className="sticky left-0 z-10 bg-white">
                      <div className="flex items-center gap-2">
                        <Avatar name={enrollment.user.name} src={enrollment.user.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">
                            {enrollment.user.name}
                          </p>
                          <p className="truncate text-[10px] text-slate-400">{enrollment.user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="w-28">
                      <div className="flex items-center gap-2">
                        <Progress value={enrollment.progress} />
                        <span className="text-[10px] text-slate-500">{enrollment.progress}%</span>
                      </div>
                    </td>
                    {course.assessments.map((a) => {
                      const attempt = latest.get(a.id);
                      if (!attempt) {
                        return (
                          <td key={a.id} className="text-center text-[11px] text-slate-300">
                            —
                          </td>
                        );
                      }
                      if (attempt.status === "SUBMITTED") {
                        return (
                          <td key={a.id} className="text-center">
                            <Link
                              href={`/dashboard/grading/${attempt.id}`}
                              className="badge bg-amber-50 text-amber-700"
                              title="Needs grading"
                            >
                              Grade
                            </Link>
                          </td>
                        );
                      }
                      const score = pct(attempt.score ?? 0, attempt.maxScore);
                      return (
                        <td key={a.id} className="text-center">
                          <span
                            className={`inline-flex min-w-11 justify-center rounded-lg px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                              score >= 80
                                ? "bg-emerald-50 text-emerald-700"
                                : score >= 60
                                  ? "bg-sky-50 text-sky-700"
                                  : "bg-rose-50 text-rose-700"
                            }`}
                            title={`${attempt.score} / ${attempt.maxScore}`}
                          >
                            {score}%
                          </span>
                        </td>
                      );
                    })}
                    <td className="tabular-nums font-semibold text-slate-900">
                      {average === null ? "—" : `${average}%`}
                      <span className="ml-1 text-[10px] font-normal text-slate-400">
                        {graded} graded
                      </span>
                    </td>
                    <td>
                      {average === null ? (
                        <Badge>—</Badge>
                      ) : (
                        <Badge tone={percent >= 90 ? "green" : percent >= 60 ? "sky" : "red"}>
                          {gradeLetter(percent)}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {course.assessments.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-3 text-xs text-slate-500">
          This course has no assessments yet.{" "}
          <Link href={`/dashboard/assessments?new=1`} className="font-semibold text-brand-600 hover:underline">
            Create one
          </Link>{" "}
          to start collecting scores.
        </div>
      )}
    </div>
  );
}
