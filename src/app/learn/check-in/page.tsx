import Link from "next/link";
import { ArrowLeft, CalendarCheck, CheckCircle2, KeyRound } from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { checkInAttendanceAction } from "@/lib/actions/attendance";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ATTENDANCE_META, isAttendanceStatus } from "@/lib/attendance";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Attendance check-in" };
export const dynamic = "force-dynamic";

export default async function AttendanceCheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ checked?: string; error?: string; course?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("STUDENT");

  const [enrollments, recent] = await Promise.all([
    db.enrollment.findMany({
      where: { tenantId: ctx.tenant.id, userId: ctx.user.id, status: "ACTIVE" },
      select: { course: { select: { id: true, title: true } } },
      orderBy: { course: { title: "asc" } },
    }),
    db.attendanceRecord.findMany({
      where: { studentId: ctx.user.id, session: { tenantId: ctx.tenant.id } },
      include: {
        session: {
          include: {
            course: { select: { title: true } },
            lesson: { select: { title: true } },
          },
        },
      },
      orderBy: { session: { date: "desc" } },
      take: 8,
    }),
  ]);

  const courseName = sp.course?.trim() || "your course";

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
          <span className="text-[11px] font-semibold text-slate-400">Attendance check-in</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
        <PageHeader
          eyebrow="Learning"
          title="Attendance check-in"
          subtitle="Enter the code your teacher shows in class. We’ll mark you present on that day’s register."
        />

        {sp.checked === "1" && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            You’re marked present for {courseName}.
          </div>
        )}
        {sp.error && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {sp.error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="card overflow-hidden">
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
                <KeyRound className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Enter your class code</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Codes are usually six characters and expire after 30 minutes.
                </p>
              </div>
            </div>
            <form action={checkInAttendanceAction} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className="label" htmlFor="attendance-code">
                  Attendance code
                </label>
                <input
                  id="attendance-code"
                  name="code"
                  required
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={12}
                  placeholder="ABC234"
                  className="input font-mono text-base tracking-[0.2em] uppercase"
                />
              </div>
              <SubmitButton pendingText="Checking in…">
                <CalendarCheck className="size-3.5" /> Check in
              </SubmitButton>
            </form>
            <p className="px-5 pb-4 text-[10px] leading-4 text-slate-400">
              Only learners actively enrolled in the matching course can check in. Ask your teacher for a new code if
              yours has expired.
            </p>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900">Your active courses</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">A code only applies to the course it was generated for.</p>
            </div>
            {enrollments.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                You are not enrolled in a course yet. Join a course from your dashboard first.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {enrollments.map(({ course }) => (
                  <li key={course.id} className="px-5 py-3">
                    <Link
                      href={`/learn/${course.id}`}
                      className="text-xs font-semibold text-slate-800 hover:text-brand-700"
                    >
                      {course.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="card mt-6 overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">Recent attendance</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Your latest marks across all courses.</p>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck className="size-5" />}
              title="No attendance yet"
              description="Once you check in or your teacher saves a register, your marks will appear here."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Course &amp; session</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((record) => {
                    const meta = isAttendanceStatus(record.status) ? ATTENDANCE_META[record.status] : null;
                    return (
                      <tr key={record.id}>
                        <td className="whitespace-nowrap text-xs text-slate-600">
                          {formatDate(record.session.date)}
                        </td>
                        <td>
                          <p className="text-xs font-semibold text-slate-900">{record.session.course.title}</p>
                          <p className="text-[10px] text-slate-500">
                            {record.session.title || record.session.lesson?.title || "Class register"}
                          </p>
                        </td>
                        <td>
                          <Badge tone={meta?.tone ?? "slate"}>{meta?.label ?? record.status}</Badge>
                        </td>
                        <td className="text-[11px] text-slate-500">{record.note ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
