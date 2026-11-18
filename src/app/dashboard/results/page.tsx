import Link from "next/link";
import { ArrowRight, BarChart3, ClipboardCheck, Clock, RotateCcw, Trophy } from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { Badge, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { formatDate, pct, timeAgo } from "@/lib/utils";

export const metadata = { title: "My results" };

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant();
  const filter = sp.filter === "graded" ? "graded" : sp.filter === "pending" ? "pending" : "all";

  const attempts = await db.attempt.findMany({
    where: {
      studentId: ctx.user.id,
      tenantId: ctx.tenant.id,
      status: filter === "graded" ? "GRADED" : filter === "pending" ? "SUBMITTED" : { in: ["SUBMITTED", "GRADED"] },
    },
    include: {
      assessment: { include: { course: { select: { id: true, title: true } } } },
    },
    orderBy: [{ submittedAt: "desc" }, { startedAt: "desc" }],
  });

  const all = await db.attempt.findMany({
    where: {
      studentId: ctx.user.id,
      tenantId: ctx.tenant.id,
      status: { in: ["SUBMITTED", "GRADED"] },
    },
    include: { assessment: true },
  });

  const graded = all.filter((a) => a.status === "GRADED");
  const average = graded.length
    ? Math.round(graded.reduce((sum, a) => sum + pct(a.score, a.maxScore), 0) / graded.length)
    : 0;
  const best = graded.length
    ? Math.max(...graded.map((a) => pct(a.score, a.maxScore)))
    : 0;
  const passed = graded.filter((a) => pct(a.score, a.maxScore) >= (a.assessment.passScore ?? 50)).length;
  const pending = all.filter((a) => a.status === "SUBMITTED").length;

  return (
    <div>
      <PageHeader
        eyebrow="Progress"
        title="My results"
        subtitle="Every assessment you have submitted, with scores and feedback from your teachers."
        actions={
          <Link href="/dashboard/courses" className="btn-secondary btn-sm">
            <ClipboardCheck className="size-3.5" /> Browse courses
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Submitted" value={all.length} icon={<ClipboardCheck className="size-4" />} />
        <Stat label="Average score" value={`${average}%`} icon={<BarChart3 className="size-4" />} />
        <Stat label="Best result" value={`${best}%`} icon={<Trophy className="size-4" />} />
        <Stat label="Passed" value={`${passed} / ${graded.length}`} hint={`${pending} awaiting grading`} icon={<Clock className="size-4" />} />
      </div>

      <div className="mt-6 mb-4 flex flex-wrap gap-2">
        {[
          { key: "all", label: "All" },
          { key: "graded", label: "Graded" },
          { key: "pending", label: "Awaiting grading" },
        ].map((chip) => (
          <Link
            key={chip.key}
            href={chip.key === "all" ? "/dashboard/results" : `/dashboard/results?filter=${chip.key}`}
            className={
              filter === chip.key
                ? "rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
                : "chip hover:border-brand-300 hover:text-brand-700"
            }
          >
            {chip.label}
          </Link>
        ))}
      </div>

      {attempts.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title={filter === "all" ? "No results yet" : "Nothing in this filter"}
          description="Once you submit an assessment, your score and feedback appear here."
          action={
            <Link href="/dashboard/courses" className="btn-primary btn-sm">
              Find a course to start
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {attempts.map((attempt) => {
            const percent = pct(attempt.score ?? 0, attempt.maxScore);
            const isGraded = attempt.status === "GRADED";
            const passedThis = percent >= attempt.assessment.passScore;
            return (
              <div key={attempt.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <span
                  className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-xl text-sm font-bold ${
                    !isGraded
                      ? "bg-sky-50 text-sky-700"
                      : passedThis
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {isGraded ? `${percent}%` : "…"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{attempt.assessment.title}</h3>
                    <StatusBadge status={attempt.status} />
                    {isGraded && (
                      <Badge tone={passedThis ? "green" : "red"}>{passedThis ? "Passed" : "Not passed"}</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {attempt.assessment.course.title} · {attempt.assessment.type.toLowerCase()} ·{" "}
                    {attempt.submittedAt ? `submitted ${timeAgo(attempt.submittedAt)}` : formatDate(attempt.startedAt)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Score {attempt.score ?? 0} / {attempt.maxScore} · pass mark {attempt.assessment.passScore}%
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Link href={`/results/${attempt.id}`} className="btn-secondary btn-sm">
                    {isGraded ? "View feedback" : "View answers"}
                  </Link>
                  <Link href={`/quiz/${attempt.assessmentId}`} className="btn-ghost btn-sm">
                    <RotateCcw className="size-3" /> Retake
                  </Link>
                  <ArrowRight className="hidden size-4 text-slate-300 sm:block" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
