import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarDays,
  Download,
  FileText,
  History,
  KeyRound,
  Percent,
  Save,
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
  countStatuses,
  dateInputValue,
  isAttendanceStatus,
} from "@/lib/attendance";

export const metadata = { title: "Attendance register" };

type HistoryTone = "slate" | "green" | "amber" | "red" | "sky";
type HistoryRecord = { status: string; note: string | null; updatedAt: Date };

function formatClock(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

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
  const label =
    record.status === "PRESENT" || record.status === "LATE"
      ? "Yes"
      : record.status === "ABSENT"
        ? "No"
        : "Excused";
  const title = [
    meta.label,
    record.note,
    record.note === "Self check-in" ? formatClock(record.updatedAt) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { label, tone: meta.tone, dot: meta.dot, title };
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
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");

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
              Every register for {session.course.title}, oldest to newest. Yes means present or late; No means absent.
              Times appear under learner self check-ins. Select a date to open that register.
            </p>
          </div>
          <Badge tone="brand">{courseSessions.length} registers</Badge>
        </div>
        {historyStudents.length === 0 ? (
          <EmptyState
            icon={<History className="size-5" />}
            title="No learners to show"
            description="Enroll learners on this course to build the attendance history grid."
          />
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <table className="table" style={{ minWidth: 320 + courseSessions.length * 112 }}>
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-30 w-14 bg-slate-50 px-3 py-3 text-center">No.</th>
                  <th className="sticky top-0 left-14 z-30 min-w-56 bg-slate-50 px-3 py-3">Learner</th>
                  {courseSessions.map((item) => {
                    const current = item.id === session.id;
                    const day = new Date(item.date);
                    return (
                      <th
                        key={item.id}
                        className={cn(
                          "sticky top-0 z-20 min-w-28 px-3 py-3 text-center",
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
                          {formatDate(item.date).replace(/,?\s*\d{4}$/, "")}
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
                {historyStudents.map((student, index) => (
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
                    {courseSessions.map((item) => {
                      const record = historyRecords.get(item.id)?.get(student.id);
                      const mark = historyMark(record);
                      const current = item.id === session.id;
                      return (
                        <td
                          key={item.id}
                          className={cn("min-w-28 px-3 py-2 text-center", current && "bg-brand-50/40")}
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
