import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Download,
  Percent,
  Plus,
  Trash2,
  UserX,
} from "lucide-react";
import { db } from "@/lib/db";
import { canAdmin, requireTenant } from "@/lib/tenant";
import {
  createAttendanceSessionAction,
  deleteAttendanceSessionAction,
} from "@/lib/actions/attendance";
import { Badge, EmptyState, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate } from "@/lib/utils";
import {
  ATTENDANCE_META,
  attendanceRate,
  countStatuses,
  dateInputValue,
} from "@/lib/attendance";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    course?: string;
    new?: string;
    error?: string;
    created?: string;
    saved?: string;
    deleted?: string;
    existing?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");
  const courseFilter = sp.course?.trim() ?? "";

  const since = new Date();
  since.setDate(since.getDate() - 30);
  since.setHours(0, 0, 0, 0);

  const [courses, lessons, sessions, recent] = await Promise.all([
    db.course.findMany({
      where: { tenantId: ctx.tenant.id },
      select: {
        id: true,
        title: true,
        status: true,
        _count: { select: { enrollments: true, lessons: true } },
      },
      orderBy: { title: "asc" },
    }),
    db.lesson.findMany({
      where: { course: { tenantId: ctx.tenant.id } },
      select: { id: true, title: true, courseId: true },
      orderBy: { order: "asc" },
    }),
    db.attendanceSession.findMany({
      where: {
        tenantId: ctx.tenant.id,
        ...(courseFilter ? { courseId: courseFilter } : {}),
      },
      include: {
        course: { select: { id: true, title: true } },
        lesson: { select: { id: true, title: true } },
        createdBy: { select: { name: true } },
        records: { select: { status: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 60,
    }),
    db.attendanceSession.findMany({
      where: {
        tenantId: ctx.tenant.id,
        date: { gte: since },
        ...(courseFilter ? { courseId: courseFilter } : {}),
      },
      select: { id: true, date: true, records: { select: { status: true } } },
    }),
  ]);

  const todayKey = dateInputValue(new Date());
  const todaySessions = recent.filter((s) => dateInputValue(s.date) === todayKey);
  const allRecords = recent.flatMap((s) => s.records);
  const counts = countStatuses(allRecords);
  const rate = attendanceRate(allRecords);
  const missing = counts.ABSENT + counts.LATE;

  const notice = sp.error
    ? { tone: "warn" as const, text: sp.error }
    : sp.deleted
      ? { tone: "ok" as const, text: "Register deleted." }
      : sp.existing
        ? { tone: "warn" as const, text: "A register already exists for that course and date — opening it." }
        : sp.created
          ? { tone: "ok" as const, text: "Register created. Confirm each learner's mark and save." }
          : sp.saved
            ? { tone: "ok" as const, text: "Attendance saved." }
            : null;

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Attendance"
        subtitle="Take a register for any course, mark learners present, late, absent or excused, and keep a term audit trail."
        actions={
          <>
            <a href="#new-register" className="btn-primary btn-sm">
              <Plus className="size-3.5" /> New register
            </a>
            {courseFilter && (
              <Link href="/dashboard/attendance" className="btn-secondary btn-sm">
                Clear filter
              </Link>
            )}
          </>
        }
      />

      {notice && (
        <div
          className={`mb-5 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${
            notice.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <CalendarCheck className="mt-0.5 size-4 shrink-0" />
          {notice.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Registers (30 days)"
          value={recent.length}
          hint={`${sessions.length} shown below`}
          icon={<ClipboardList className="size-4" />}
        />
        <Stat
          label="Today"
          value={todaySessions.length}
          hint={todaySessions.length ? "registers taken" : "no register yet"}
          icon={<CalendarDays className="size-4" />}
        />
        <Stat
          label="Attendance rate"
          value={`${rate}%`}
          hint="present + late, excused excluded"
          icon={<Percent className="size-4" />}
        />
        <Stat
          label="Absent / late (30d)"
          value={missing}
          hint={`${counts.EXCUSED} excused marks`}
          icon={<UserX className="size-4" />}
        />
      </div>

      <details
        id="new-register"
        open={sessions.length === 0 || sp.new === "1" ? true : undefined}
        className="card mt-6 mb-6 overflow-hidden"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="flex size-6 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Plus className="size-3.5" />
            </span>
            Start a new register
          </span>
          <span className="text-[11px] text-slate-400">
            One register per course, per day · learners default to present
          </span>
        </summary>
        {courses.length === 0 ? (
          <div className="border-t border-slate-100 p-5 text-sm text-slate-500">
            Create a course first, then take attendance for it.
          </div>
        ) : (
          <form
            action={createAttendanceSessionAction}
            className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="lg:col-span-2">
              <label className="label" htmlFor="att-course">
                Course
              </label>
              <select id="att-course" name="courseId" required className="select">
                <option value="">Choose a course…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} · {c._count.enrollments} learners
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="att-date">
                Date
              </label>
              <input
                id="att-date"
                name="date"
                type="date"
                defaultValue={dateInputValue(new Date())}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="att-lesson">
                Lesson (optional)
              </label>
              <select id="att-lesson" name="lessonId" className="select">
                <option value="">Not linked to a lesson</option>
                {courses.map((c) => {
                  const courseLessons = lessons.filter((l) => l.courseId === c.id);
                  if (courseLessons.length === 0) return null;
                  return (
                    <optgroup key={c.id} label={c.title}>
                      {courseLessons.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="label" htmlFor="att-title">
                Session topic (optional)
              </label>
              <input
                id="att-title"
                name="title"
                placeholder="e.g. Quadratic functions — period 2"
                className="input"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="label" htmlFor="att-notes">
                Notes (optional)
              </label>
              <input
                id="att-notes"
                name="notes"
                placeholder="Room, substitute teacher, field trip…"
                className="input"
              />
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-4">
              <SubmitButton pendingText="Creating…">
                <CalendarCheck className="size-3.5" /> Create register
              </SubmitButton>
            </div>
          </form>
        )}
      </details>

      <form method="GET" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="filter-course">
            Filter by course
          </label>
          <select id="filter-course" name="course" defaultValue={courseFilter} className="select">
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary">Apply</button>
      </form>

      {sessions.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="size-5" />}
          title={courseFilter ? "No registers for this course" : "No attendance taken yet"}
          description={
            courseFilter
              ? "Clear the filter or start a new register for this course."
              : "Create your first register above. Every learner on the course roster is added automatically."
          }
          action={
            <a href="#new-register" className="btn-primary btn-sm">
              <Plus className="size-3.5" /> New register
            </a>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Course &amp; session</th>
                <th>Marks</th>
                <th>Rate</th>
                <th>Taken by</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const counts = countStatuses(session.records);
                const rate = attendanceRate(session.records);
                const total = session.records.length;
                return (
                  <tr key={session.id}>
                    <td className="whitespace-nowrap">
                      <p className="text-xs font-semibold text-slate-800">{formatDate(session.date)}</p>
                      <p className="text-[10px] text-slate-400">{total} on roster</p>
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/attendance/${session.id}`}
                        className="text-xs font-semibold text-slate-900 hover:text-brand-700"
                      >
                        {session.course.title}
                      </Link>
                      <p className="text-[10px] text-slate-500">
                        {session.title || session.lesson?.title || "Class register"}
                      </p>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1">
                        {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((status) => (
                          <span
                            key={status}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                            title={ATTENDANCE_META[status].label}
                          >
                            <span className={`size-1.5 rounded-full ${ATTENDANCE_META[status].dot}`} />
                            {counts[status]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Badge tone={rate >= 90 ? "green" : rate >= 75 ? "amber" : "red"}>{rate}%</Badge>
                    </td>
                    <td className="text-[11px] text-slate-500">{session.createdBy?.name ?? "—"}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/api/attendance/export?session=${session.id}`}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          title="Export CSV"
                        >
                          <Download className="size-3.5" />
                        </a>
                        <Link
                          href={`/dashboard/attendance/${session.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline"
                        >
                          Open <ArrowRight className="size-3" />
                        </Link>
                        {canAdmin(ctx.role) && (
                          <form action={deleteAttendanceSessionAction}>
                            <input type="hidden" name="sessionId" value={session.id} />
                            <SubmitButton
                              variant="ghost"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              confirm="Delete this register and all of its marks?"
                            >
                              <Trash2 className="size-3.5" />
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
