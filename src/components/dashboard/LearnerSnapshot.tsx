import { BookOpen, CalendarCheck, ClipboardCheck, IdCard, ShieldCheck, Users } from "lucide-react";
import { Avatar, Badge, EmptyState, PanelHeader, Progress, Stat } from "@/components/ui";
import {
  ATTENDANCE_META,
  isAttendanceStatus,
  type AttendanceStatus,
} from "@/lib/attendance";
import { monitorTypeLabel } from "@/lib/monitor";
import type { LearnerSnapshot as Snapshot } from "@/lib/monitor-data";
import { formatDate, gradeLetter } from "@/lib/utils";

function attendanceTone(status: string) {
  return isAttendanceStatus(status) ? ATTENDANCE_META[status as AttendanceStatus].tone : "slate";
}

function attendanceLabel(status: string) {
  return isAttendanceStatus(status) ? ATTENDANCE_META[status as AttendanceStatus].label : status;
}

export function LearnerSnapshot({ snapshot }: { snapshot: Snapshot }) {
  const { learner, profile, sponsorship, attendance, courses, results, summary, monitors } = snapshot;

  return (
    <div className="space-y-5">
      <div className="card-pad flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={learner.name} src={learner.avatarUrl} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-900">{learner.name}</h2>
            <p className="truncate text-xs text-slate-500">{learner.email}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {learner.status === "ACTIVE" ? "Active learner" : learner.status.toLowerCase()} · joined{" "}
              {formatDate(learner.joinedAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">Read-only snapshot</Badge>
          {monitors.map((monitor) => (
            <Badge key={`${monitor.id}-${monitor.type}`} tone="slate">
              {monitorTypeLabel(monitor.type)} · {monitor.name}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Courses"
          value={summary.courseCount}
          hint={summary.averageProgress === null ? "No enrolments" : `${summary.averageProgress}% average progress`}
          icon={<BookOpen className="size-4" />}
        />
        <Stat
          label="Attendance"
          value={attendance.total ? `${attendance.rate}%` : "—"}
          hint={`${attendance.total} registers`}
          icon={<CalendarCheck className="size-4" />}
        />
        <Stat
          label="Graded work"
          value={summary.gradedCount}
          hint={summary.average === null ? "No grades yet" : `${summary.average}% average`}
          icon={<ClipboardCheck className="size-4" />}
        />
        <Stat
          label="Sponsorship"
          value={sponsorship.type}
          hint={sponsorship.status}
          icon={<ShieldCheck className="size-4" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <PanelHeader
            icon={<IdCard className="size-4" />}
            title="Learner profile"
            description="Registered details stored for this learner."
          />
          <dl className="grid gap-x-5 gap-y-3 p-5 sm:grid-cols-2">
            {[
              ["Student number", profile?.studentNumber],
              ["Legal name", profile?.legalName],
              ["Date of birth", profile?.dateOfBirth ? formatDate(profile.dateOfBirth) : null],
              ["Phone", profile?.phone],
              ["City", profile?.city],
              ["Country", profile?.country],
              ["Guardian", profile?.guardianName],
              ["Guardian relationship", profile?.guardianRelationship],
              ["Guardian phone", profile?.guardianPhone],
              ["Guardian email", profile?.guardianEmail],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">{label}</dt>
                <dd className="mt-0.5 truncate text-xs text-slate-700">{value || "—"}</dd>
              </div>
            ))}
            {profile?.address && (
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">Address</dt>
                <dd className="mt-0.5 text-xs text-slate-700">{profile.address}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="card overflow-hidden">
          <PanelHeader
            icon={<ShieldCheck className="size-4" />}
            title="Sponsorship"
            description="Funding status for the learner's current study period."
          />
          <dl className="space-y-3 p-5 text-xs">
            {[
              ["Type", sponsorship.type],
              ["Provider", sponsorship.provider],
              ["Reference", sponsorship.reference],
              ["Start date", sponsorship.startDate ? formatDate(sponsorship.startDate) : null],
              ["End date", sponsorship.endDate ? formatDate(sponsorship.endDate) : null],
              ["Duration", sponsorship.duration],
              ["Notes", sponsorship.notes],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-start justify-between gap-4">
                <dt className="shrink-0 text-slate-400">{label}</dt>
                <dd className="max-w-[65%] text-right whitespace-pre-wrap text-slate-700">{value || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-slate-100 px-5 py-3">
            <Badge tone={sponsorship.status === "Active" ? "green" : sponsorship.status === "Ended" ? "red" : "slate"}>
              {sponsorship.status}
            </Badge>
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <PanelHeader
          icon={<CalendarCheck className="size-4" />}
          title="Attendance"
          description="Present and late marks count towards attendance; excused absences are excluded."
        />
        <div className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-4">
          {(["PRESENT", "ABSENT", "LATE", "EXCUSED"] as AttendanceStatus[]).map((status) => (
            <div key={status} className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">{attendanceLabel(status)}</p>
              <p className="mt-0.5 text-lg font-bold text-slate-900">{attendance.counts[status]}</p>
            </div>
          ))}
        </div>
        {attendance.recent.length === 0 ? (
          <p className="p-5 text-xs text-slate-500">No attendance registers have been marked yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Register</th>
                  <th>Course</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {attendance.recent.map((record) => (
                  <tr key={record.id}>
                    <td className="whitespace-nowrap text-[11px] text-slate-500">{formatDate(record.date)}</td>
                    <td className="text-xs font-medium text-slate-700">{record.title}</td>
                    <td className="text-xs text-slate-600">{record.courseTitle}</td>
                    <td><Badge tone={attendanceTone(record.status)}>{attendanceLabel(record.status)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <PanelHeader
            icon={<BookOpen className="size-4" />}
            title="Course progress"
            description="Current enrolments and completion reported by the workspace."
          />
          {courses.length === 0 ? (
            <p className="p-5 text-xs text-slate-500">No course enrolments yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {courses.map((course) => (
                <div key={course.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">{course.title}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {course.subject} · {course.level}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-slate-700">{course.progress}%</span>
                  </div>
                  <Progress value={course.progress} className="mt-2" />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card overflow-hidden">
          <PanelHeader
            icon={<ClipboardCheck className="size-4" />}
            title="Graded results"
            description="Completed assessments and their final marks."
          />
          {results.length === 0 ? (
            <p className="p-5 text-xs text-slate-500">No graded results yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {results.map((result) => (
                <div key={result.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">{result.title}</p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">
                      {result.courseTitle} · {formatDate(result.gradedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">
                      {result.score}/{result.maxScore}
                    </span>
                    <Badge tone={result.percentage >= 50 ? "green" : "red"}>
                      {gradeLetter(result.percentage)} · {result.percentage}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {monitors.length === 0 && (
        <EmptyState
          icon={<Users className="size-5 text-brand-600" />}
          title="No monitors assigned"
          description="An owner or admin can assign a sponsor, company or parent to this learner."
        />
      )}
    </div>
  );
}
