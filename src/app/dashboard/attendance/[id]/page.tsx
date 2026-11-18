import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarDays,
  Download,
  FileText,
  Filter,
  History,
  KeyRound,
  Percent,
  Save,
  Table2,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { db } from "@/lib/db";
import { canAdmin, requireTenant } from "@/lib/tenant";
import {
  deactivateAttendanceCodeAction,
  deleteAttendanceSessionAction,
  generateAttendanceCodeAction,
  saveAttendanceAction,
  updateAttendanceSessionAction,
} from "@/lib/actions/attendance";
import { Avatar, Badge, EmptyState, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { cn, formatDate } from "@/lib/utils";
import {
  ATTENDANCE_CODE_MINUTES,
  ATTENDANCE_META,
  ATTENDANCE_STATUSES,
  attendanceCodeActive,
  attendanceRate,
  calendarMonthDays,
  countStatuses,
  dateInputValue,
  isAttendanceStatus,
  monthDate,
  parseDateInput,
  shiftMonth,
} from "@/lib/attendance";

export const metadata = { title: "Attendance register" };

type HistoryTone = "slate" | "green" | "amber" | "red" | "sky";
type HistoryRecord = { status: string; note: string | null; updatedAt: Date };

function formatClock(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function monthKey(date: Date) {
  return dateInputValue(date).slice(0, 7);
}

/** Explicit calendar labels, plus contextual states for empty/ambiguous days. */
const HISTORY_STATUS_META: Record<string, { label: string; tone: HistoryTone; dot: string }> = {
  PRESENT: { label: "Present", tone: "green", dot: "bg-emerald-500" },
  ABSENT: { label: "Absent", tone: "red", dot: "bg-rose-500" },
  LATE: { label: "Late", tone: "amber", dot: "bg-amber-500" },
  EXCUSED: { label: "Excused", tone: "sky", dot: "bg-sky-500" },
  NO_REGISTER: { label: "No register", tone: "slate", dot: "bg-slate-300" },
  NO_MARK: { label: "No mark", tone: "sky", dot: "bg-sky-300" },
  NOT_ENROLLED: { label: "Not enrolled", tone: "slate", dot: "bg-slate-400" },
};

const HISTORY_STATUS_PILL: Record<string, string> = {
  PRESENT: "bg-emerald-50 text-emerald-700",
  ABSENT: "bg-rose-50 text-rose-700",
  LATE: "bg-amber-50 text-amber-700",
  EXCUSED: "bg-sky-50 text-sky-700",
};

function historyMark(record?: HistoryRecord | null): {
  label: string;
  tone: HistoryTone;
  dot: string;
  title: string;
} {
  if (!record) return { label: "—", tone: "slate", dot: "bg-slate-300", title: "No mark" };
  if (!isAttendanceStatus(record.status)) {
    return { label: record.status, tone: "slate", dot: "bg-slate-300", title: record.status };
  }
  const meta = ATTENDANCE_META[record.status];
  const title = [
    meta.label,
    record.note,
    record.note === "Self check-in" ? formatClock(record.updatedAt) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { label: meta.label, tone: meta.tone, dot: meta.dot, title };
}

export default async function AttendanceRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    created?: string;
    existing?: string;
    error?: string;
    code?: string;
    view?: string;
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    month?: string;
    date?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");

  const historyView = sp.view === "calendar" ? "calendar" : "table";
  const query = sp.q?.trim() ?? "";
  const statusFilter = isAttendanceStatus(sp.status) ? sp.status : "ALL";
  const fromDate = parseDateInput(sp.from);
  const toDate = parseDateInput(sp.to);
  const fromKey = fromDate ? dateInputValue(fromDate) : "";
  const toKey = toDate ? dateInputValue(toDate) : "";
  const now = new Date();
  const todayKey = dateInputValue(now);
  const calMonth = monthDate(sp.month);
  const calMonthKey = monthKey(calMonth);
  const parsedCalDate = parseDateInput(sp.date);
  const calDate =
    parsedCalDate && monthKey(parsedCalDate) === calMonthKey
      ? parsedCalDate
      : todayKey.slice(0, 7) === calMonthKey
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
        : new Date(calMonth.getFullYear(), calMonth.getMonth(), 1, 12);
  const calDateKey = dateInputValue(calDate);

  const session = await db.attendanceSession.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      course: { select: { id: true, title: true } },
      lesson: { select: { id: true, title: true } },
      createdBy: { select: { name: true } },
      records: {
        include: {
          student: { select: { id: true, name: true, email: true, avatarUrl: true } },
          markedBy: { select: { name: true } },
        },
        orderBy: { student: { name: "asc" } },
      },
    },
  });
  if (!session) notFound();

  const enrollments = await db.enrollment.findMany({
    where: { courseId: session.courseId, status: "ACTIVE" },
    select: { userId: true },
  });
  const lessons = await db.lesson.findMany({
    where: { courseId: session.courseId },
    select: { id: true, title: true },
    orderBy: { order: "asc" },
  });

  const recordByStudent = new Map(session.records.map((r) => [r.studentId, r]));
  const enrolledIds = new Set(enrollments.map((e) => e.userId));

  // Roster = current course enrolment plus anyone already on this register
  // (covers learners who later left the course).
  const roster = [
    ...enrollments.map((e) => e.userId),
    ...session.records.map((r) => r.studentId).filter((studentId) => !enrolledIds.has(studentId)),
  ];

  const students = await db.user.findMany({
    where: { id: { in: roster } },
    select: { id: true, name: true, email: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });

  // The time-series grid covers every register taken for this course, not just
  // the one being viewed, so a single register can be read as attendance history.
  const courseSessions = await db.attendanceSession.findMany({
    where: { tenantId: ctx.tenant.id, courseId: session.courseId },
    select: {
      id: true,
      date: true,
      title: true,
      lesson: { select: { title: true } },
      records: {
        select: { studentId: true, status: true, note: true, updatedAt: true },
      },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const historyStudentIds = new Set<string>([
    ...students.map((student) => student.id),
    ...courseSessions.flatMap((item) => item.records.map((record) => record.studentId)),
  ]);
  const historyStudents = await db.user.findMany({
    where: { id: { in: [...historyStudentIds] } },
    select: { id: true, name: true, email: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });
  const historyRecords = new Map(
    courseSessions.map((item) => [item.id, new Map(item.records.map((record) => [record.studentId, record]))])
  );

  const filteredSessions = courseSessions.filter((item) => {
    const key = dateInputValue(item.date);
    if (fromKey && key < fromKey) return false;
    if (toKey && key > toKey) return false;
    return true;
  });
  const needle = query.toLowerCase();
  const filteredHistoryStudents = historyStudents.filter(
    (student) =>
      !needle || student.name.toLowerCase().includes(needle) || student.email.toLowerCase().includes(needle)
  );
  const visibleStudentIds = new Set(filteredHistoryStudents.map((student) => student.id));

  const historyByDate = new Map<string, { sessions: typeof filteredSessions; counts: ReturnType<typeof countStatuses> }>();
  for (const item of filteredSessions) {
    const key = dateInputValue(item.date);
    const bucket = historyByDate.get(key) ?? { sessions: [], counts: countStatuses([]) };
    bucket.sessions.push(item);
    for (const record of item.records) {
      if (visibleStudentIds.has(record.studentId) && isAttendanceStatus(record.status)) {
        bucket.counts[record.status] += 1;
      }
    }
    historyByDate.set(key, bucket);
  }
  const selectedBucket = historyByDate.get(calDateKey) ?? { sessions: [], counts: countStatuses([]) };
  const calendarCells = calendarMonthDays(calMonth).map((day, index) => ({
    index,
    day,
    key: day ? dateInputValue(day) : null,
  }));

  const buildHistoryHref = (next: { view?: "table" | "calendar"; month?: string; date?: string } = {}) => {
    const view = next.view ?? historyView;
    const params = new URLSearchParams({ view });
    if (query) params.set("q", query);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (fromKey) params.set("from", fromKey);
    if (toKey) params.set("to", toKey);
    if (view === "calendar") {
      params.set("month", next.month ?? calMonthKey);
      params.set("date", next.date ?? calDateKey);
    }
    return `?${params.toString()}`;
  };
  const hasHistoryFilters = Boolean(query || statusFilter !== "ALL" || fromKey || toKey);
  const clearHistoryHref = `?view=${historyView}${
    historyView === "calendar" ? `&month=${calMonthKey}&date=${calDateKey}` : ""
  }`;

  const prevMonth = shiftMonth(calMonth, -1);
  const nextMonth = shiftMonth(calMonth, 1);
  const daySessions = filteredSessions.filter((item) => dateInputValue(item.date) === calDateKey);
  const calendarRows = filteredHistoryStudents.map((student) => {
    const marks = daySessions.flatMap((session) =>
      session.records
        .filter((record) => record.studentId === student.id)
        .map((record) => ({ session, record }))
    );
    let statusKey = "NO_REGISTER";
    if (daySessions.length > 0) {
      if (marks.length === 0) {
        statusKey = enrolledIds.has(student.id) ? "NO_MARK" : "NOT_ENROLLED";
      } else {
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
            ? "Not on this course"
            : "Waiting for a mark"
        : marks
            .map(({ session, record }) => {
              const label = isAttendanceStatus(record.status)
                ? ATTENDANCE_META[record.status].label
                : record.status;
              const selfCheckIn =
                record.note === "Self check-in" ? ` · ${formatClock(record.updatedAt)}` : "";
              return `${session.title || session.lesson?.title || formatDate(session.date)}: ${label}${
                record.note ? ` · ${record.note}` : ""
              }${selfCheckIn}`;
            })
            .join(" · ");
    return { student, statusKey, detail };
  });
  const selectedCalendarRows = calendarRows.filter(
    (row) => statusFilter === "ALL" || row.statusKey === statusFilter
  );

  const effective = students.map((student) => ({
    student,
    record: recordByStudent.get(student.id),
    enrolled: enrolledIds.has(student.id),
    status: (recordByStudent.get(student.id)?.status ?? "PRESENT") as string,
  }));

  const counts = countStatuses(effective);
  const rate = attendanceRate(effective);
  const codeActive = attendanceCodeActive(session);

  const notice = sp.error
    ? { tone: "warn" as const, text: sp.error }
    : sp.code === "generated"
      ? { tone: "ok" as const, text: "New check-in code generated. Share it with your learners." }
      : sp.code === "cleared"
        ? { tone: "ok" as const, text: "The check-in code has been deactivated." }
        : sp.created
          ? { tone: "ok" as const, text: "Register created — every learner starts as present." }
          : sp.saved
            ? { tone: "ok" as const, text: "Attendance saved." }
            : sp.existing
              ? { tone: "warn" as const, text: "This register already existed for that course and date." }
              : null;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/dashboard/attendance"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-brand-700"
        >
          <ArrowLeft className="size-3.5" /> All registers
        </Link>
      </div>

      <PageHeader
        eyebrow="Attendance register"
        title={session.title || session.lesson?.title || session.course.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/dashboard/courses/${session.course.id}`} className="font-semibold text-brand-600 hover:underline">
              {session.course.title}
            </Link>
            <span>·</span>
            <span>{formatDate(session.date)}</span>
            <span>·</span>
            <span>{students.length} on roster</span>
            {session.lesson && (
              <>
                <span>·</span>
                <span>Lesson: {session.lesson.title}</span>
              </>
            )}
          </span>
        }
        actions={
          <>
            <a
              href={`/api/attendance/export?session=${session.id}`}
              className="btn-secondary btn-sm"
            >
              <Download className="size-3.5" /> Export CSV
            </a>
            {canAdmin(ctx.role) && (
              <form action={deleteAttendanceSessionAction}>
                <input type="hidden" name="sessionId" value={session.id} />
                <SubmitButton
                  variant="secondary"
                  className="btn-sm text-rose-600"
                  confirm="Delete this register and all of its marks?"
                >
                  <Trash2 className="size-3.5" /> Delete
                </SubmitButton>
              </form>
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
          label="Attendance rate"
          value={`${rate}%`}
          hint="present + late, excused excluded"
          icon={<Percent className="size-4" />}
        />
        <Stat label="Present" value={counts.PRESENT} hint={`${counts.LATE} late`} icon={<UserCheck className="size-4" />} />
        <Stat label="Absent" value={counts.ABSENT} hint={`${counts.EXCUSED} excused`} icon={<UserX className="size-4" />} />
        <Stat
          label="Marked by"
          value={session.createdBy?.name ?? "—"}
          hint={`Created ${formatDate(session.createdAt, true)}`}
          icon={<CalendarDays className="size-4" />}
        />
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <KeyRound className="size-4 text-brand-600" /> Learner check-in code
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              Generate a code and share it with the class. Learners enter it on their check-in page and are marked
              present on this register. Each code expires after {ATTENDANCE_CODE_MINUTES} minutes.
            </p>
          </div>
          <Badge tone={codeActive ? "green" : "slate"}>{codeActive ? "Active" : "No active code"}</Badge>
        </div>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
          {codeActive ? (
            <div>
              <p className="text-[10px] font-bold tracking-[0.14em] text-slate-400 uppercase">Code</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-[0.28em] text-slate-900">
                {session.checkInCode}
              </p>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Expires {formatDate(session.checkInCodeExpiresAt, true)}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">No code is currently being accepted for this register.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <form action={generateAttendanceCodeAction}>
              <input type="hidden" name="sessionId" value={session.id} />
              <SubmitButton pendingText="Generating…">
                <KeyRound className="size-3.5" /> {codeActive ? "Generate new code" : "Generate code"}
              </SubmitButton>
            </form>
            {codeActive && (
              <form action={deactivateAttendanceCodeAction}>
                <input type="hidden" name="sessionId" value={session.id} />
                <SubmitButton variant="secondary" pendingText="Deactivating…">
                  Deactivate
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <History className="size-4 text-brand-600" /> Attendance over time
            </h2>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500">
              Full chronological register history for {session.course.title}. Filter learners, statuses or dates,
              switch between the table and calendar, and scroll right to see later registers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">
              {filteredSessions.length === courseSessions.length
                ? `${courseSessions.length} registers`
                : `${filteredSessions.length} of ${courseSessions.length} registers`}
            </Badge>
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              <Link
                href={buildHistoryHref({ view: "table" })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition",
                  historyView === "table"
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                <Table2 className="size-3.5" /> Table
              </Link>
              <Link
                href={buildHistoryHref({ view: "calendar" })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition",
                  historyView === "calendar"
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                <CalendarDays className="size-3.5" /> Calendar
              </Link>
            </div>
          </div>
        </div>

        <form
          method="GET"
          className="flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50/50 px-5 py-3"
        >
          <input type="hidden" name="view" value={historyView} />
          {historyView === "calendar" && (
            <>
              <input type="hidden" name="month" value={calMonthKey} />
              <input type="hidden" name="date" value={calDateKey} />
            </>
          )}
          <div className="min-w-48 flex-1">
            <label className="label mb-1 text-[10px]" htmlFor="history-q">
              <Filter className="mr-1 inline size-3" /> Learner
            </label>
            <input
              id="history-q"
              name="q"
              defaultValue={query}
              placeholder="Search name or email"
              className="input py-1.5 text-xs"
            />
          </div>
          <div className="min-w-40">
            <label className="label mb-1 text-[10px]" htmlFor="history-status">
              Status
            </label>
            <select
              id="history-status"
              name="status"
              defaultValue={statusFilter}
              className="select py-1.5 text-xs"
            >
              <option value="ALL">All statuses</option>
              {ATTENDANCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ATTENDANCE_META[status].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label mb-1 text-[10px]" htmlFor="history-from">
              From
            </label>
            <input
              id="history-from"
              name="from"
              type="date"
              defaultValue={fromKey}
              className="input py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="label mb-1 text-[10px]" htmlFor="history-to">
              To
            </label>
            <input
              id="history-to"
              name="to"
              type="date"
              defaultValue={toKey}
              className="input py-1.5 text-xs"
            />
          </div>
          <button className="btn-secondary btn-sm" type="submit">
            Apply
          </button>
          {hasHistoryFilters && (
            <Link href={clearHistoryHref} className="btn-ghost btn-sm">
              Clear
            </Link>
          )}
        </form>

        {historyView === "table" ? (
          filteredSessions.length === 0 ? (
            <EmptyState
              icon={<History className="size-5" />}
              title="No registers match these dates"
              description="Widen the date range or clear the filters to see the full history."
            />
          ) : filteredHistoryStudents.length === 0 ? (
            <EmptyState
              icon={<Filter className="size-5" />}
              title="No learners match this search"
              description="Try a different name or email, or clear the filters."
            />
          ) : (
            <div className="max-w-full overflow-x-auto overscroll-x-contain" title="Scroll right to see later registers">
              <table
                className="table"
                style={{ minWidth: Math.max(1040, 320 + filteredSessions.length * 176) }}
              >
                <thead>
                  <tr>
                    <th className="sticky top-0 left-0 z-30 w-14 bg-slate-50 px-3 py-3 text-center">No.</th>
                    <th className="sticky top-0 left-14 z-30 min-w-56 bg-slate-50 px-3 py-3">Learner</th>
                    {filteredSessions.map((item) => {
                      const current = item.id === session.id;
                      const day = new Date(item.date);
                      return (
                        <th
                          key={item.id}
                          className={cn(
                            "sticky top-0 z-20 min-w-44 px-3 py-3 text-center",
                            current ? "bg-brand-50/80" : "bg-slate-50/70"
                          )}
                        >
                          <Link
                            href={`/dashboard/attendance/${item.id}`}
                            className={cn(
                              "block text-[11px] font-bold hover:text-brand-700",
                              current ? "text-brand-700" : "text-slate-700"
                            )}
                            title={formatDate(item.date)}
                          >
                            {day.toLocaleDateString("en-US", { weekday: "short" })}
                          </Link>
                          <Link
                            href={`/dashboard/attendance/${item.id}`}
                            className="block text-[10px] font-semibold text-slate-400 hover:text-brand-700"
                          >
                            {day.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                          </Link>
                          <p className="truncate text-[9px] font-normal text-slate-400">
                            {item.title || item.lesson?.title || "Register"}
                          </p>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredHistoryStudents.map((student, index) => (
                    <tr key={student.id} className="group">
                      <td className="sticky left-0 z-10 w-14 bg-white px-3 py-2 text-center text-[11px] text-slate-400 group-hover:bg-slate-50/60">
                        {index + 1}
                      </td>
                      <td className="sticky left-14 z-10 min-w-56 bg-white px-3 py-2 group-hover:bg-slate-50/60">
                        <div className="flex items-center gap-2">
                          <Avatar name={student.name} src={student.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-900">{student.name}</p>
                            <p className="truncate text-[10px] text-slate-400">{student.email}</p>
                          </div>
                        </div>
                      </td>
                      {filteredSessions.map((item) => {
                        const record = historyRecords.get(item.id)?.get(student.id);
                        const current = item.id === session.id;
                        const matchesStatus = statusFilter === "ALL" || record?.status === statusFilter;
                        if (!matchesStatus) {
                          return (
                            <td
                              key={item.id}
                              className={cn("min-w-44 px-3 py-2 text-center", current && "bg-brand-50/40")}
                            >
                              <span title="Filtered out" className="text-slate-300">
                                —
                              </span>
                            </td>
                          );
                        }
                        const mark = historyMark(record);
                        return (
                          <td
                            key={item.id}
                            className={cn("min-w-44 px-3 py-2 text-center", current && "bg-brand-50/40")}
                          >
                            <span title={mark.title} className="inline-flex items-center justify-center gap-1.5">
                              <span className={cn("size-1.5 rounded-full", mark.dot)} />
                              <Badge tone={mark.tone}>{mark.label}</Badge>
                            </span>
                            {record?.note === "Self check-in" && (
                              <span className="mt-0.5 block text-[9px] text-slate-400">
                                {formatClock(record.updatedAt)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Present, Absent, Late and Excused counts for each day. Select a date for every learner.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={buildHistoryHref({
                    month: monthKey(prevMonth),
                    date: dateInputValue(prevMonth),
                  })}
                  className="btn-secondary btn-sm"
                >
                  Previous
                </Link>
                <Link
                  href={buildHistoryHref({
                    month: monthKey(nextMonth),
                    date: dateInputValue(nextMonth),
                  })}
                  className="btn-secondary btn-sm"
                >
                  Next
                </Link>
                <Link
                  href={buildHistoryHref({ month: monthKey(new Date()), date: todayKey })}
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
              {calendarCells.map(({ index, day, key }) => {
                if (!day || !key) {
                  return (
                    <div
                      key={`blank-${index}`}
                      className="min-h-20 border-r border-b border-slate-100 bg-slate-50/40"
                    />
                  );
                }
                const bucket = historyByDate.get(key);
                return (
                  <Link
                    key={key}
                    href={buildHistoryHref({ date: key })}
                    className={cn(
                      "min-h-20 border-r border-b border-slate-100 p-2 transition hover:bg-brand-50/60",
                      key === calDateKey && "bg-brand-50 ring-1 ring-inset ring-brand-200",
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
                        {ATTENDANCE_STATUSES.map((status) => {
                          const meta = ATTENDANCE_META[status];
                          const dimmed = statusFilter !== "ALL" && statusFilter !== status;
                          return (
                            <span
                              key={status}
                              title={meta.label}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                HISTORY_STATUS_PILL[status],
                                dimmed && "bg-slate-50 text-slate-400 opacity-50"
                              )}
                            >
                              <span className={cn("size-1.5 rounded-full", meta.dot)} />
                              {bucket.counts[status]}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="grid gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
              {ATTENDANCE_STATUSES.map((status) => {
                const meta = ATTENDANCE_META[status];
                return (
                  <div
                    key={status}
                    className={cn(
                      "flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3",
                      statusFilter !== "ALL" && statusFilter !== status && "opacity-50"
                    )}
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <span className={cn("size-2 rounded-full", meta.dot)} />
                      {meta.label}
                    </span>
                    <span className="text-lg font-bold text-slate-900">{selectedBucket.counts[status]}</span>
                  </div>
                );
              })}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Learners · {formatDate(calDate)}</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Every learner in this course history, with their status for the selected day.
                  </p>
                </div>
                <Badge tone="slate">{selectedCalendarRows.length} shown</Badge>
              </div>
              {selectedCalendarRows.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays className="size-5" />}
                  title="No learners for this status"
                  description="Choose another date or clear the status filter to see more learners."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Learner</th>
                        <th>Status</th>
                        <th>Register detail</th>
                        <th>Register</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCalendarRows.map(({ student, statusKey, detail }) => {
                        const meta = HISTORY_STATUS_META[statusKey] ?? HISTORY_STATUS_META.NO_REGISTER;
                        return (
                          <tr key={student.id}>
                            <td>
                              <div className="flex items-center gap-2.5">
                                <Avatar name={student.name} src={student.avatarUrl} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-slate-900">{student.name}</p>
                                  <p className="truncate text-[10px] text-slate-400">{student.email}</p>
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
                              {daySessions[0] ? (
                                <Link
                                  href={`/dashboard/attendance/${daySessions[0].id}`}
                                  className="text-[11px] font-semibold text-brand-600 hover:underline"
                                >
                                  Open
                                </Link>
                              ) : (
                                <span className="text-[11px] text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <form action={saveAttendanceAction} className="card mt-6">
        <input type="hidden" name="sessionId" value={session.id} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <UserCheck className="size-4 text-brand-600" /> Learners
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
            {ATTENDANCE_STATUSES.map((status) => (
              <span key={status} className="inline-flex items-center gap-1">
                <span className={`size-1.5 rounded-full ${ATTENDANCE_META[status].dot}`} />
                {ATTENDANCE_META[status].label}
              </span>
            ))}
          </div>
        </div>

        {students.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-800">No learners on this course</p>
            <p className="mt-1 text-xs text-slate-500">
              Enroll learners on the course first, then take attendance.
            </p>
            <Link href={`/dashboard/courses/${session.course.id}?tab=students`} className="btn-primary btn-sm mt-4">
              Enroll learners
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {effective.map(({ student, record, enrolled, status }) => (
              <li key={student.id} className="flex flex-col gap-3 px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Avatar name={student.name} src={student.avatarUrl} size="sm" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-900">
                      {student.name}
                      {!enrolled && <Badge tone="slate">left course</Badge>}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">{student.email}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {ATTENDANCE_STATUSES.map((option) => {
                    const meta = ATTENDANCE_META[option];
                    return (
                      <label key={option} className="cursor-pointer" title={meta.label}>
                        <input
                          type="radio"
                          name={`status_${student.id}`}
                          value={option}
                          defaultChecked={status === option}
                          className="peer sr-only"
                        />
                        <span
                          className={`inline-flex min-w-16 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 ${meta.selected}`}
                        >
                          {meta.label}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="w-full lg:w-56">
                  <input
                    name={`note_${student.id}`}
                    defaultValue={record?.note ?? ""}
                    placeholder="Note (optional)"
                    className="input py-1.5 text-xs"
                    aria-label={`Note for ${student.name}`}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {students.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
            <p className="text-[11px] text-slate-500">
              Saving writes to the audit log. Marks can be corrected at any time.
            </p>
            <SubmitButton pendingText="Saving…">
              <Save className="size-3.5" /> Save attendance
            </SubmitButton>
          </div>
        )}
      </form>

      <details className="card mt-6 overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <FileText className="size-4 text-slate-400" /> Register details
          </span>
          <span className="text-[11px] text-slate-400">Date, lesson, topic and notes</span>
        </summary>
        <form
          action={updateAttendanceSessionAction}
          className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-2"
        >
          <input type="hidden" name="sessionId" value={session.id} />
          <div>
            <label className="label" htmlFor="edit-date">
              Date
            </label>
            <input
              id="edit-date"
              name="date"
              type="date"
              defaultValue={dateInputValue(session.date)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="edit-lesson">
              Lesson
            </label>
            <select id="edit-lesson" name="lessonId" defaultValue={session.lessonId ?? ""} className="select">
              <option value="">Not linked to a lesson</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="edit-title">
              Session topic
            </label>
            <input
              id="edit-title"
              name="title"
              defaultValue={session.title ?? ""}
              placeholder="e.g. Quadratic functions — period 2"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="edit-notes">
              Notes
            </label>
            <input
              id="edit-notes"
              name="notes"
              defaultValue={session.notes ?? ""}
              placeholder="Room, substitute teacher, field trip…"
              className="input"
            />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton variant="secondary" pendingText="Saving…">
              <Save className="size-3.5" /> Save details
            </SubmitButton>
          </div>
        </form>
      </details>
    </div>
  );
}
