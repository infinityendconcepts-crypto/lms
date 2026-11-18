import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarCheck, ClipboardCheck, Eye, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireMonitor } from "@/lib/tenant";
import { getLearnerSnapshot } from "@/lib/monitor-data";
import { LearnerSnapshot } from "@/components/dashboard/LearnerSnapshot";
import { Avatar, Badge, EmptyState, PageHeader, PanelHeader, Stat } from "@/components/ui";
import { monitorTypeLabel } from "@/lib/monitor";
import { formatDate, nowMs } from "@/lib/utils";

export const metadata = { title: "Monitoring · Nkanyezi LMS" };
export const dynamic = "force-dynamic";

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ learner?: string; joined?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireMonitor();

  const assignments = await db.monitorAssignment.findMany({
    where: {
      tenantId: ctx.tenant.id,
      monitor: { userId: ctx.user.id, role: "MONITOR" },
    },
    include: {
      learner: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const learnerIds = [...new Set(assignments.map((assignment) => assignment.learnerId))];
  if (sp.learner && !learnerIds.includes(sp.learner)) {
    redirect("/dashboard/monitoring");
  }

  const snapshots = (
    await Promise.all(
      learnerIds.map((learnerId) => getLearnerSnapshot({ tenantId: ctx.tenant.id }, learnerId))
    )
  ).filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== null);

  const selected = sp.learner
    ? snapshots.find((snapshot) => snapshot.learner.id === sp.learner) ?? null
    : null;

  return (
    <div>
      <PageHeader
        eyebrow={`${ctx.tenant.name} · limited access`}
        title="My learners"
        subtitle={`Read-only oversight for ${ctx.user.name}. You can only see learners that an owner or admin has assigned to you.`}
        actions={
          <Badge tone="green">
            <ShieldCheck className="mr-1 size-3" /> {monitorTypeLabel(ctx.membership.monitorType)}
            {ctx.membership.monitorOrganization ? ` · ${ctx.membership.monitorOrganization}` : ""}
          </Badge>
        }
      />

      {sp.joined && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Your monitor account is ready. The learners assigned to you are listed below.
        </div>
      )}
      {sp.error && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {sp.error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Assigned learners" value={snapshots.length} icon={<Eye className="size-4" />} />
        <Stat
          label="Active enrolments"
          value={snapshots.reduce((sum, snapshot) => sum + snapshot.summary.courseCount, 0)}
          icon={<BookOpen className="size-4" />}
        />
        <Stat
          label="Graded results"
          value={snapshots.reduce((sum, snapshot) => sum + snapshot.summary.gradedCount, 0)}
          icon={<ClipboardCheck className="size-4" />}
        />
      </div>

      {selected && (
        <section className="mt-6">
          <Link
            href="/dashboard/monitoring"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="size-3.5" /> All assigned learners
          </Link>
          <LearnerSnapshot snapshot={selected} />
        </section>
      )}

      <section className="card mt-6 overflow-hidden">
        <PanelHeader
          icon={<Eye className="size-4" />}
          title="Learners you monitor"
          description="Open a learner to view their profile, sponsorship, attendance, course progress and results."
        />
        {snapshots.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="size-5 text-brand-600" />}
            title="No learners assigned yet"
            description="Ask a workspace owner or admin to assign the learners you support. You will only ever see those learners."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Sponsorship</th>
                  <th>Attendance</th>
                  <th>Progress</th>
                  <th>Results</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snapshot) => (
                  <tr key={snapshot.learner.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={snapshot.learner.name} src={snapshot.learner.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800">{snapshot.learner.name}</p>
                          <p className="truncate text-[10px] text-slate-400">{snapshot.learner.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="text-xs text-slate-700">{snapshot.sponsorship.type}</p>
                      <p className="text-[10px] text-slate-400">{snapshot.sponsorship.status}</p>
                    </td>
                    <td>
                      <span className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                        <CalendarCheck className="size-3 text-slate-400" />
                        {snapshot.attendance.total ? `${snapshot.attendance.rate}%` : "—"}
                      </span>
                    </td>
                    <td className="text-xs text-slate-700">
                      {snapshot.summary.averageProgress === null
                        ? "—"
                        : `${snapshot.summary.averageProgress}%`}
                    </td>
                    <td className="text-xs text-slate-700">
                      {snapshot.summary.average === null
                        ? "—"
                        : `${snapshot.summary.average}% avg`}
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/monitoring?learner=${snapshot.learner.id}`}
                        className="btn-secondary btn-sm"
                      >
                        <Eye className="size-3.5" /> View snapshot
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-5 text-[10px] text-slate-400">
        Access is read-only. Monitoring assignments were last updated by a workspace owner or admin; learner records
        shown here are current as of {formatDate(new Date(nowMs()))}.
      </p>
    </div>
  );
}
