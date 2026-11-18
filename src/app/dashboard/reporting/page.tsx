import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  Download,
  FileBarChart,
  GraduationCap,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { getWorkspaceReport } from "@/lib/reporting";
import { RISK_BANDS, RISK_META } from "@/lib/ai/format";
import { Badge, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Reporting" };
export const dynamic = "force-dynamic";

type Segment = { label: string; value: number; color: string };

function SegmentedBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) {
    return <div className="h-2.5 rounded-full bg-slate-100" />;
  }
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" title={`${total} records`}>
      {segments.map((segment) => (
        <span
          key={segment.label}
          className={segment.color}
          style={{ width: `${(segment.value / total) * 100}%` }}
          title={`${segment.label}: ${segment.value}`}
        />
      ))}
    </div>
  );
}

export default async function ReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");

  const courseOptions = await db.course.findMany({
    where: { tenantId: ctx.tenant.id },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
  const selectedCourse =
    sp.course && courseOptions.some((course) => course.id === sp.course) ? sp.course : null;
  const report = await getWorkspaceReport(ctx.tenant.id, selectedCourse);
  const exportQuery = selectedCourse ? `&course=${selectedCourse}` : "";

  return (
    <div>
      <PageHeader
        eyebrow="People & insight"
        title="Reporting"
        subtitle={`A workspace-wide view of learning, attendance and outcomes. Generated ${formatDate(
          new Date(report.generatedAt),
          true
        )}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/reporting/export?type=courses${exportQuery}`} className="btn-secondary btn-sm">
              <Download className="size-3.5" /> Courses CSV
            </a>
            <a href={`/api/reporting/export?type=learners${exportQuery}`} className="btn-secondary btn-sm">
              <Download className="size-3.5" /> Learners CSV
            </a>
            <a href={`/api/reporting/export?type=attempts${exportQuery}`} className="btn-secondary btn-sm">
              <Download className="size-3.5" /> Attempts CSV
            </a>
          </div>
        }
      />

      {sp.error && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {sp.error}
        </div>
      )}

      <div className="card mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="report-course">
              Scope
            </label>
            <select
              id="report-course"
              name="course"
              defaultValue={selectedCourse ?? ""}
              className="select w-60 sm:w-72"
            >
              <option value="">Whole workspace</option>
              {courseOptions.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary btn-sm">
            Apply
          </button>
          {selectedCourse && (
            <Link href="/dashboard/reporting" className="btn-ghost btn-sm">
              Clear
            </Link>
          )}
        </form>
        <p className="text-[11px] text-slate-400">
          {report.courses} course{report.courses === 1 ? "" : "s"} · {report.assessments} assessments ·{" "}
          {report.attempts} attempts
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Learners in scope"
          value={report.learners}
          hint={`${report.courses} course${report.courses === 1 ? "" : "s"} available`}
          icon={<Users className="size-4" />}
        />
        <Stat
          label="Assessment pass rate"
          value={`${report.passRate}%`}
          hint={`${report.averageScore}% average score · ${report.scoredAttempts} scored`}
          icon={<ClipboardCheck className="size-4" />}
        />
        <Stat
          label="Attendance"
          value={`${report.attendanceRate}%`}
          hint={`${report.attendance.PRESENT} present · ${report.attendance.LATE} late · ${report.attendance.ABSENT} absent`}
          icon={<CalendarCheck className="size-4" />}
        />
        <Stat
          label="Lesson completion"
          value={`${report.lessonCompletion}%`}
          hint={`${report.averageOutlook}% average success outlook`}
          icon={<GraduationCap className="size-4" />}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <ClipboardCheck className="size-3.5" /> Assessment outcomes
          </h2>
          <p className="mt-3 text-2xl font-bold text-slate-900">{report.passedAttempts} passed</p>
          <p className="mb-3 text-[11px] text-slate-400">
            {report.pendingGrading} awaiting grading · {report.inProgress} in progress
          </p>
          <SegmentedBar
            segments={[
              { label: "Passed", value: report.passedAttempts, color: "bg-emerald-500" },
              {
                label: "Below pass mark",
                value: Math.max(0, report.scoredAttempts - report.passedAttempts),
                color: "bg-rose-500",
              },
              { label: "In progress", value: report.inProgress, color: "bg-slate-300" },
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-500" /> Passed</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-rose-500" /> Below pass</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-slate-300" /> In progress</span>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <CalendarCheck className="size-3.5" /> Attendance mix
          </h2>
          <p className="mt-3 text-2xl font-bold text-slate-900">{report.attendanceRate}%</p>
          <p className="mb-3 text-[11px] text-slate-400">Present or late, excluding excused absences</p>
          <SegmentedBar
            segments={[
              { label: "Present", value: report.attendance.PRESENT, color: "bg-emerald-500" },
              { label: "Late", value: report.attendance.LATE, color: "bg-amber-500" },
              { label: "Absent", value: report.attendance.ABSENT, color: "bg-rose-500" },
              { label: "Excused", value: report.attendance.EXCUSED, color: "bg-sky-500" },
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-500" /> Present</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-amber-500" /> Late</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-rose-500" /> Absent</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-sky-500" /> Excused</span>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <FileBarChart className="size-3.5" /> Success outlook
          </h2>
          <p className="mt-3 text-2xl font-bold text-slate-900">{report.averageOutlook}%</p>
          <p className="mb-3 text-[11px] text-slate-400">Explainable local estimate, no API key required</p>
          <SegmentedBar
            segments={RISK_BANDS.map((band) => ({
              label: RISK_META[band].label,
              value: report.riskBands[band],
              color: RISK_META[band].bar,
            }))}
          />
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500">
            {RISK_BANDS.map((band) => (
              <span key={band} className="flex items-center gap-1.5">
                <i className={`size-2 rounded-full ${RISK_META[band].bar}`} /> {RISK_META[band].label}:{" "}
                {report.riskBands[band]}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <BookOpen className="size-4 text-brand-500" /> Course performance
            </h2>
            <p className="text-[11px] text-slate-400">Enrollment, assessment and completion metrics by course.</p>
          </div>
          <Badge tone="brand">{report.courseRows.length} courses</Badge>
        </div>
        {report.courseRows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No courses in this scope" description="Create a course or clear the course filter." />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Learners</th>
                  <th>Assessments</th>
                  <th>Attempts</th>
                  <th>Avg score</th>
                  <th>Pass rate</th>
                  <th>Attendance</th>
                  <th>Lessons</th>
                </tr>
              </thead>
              <tbody>
                {report.courseRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/dashboard/courses/${row.id}`} className="font-semibold text-slate-800 hover:text-brand-600">
                        {row.title}
                      </Link>
                      <div className="mt-0.5"><StatusBadge status={row.status} /></div>
                    </td>
                    <td>{row.learners}</td>
                    <td>{row.assessments}</td>
                    <td>{row.attempts}</td>
                    <td>{row.averageScore}%</td>
                    <td>
                      <Badge tone={row.passRate >= 70 ? "green" : row.passRate >= 50 ? "amber" : "red"}>
                        {row.passRate}%
                      </Badge>
                    </td>
                    <td>{row.attendanceRate}%</td>
                    <td>{row.lessonCompletion}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Users className="size-4 text-brand-500" /> Learner outcomes
            </h2>
            <p className="text-[11px] text-slate-400">Lowest success outlook first so support needs stand out.</p>
          </div>
          <Badge tone="brand">{report.learnerRows.length} learners</Badge>
        </div>
        {report.learnerRows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No learners yet" description="Learners appear here once they join this workspace." />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Courses</th>
                  <th>Scored attempts</th>
                  <th>Avg score</th>
                  <th>Attendance</th>
                  <th>Lessons</th>
                  <th>Success outlook</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.learnerRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/dashboard/students/${row.id}`} className="font-semibold text-slate-800 hover:text-brand-600">
                        {row.name}
                      </Link>
                      <p className="text-[10px] text-slate-400">{row.email}</p>
                    </td>
                    <td>{row.courses}</td>
                    <td>{row.attempts}</td>
                    <td>{row.averageScore}%</td>
                    <td>{row.attendanceRate}%</td>
                    <td>{row.lessonCompletion}%</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">{row.successProbability}%</span>
                        <Badge tone={RISK_META[row.band].tone}>{RISK_META[row.band].label}</Badge>
                      </div>
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/insights/${row.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                      >
                        Detail <ArrowUpRight className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ClipboardCheck className="size-4 text-brand-500" /> Recent assessment activity
          </h2>
          <span className="text-[11px] text-slate-400">Newest first</span>
        </div>
        {report.attemptRows.length === 0 ? (
          <p className="px-5 py-6 text-center text-xs text-slate-400">No attempts recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {report.attemptRows.slice(0, 8).map((attempt) => (
              <li key={attempt.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-slate-800">
                    {attempt.studentName} · {attempt.assessmentTitle}
                  </p>
                  <p className="truncate text-[10px] text-slate-400">
                    {attempt.courseTitle} · {attempt.studentEmail} · started{" "}
                    {attempt.startedAt ? formatDate(attempt.startedAt, true) : "—"}
                  </p>
                </div>
                <Badge tone={attempt.status === "GRADED" ? "green" : attempt.status === "SUBMITTED" ? "sky" : "slate"}>
                  {attempt.status.replace("_", " ").toLowerCase()}
                </Badge>
                <span className="w-12 text-right text-xs font-bold text-slate-700">{attempt.score}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
