import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  GraduationCap,
  Inbox,
  PenLine,
  Timer,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { Avatar, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { formatDate, pct, timeAgo } from "@/lib/utils";

export const metadata = { title: "Grading queue" };

export default async function GradingQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; assessment?: string; graded?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("TEACHER");
  const status = sp.status === "GRADED" ? "GRADED" : sp.status === "ALL" ? "ALL" : "SUBMITTED";

  const [assessments, attempts, counts] = await Promise.all([
    db.assessment.findMany({
      where: { tenantId: ctx.tenant.id },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    db.attempt.findMany({
      where: {
        tenantId: ctx.tenant.id,
        ...(sp.assessment ? { assessmentId: sp.assessment } : {}),
        ...(status === "ALL" ? { status: { in: ["SUBMITTED", "GRADED", "IN_PROGRESS"] } } : { status }),
      },
      include: {
        student: true,
        assessment: { include: { course: { select: { title: true } } } },
        answers: { select: { score: true } },
      },
      orderBy: [{ submittedAt: "asc" }, { startedAt: "asc" }],
      take: 200,
    }),
    Promise.all([
      db.attempt.count({ where: { tenantId: ctx.tenant.id, status: "SUBMITTED" } }),
      db.attempt.count({ where: { tenantId: ctx.tenant.id, status: "GRADED" } }),
      db.attempt.count({ where: { tenantId: ctx.tenant.id, status: "IN_PROGRESS" } }),
    ]),
  ]);

  const [pending, graded, inProgress] = counts;
  const pendingAnswers = attempts.reduce(
    (sum, a) => sum + a.answers.filter((x) => x.score === null).length,
    0
  );

  return (
    <div>
      <PageHeader
        eyebrow="Manual review"
        title="Grading queue"
        subtitle="Open answers and case studies land here. Objective types already graded themselves."
        actions={
          <Link href="/dashboard/gradebook" className="btn-secondary btn-sm">
            <GraduationCap className="size-3.5" /> Gradebook
          </Link>
        }
      />

      {sp.graded && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Grade saved. The attempt totals updated automatically.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Awaiting review"
          value={pending}
          hint={pending ? `${pendingAnswers} open answers in view` : "Inbox zero"}
          icon={<Inbox className="size-4" />}
        />
        <Stat label="Graded" value={graded} icon={<CheckCircle2 className="size-4" />} />
        <Stat label="In progress" value={inProgress} hint="learners mid-attempt" icon={<Timer className="size-4" />} />
        <Stat
          label="Assessments"
          value={assessments.length}
          hint="with submission tracking"
        />
      </div>

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-2">
        {[
          { key: "SUBMITTED", label: `Needs grading${pending ? ` (${pending})` : ""}` },
          { key: "GRADED", label: "Graded" },
          { key: "ALL", label: "All attempts" },
        ].map((chip) => {
          const params = new URLSearchParams();
          if (chip.key !== "SUBMITTED") params.set("status", chip.key);
          if (sp.assessment) params.set("assessment", sp.assessment);
          const href = `/dashboard/grading${params.toString() ? `?${params}` : ""}`;
          return (
            <Link
              key={chip.key}
              href={href}
              className={
                status === chip.key
                  ? "rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
                  : "chip hover:border-brand-300 hover:text-brand-700"
              }
            >
              {chip.label}
            </Link>
          );
        })}
        {sp.assessment && (
          <Link href="/dashboard/grading" className="text-[11px] font-semibold text-slate-500 hover:underline">
            Clear assessment filter
          </Link>
        )}
      </div>

      {attempts.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="size-5" />}
          title={status === "SUBMITTED" ? "Nothing to grade" : "No attempts found"}
          description={
            status === "SUBMITTED"
              ? "When learners submit open-ended or case-study answers, they will appear here."
              : "Try a different filter or wait for learners to submit an assessment."
          }
          action={
            <Link href="/dashboard/assessments" className="btn-secondary btn-sm">
              View assessments
            </Link>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Learner</th>
                <th>Assessment</th>
                <th>Status</th>
                <th>Open answers</th>
                <th>Score</th>
                <th>Submitted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => {
                const open = attempt.answers.filter((a) => a.score === null).length;
                const percent = pct(attempt.score ?? 0, attempt.maxScore);
                return (
                  <tr key={attempt.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={attempt.student.name} src={attempt.student.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">
                            {attempt.student.name}
                          </p>
                          <p className="truncate text-[10px] text-slate-400">{attempt.student.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="text-xs font-medium text-slate-800">{attempt.assessment.title}</p>
                      <p className="text-[10px] text-slate-400">{attempt.assessment.course.title}</p>
                    </td>
                    <td>
                      <StatusBadge status={attempt.status} />
                    </td>
                    <td>
                      {open > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                          <PenLine className="size-3" /> {open}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="tabular-nums">
                      {attempt.status === "GRADED"
                        ? `${attempt.score ?? 0}/${attempt.maxScore} · ${percent}%`
                        : attempt.score !== null
                          ? `${attempt.score}/${attempt.maxScore}`
                          : "—"}
                    </td>
                    <td className="text-[11px] text-slate-500">
                      {attempt.submittedAt ? (
                        <span title={formatDate(attempt.submittedAt, true)}>
                          {timeAgo(attempt.submittedAt)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <Clock className="size-3" /> in progress
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/dashboard/grading/${attempt.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline"
                      >
                        {attempt.status === "SUBMITTED" ? "Grade" : "Review"}
                        <ArrowRight className="size-3" />
                      </Link>
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
