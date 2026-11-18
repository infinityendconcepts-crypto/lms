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
import { Avatar, Badge, EmptyState, PageHeader, Stat, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { cn, formatDate } from "@/lib/utils";
import {
  ATTENDANCE_META,
  attendanceRate,
  calendarMonthDays,
  countStatuses,
  dateInputValue,
  dayBounds,
  isAttendanceStatus,
  monthBounds,
  monthDate,
  parseDateInput,
  shiftMonth,
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
    view?: string;
    month?: string;
    date?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");
  const courseFilter = sp.course?.trim() ?? "";
  const view = sp.view === "calendar" ? "calendar" : "registers";

  const now = new Date();
  const todayKey = dateInputValue(now);
  const calendarMonth = monthDate(sp.month);
  const monthKey = dateInputValue(calendarMonth).slice(0, 7);
  const parsedSelected = parseDateInput(sp.date);
  const selectedDate =
    parsedSelected && dateInputValue(parsedSelected).slice(0, 7) === monthKey
      ? parsedSelected
      : todayKey.slice(0, 7) === monthKey
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
        : new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1, 12);
  const selectedKey = dateInputValue(selectedDate);
  const { start: monthStart, end: monthEnd } = monthBounds(calendarMonth);
  const { start: dayStart, end: dayEnd } = dayBounds(selectedDate);

  const since = new Date();
  since.setDate(since.getDate() - 30);
  since.setHours(0, 0, 0, 0);

  const [courses, lessons, sessions, recent, monthSessions, daySessionsRaw, learners] = await Promise.all([
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
    db.attendanceSession.findMany({
      where: {
        tenantId: ctx.tenant.id,
        date: { gte: monthStart, lt: monthEnd },
        ...(courseFilter ? { courseId: courseFilter } : {}),
      },
      include: {
        course: { select: { id: true, title: true } },
        records: { select: { status: true } },
      },
      orderBy: { date: "asc" },
    }),
    db.attendanceSession.findMany({
      where: {
        tenantId: ctx.tenant.id,
        date: { gte: dayStart, lt: dayEnd },
        ...(courseFilter ? { courseId: courseFilter } : {}),
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            enrollments: { where: { status: "ACTIVE" }, select: { userId: true } },
          },
        },
        records: { select: { studentId: true, status: true, note: true } },
      },
    }),
    db.membership.findMany({
      where: { tenantId: ctx.tenant.id, role: "STUDENT" },
      select: {
        status: true,
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const todaySessions = recent.filter((s) => dateInputValue(s.date) === todayKey);
  const allRecords = recent.flatMap((s) => s.records);
  const counts = countStatuses(allRecords);
  const rate = attendanceRate(allRecords);
  const missing = counts.ABSENT + counts.LATE;

  const daySessions = [...daySessionsRaw].sort((a, b) => a.course.title.localeCompare(b.course.title));
  const dayCounts = countStatuses(daySessions.flatMap((session) => session.records));
  const monthByDate = new Map<string, { registers: number; marks: number; present: number; absent: number }>();
  for (const session of monthSessions) {
    const key = dateInputValue(session.date);
    const bucket = monthByDate.get(key) ?? { registers: 0, marks: 0, present: 0, absent: 0 };
    const sessionCounts = countStatuses(session.records);
    bucket.registers += 1;
    bucket.marks += session.records.length;
    bucket.present += sessionCounts.PRESENT + sessionCounts.LATE;
    bucket.absent += sessionCounts.ABSENT;
    monthByDate.set(key, bucket);
  }

  const calendarCells = calendarMonthDays(calendarMonth).map((day, index) => {
    const key = day ? dateInputValue(day) : null;
    return { index, day, key, bucket: key ? monthByDate.get(key) : undefined };
  });

  const calendarMeta: Record<string, { label: string; tone: "green" | "red" | "amber" | "sky" | "slate"; dot: string }> = {
    ...ATTENDANCE_META,
    NO_REGISTER: { label: "No register", tone: "slate", dot: "bg-slate-300" },
    NOT_ENROLLED: { label: "Not enrolled", tone: "slate", dot: "bg-slate-300" },
    NO_MARK: { label: "No mark", tone: "sky", dot: "bg-sky-300" },
  };

  const calendarRows = learners.map((membership) => {
    const studentId = membership.user.id;
    const relevantSessions = daySessions.filter(
      (session) =>
        session.course.enrollments.some((enrollment) => enrollment.userId === studentId) ||
        session.records.some((record) => record.studentId === studentId)
    );
    const marks = relevantSessions.flatMap((session) =>
      session.records
        .filter((record) => record.studentId === studentId)
        .map((record) => ({ session, record }))
    );

    let statusKey = "NO_REGISTER";
    if (daySessions.length > 0) {
      if (relevantSessions.length === 0) statusKey = "NOT_ENROLLED";
      else if (marks.length === 0) statusKey = "NO_MARK";
      else {
        statusKey =
          (["ABSENT", "LATE", "EXCUSED", "PRESENT"] as const).find((status) =>
            marks.some(({ record }) => record.status === status)
          ) ?? "NO_MARK";
      }
    }

    const detail =
      marks.length === 0
        ? statusKey === "NO_REGISTER"
          ? "No register for this day"
          : statusKey === "NOT_ENROLLED"
            ? "Not on these course rosters"
            : "Waiting for a mark"
        : marks.length === 1
          ? `${marks[0].session.course.title}${marks[0].record.note ? ` · ${marks[0].record.note}` : ""}`
          : marks
              .map(
                ({ session, record }) =>
                  `${session.course.title}: ${isAttendanceStatus(record.status) ? ATTENDANCE_META[record.status].short : record.status}`
              )
              .join(" · ");

    return { membership, statusKey, detail };
  });

  const monthValue = (date: Date) => dateInputValue(date).slice(0, 7);
  const viewHref = (nextView: "registers" | "calendar") => {
    const params = new URLSearchParams({ view: nextView });
    if (courseFilter) params.set("course", courseFilter);
    return `?${params.toString()}`;
  };
  const calendarHref = (next: { month?: string; date?: string | null }) => {
    const params = new URLSearchParams({ view: "calendar" });
    if (courseFilter) params.set("course", courseFilter);
    params.set("month", next.month ?? monthKey);
    if (next.date) params.set("date", next.date);
    return `?${params.toString()}`;
  };

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
            {view === "registers" ? (
              <a href="#new-register" className="btn-primary btn-sm">
                <Plus className="size-3.5" /> New register
              </a>
            ) : (
              <Link href={`${viewHref("registers")}&new=1`} className="btn-primary btn-sm">
                <Plus className="size-3.5" /> New register
              </Link>
            )}
            {courseFilter && (
              <Link href={viewHref(view)} className="btn-secondary btn-sm">
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

      <Tabs
        items={[
          { href: viewHref("registers"), label: "Registers" },
          { href: viewHref("calendar"), label: "Calendar" },
        ]}
        current={viewHref(view)}
      />

      <form method="GET" className="mb-5 flex flex-wrap items-end gap-2">
        <input type="hidden" name="view" value={view} />
        {view === "calendar" && (
          <>
            <input type="hidden" name="month" value={monthKey} />
            <input type="hidden" name="date" value={selectedKey} />
          </>
        )}
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

      {view === "registers" && (
        <>
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
        </>
      )}

      {view === "calendar" && (
        <div className="mt-1">
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Select a date to see every learner and their attendance status.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={calendarHref({ month: monthValue(shiftMonth(calendarMonth, -1)) })}
                  className="btn-secondary btn-sm"
                >
                  Previous
                </Link>
                <Link
                  href={calendarHref({ month: monthValue(shiftMonth(calendarMonth, 1)) })}
                  className="btn-secondary btn-sm"
                >
                  Next
                </Link>
                <Link
                  href={calendarHref({ month: monthValue(new Date()), date: todayKey })}
                  className="btn-ghost btn-sm"
                >
                  Today
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  className="px-2 py-2 text-center text-[10px] font-bold tracking-wide text-slate-500 uppercase"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarCells.map(({ index, day, key, bucket }) =>
                !day || !key ? (
                  <div
                    key={`blank-${index}`}
                    className="min-h-20 border-r border-b border-slate-100 bg-slate-50/40"
                  />
                ) : (
                  <Link
                    key={key}
                    href={calendarHref({ month: monthKey, date: key })}
                    className={cn(
                      "min-h-20 border-r border-b border-slate-100 p-2 transition hover:bg-brand-50/60",
                      key === selectedKey && "bg-brand-50 ring-1 ring-inset ring-brand-200",
                      key === todayKey && "font-semibold text-brand-700"
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs",
                        key === todayKey ? "font-bold text-brand-700" : "text-slate-700"
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {bucket && (
                      <span className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          {bucket.present}
                        </span>
                        {bucket.absent > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                            <span className="size-1.5 rounded-full bg-rose-500" />
                            {bucket.absent}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">· {bucket.registers}r</span>
                      </span>
                    )}
                  </Link>
                )
              )}
            </div>
          </section>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Registers"
              value={daySessions.length}
              hint={formatDate(selectedDate)}
              icon={<ClipboardList className="size-4" />}
            />
            <Stat
              label="Present"
              value={dayCounts.PRESENT + dayCounts.LATE}
              hint={`${dayCounts.LATE} late`}
              icon={<CalendarCheck className="size-4" />}
            />
            <Stat
              label="Absent"
              value={dayCounts.ABSENT}
              hint={`${dayCounts.EXCUSED} excused`}
              icon={<UserX className="size-4" />}
            />
            <Stat
              label="Learners"
              value={learners.length}
              hint="in this workspace"
              icon={<CalendarDays className="size-4" />}
            />
          </div>

          <section className="card mt-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Learners · {formatDate(selectedDate)}</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Every learner in this workspace, with their mark for the selected day.
                </p>
              </div>
              <Badge tone="slate">{calendarRows.length} learners</Badge>
            </div>
            {calendarRows.length === 0 ? (
              <EmptyState
                icon={<CalendarCheck className="size-5" />}
                title="No learners yet"
                description="Add learners to this workspace to see their attendance here."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Learner</th>
                      <th>Status</th>
                      <th>Register detail</th>
                      <th>Membership</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calendarRows.map(({ membership, statusKey, detail }) => {
                      const meta = calendarMeta[statusKey] ?? calendarMeta.NO_REGISTER;
                      return (
                        <tr key={membership.user.id}>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={membership.user.name} src={membership.user.avatarUrl} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-slate-900">
                                  {membership.user.name}
                                </p>
                                <p className="truncate text-[10px] text-slate-400">{membership.user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="inline-flex items-center gap-1.5">
                              <span className={cn("size-2 rounded-full", meta.dot)} />
                              <Badge tone={meta.tone}>{meta.label}</Badge>
                            </span>
                          </td>
                          <td className="text-[11px] text-slate-500">{detail}</td>
                          <td>
                            <Badge tone={membership.status === "ACTIVE" ? "green" : "slate"}>
                              {membership.status === "ACTIVE" ? "Active" : "Suspended"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
