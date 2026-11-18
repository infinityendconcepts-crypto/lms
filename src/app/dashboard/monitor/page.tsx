import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Eye,
  Handshake,
  Mail,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireTenant, ROLE_LABELS, type Role } from "@/lib/tenant";
import { addMonitorAction } from "@/lib/actions/people";
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInviteAction,
} from "@/lib/actions/tenant";
import {
  assignMonitorAction,
  assignMonitorToLearnerAction,
  unassignMonitorAction,
  updateMonitorAction,
} from "@/lib/actions/monitor";
import {
  MONITOR_TYPES,
  monitorTypeLabel,
  monitorTypeTone,
} from "@/lib/monitor";
import { getLearnerSnapshot } from "@/lib/monitor-data";
import { LearnerSnapshot } from "@/components/dashboard/LearnerSnapshot";
import { Avatar, Badge, EmptyState, PageHeader, PanelHeader, Stat, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { attendanceRate } from "@/lib/attendance";
import { sponsorshipLabel } from "@/lib/sponsorship";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Monitor · Nkanyezi LMS" };
export const dynamic = "force-dynamic";

const ROLE_TONE: Record<string, "brand" | "sky" | "green" | "amber" | "slate"> = {
  OWNER: "brand",
  ADMIN: "brand",
  TEACHER: "sky",
  MODERATOR: "amber",
  MONITOR: "green",
  STUDENT: "slate",
};

export default async function MonitorPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    learner?: string;
    error?: string;
    added?: string;
    assigned?: string;
    skipped?: string;
    saved?: string;
    unassigned?: string;
    invited?: string;
    removed?: string;
    detail?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("ADMIN");
  const tab = ["overview", "monitors", "learners", "users"].includes(sp.tab ?? "")
    ? (sp.tab as string)
    : "overview";
  const tabHref = (next: string, learner?: string) => {
    const params = new URLSearchParams({ tab: next });
    if (next === "learners" && learner) params.set("learner", learner);
    return `?${params.toString()}`;
  };

  const [memberships, invitations, attendance, profiles] = await Promise.all([
    db.membership.findMany({
      where: { tenantId: ctx.tenant.id },
      include: {
        user: true,
        monitorAssignments: {
          include: { learner: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.invitation.findMany({
      where: { tenantId: ctx.tenant.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    db.attendanceRecord.findMany({
      where: { session: { tenantId: ctx.tenant.id } },
      select: { studentId: true, status: true },
    }),
    db.studentProfile.findMany({
      where: { tenantId: ctx.tenant.id },
      select: {
        userId: true,
        studentNumber: true,
        sponsorshipType: true,
        sponsorshipProvider: true,
      },
    }),
  ]);

  const monitors = memberships.filter((membership) => membership.role === "MONITOR");
  const learners = memberships.filter((membership) => membership.role === "STUDENT");
  const assignments = monitors.flatMap((monitor) =>
    monitor.monitorAssignments.map((assignment) => ({ ...assignment, monitor }))
  );
  const profileByLearner = new Map(profiles.map((profile) => [profile.userId, profile]));
  const attendanceByLearner = new Map<string, { status: string }[]>();
  for (const record of attendance) {
    const list = attendanceByLearner.get(record.studentId) ?? [];
    list.push({ status: record.status });
    attendanceByLearner.set(record.studentId, list);
  }
  const monitorsByLearner = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const list = monitorsByLearner.get(assignment.learnerId) ?? [];
    list.push(assignment);
    monitorsByLearner.set(assignment.learnerId, list);
  }
  const monitoredLearnerIds = new Set(assignments.map((assignment) => assignment.learnerId));

  const selectedLearner = sp.learner
    ? learners.find((learner) => learner.userId === sp.learner) ?? null
    : null;
  const snapshot =
    selectedLearner && sp.learner
      ? await getLearnerSnapshot({ tenantId: ctx.tenant.id }, sp.learner)
      : null;

  const banner = sp.error
    ? { tone: "error" as const, message: sp.error }
    : sp.added
      ? {
          tone: "ok" as const,
          message: `Monitor added${sp.assigned ? ` with ${sp.assigned} learner assignment${sp.assigned === "1" ? "" : "s"}` : ""}. Temporary sign-in details are in the email outbox.`,
        }
      : sp.assigned
        ? {
            tone: "ok" as const,
            message: `${sp.assigned} learner assignment${sp.assigned === "1" ? "" : "s"} created${sp.skipped ? ` · ${sp.skipped} skipped` : ""}.`,
          }
        : sp.saved
          ? { tone: "ok" as const, message: "Monitor details updated." }
          : sp.unassigned
            ? { tone: "ok" as const, message: "Monitor assignment removed." }
            : sp.invited
              ? {
                  tone: "ok" as const,
                  message: `Invitation sent to ${sp.invited}. Check the email outbox for the join link.`,
                }
              : sp.removed
                ? { tone: "ok" as const, message: "Member removed from this workspace." }
                : null;

  return (
    <div>
      <PageHeader
        eyebrow={`${ctx.tenant.name} · oversight`}
        title="Monitor"
        subtitle="Give sponsors, companies and parents a read-only view of the learners they support, and manage every workspace user from one place."
        actions={
          <a href={tabHref("monitors")} className="btn-primary btn-sm">
            <UserPlus className="size-3.5" /> Add monitor
          </a>
        }
      />

      {banner && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            banner.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {banner.message}
          {sp.detail && <p className="mt-1 text-xs opacity-80">{sp.detail}</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Monitors" value={monitors.length} icon={<Eye className="size-4" />} />
        <Stat
          label="Sponsors / companies / parents"
          value={
            MONITOR_TYPES.map(
              (type) => monitors.filter((monitor) => monitor.monitorType === type).length
            ).join(" / ")
          }
          hint="In the order shown"
          icon={<Handshake className="size-4" />}
        />
        <Stat
          label="Monitored learners"
          value={monitoredLearnerIds.size}
          hint={`${assignments.length} active assignment${assignments.length === 1 ? "" : "s"}`}
          icon={<Users className="size-4" />}
        />
        <Stat label="Workspace users" value={memberships.length} icon={<UserCog className="size-4" />} />
      </div>

      <div className="mt-6">
        <Tabs
          current={tabHref(tab, tab === "learners" ? sp.learner : undefined)}
          items={[
            { href: tabHref("overview"), label: "Overview" },
            { href: tabHref("monitors"), label: "Monitors", count: monitors.length },
            { href: tabHref("learners"), label: "Learners", count: learners.length },
            { href: tabHref("users"), label: "Users", count: memberships.length },
          ]}
        />
      </div>

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <section className="card-pad">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <ShieldCheck className="size-4 text-brand-600" /> How monitoring works
            </h2>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-slate-600">
              <li>
                <b className="text-slate-800">Sponsors, companies and parents</b> are workspace users with the
                Monitor role. They sign in with their own account and see only the learners assigned to them.
              </li>
              <li>
                <b className="text-slate-800">Assignments are explicit.</b> A learner is never visible to a monitor
                until an owner or admin links them from the Monitors or Learners tab.
              </li>
              <li>
                <b className="text-slate-800">The snapshot is read-only.</b> It includes the learner profile,
                sponsorship, attendance, course progress and graded results — no editing or workspace settings.
              </li>
              <li>
                <b className="text-slate-800">The Users tab manages everyone.</b> Owners and admins can invite,
                reassign roles and remove any workspace member, including monitors.
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <a href={tabHref("monitors")} className="btn-secondary btn-sm">
                <Eye className="size-3.5" /> Manage monitors
              </a>
              <a href={tabHref("users")} className="btn-secondary btn-sm">
                <Users className="size-3.5" /> Manage users
              </a>
            </div>
          </section>

          <section className="card overflow-hidden">
            <PanelHeader
              icon={<CheckCircle2 className="size-4" />}
              title="Recent assignments"
              description="The latest monitor-to-learner links in this workspace."
            />
            {assignments.length === 0 ? (
              <p className="p-5 text-xs text-slate-500">No monitor assignments yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {assignments.slice(0, 8).map((assignment) => (
                  <div key={assignment.id} className="px-5 py-3">
                    <p className="text-xs font-semibold text-slate-800">
                      {assignment.monitor.user.name} → {assignment.learner.name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {monitorTypeLabel(assignment.monitor.monitorType)} · {formatDate(assignment.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "monitors" && (
        <div className="space-y-5">
          <section className="card overflow-hidden">
            <PanelHeader
              icon={<UserPlus className="size-4" />}
              title="Add a monitor"
              description="Create a sponsor, company or parent account and choose which learners they may view."
            />
            <form
              action={addMonitorAction}
              className="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1fr_1fr_auto] lg:items-end"
            >
              <input type="hidden" name="returnTo" value="/dashboard/monitor" />
              <input type="hidden" name="tab" value="monitors" />
              <div>
                <label className="label" htmlFor="monitor-add-name">Full name</label>
                <input id="monitor-add-name" name="name" required placeholder="Thandi Ndlovu" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="monitor-add-email">Email address</label>
                <input id="monitor-add-email" name="email" type="email" required placeholder="parent@school.edu" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="monitor-add-type">Type</label>
                <select id="monitor-add-type" name="monitorType" defaultValue="SPONSOR" className="select">
                  {MONITOR_TYPES.map((type) => (
                    <option key={type} value={type}>{monitorTypeLabel(type)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="monitor-add-org">Organization (optional)</label>
                <input id="monitor-add-org" name="monitorOrganization" placeholder="Future Leaders Fund" className="input" />
              </div>
              <SubmitButton pendingText="Adding…">
                <CheckCircle2 className="size-3.5" /> Add monitor
              </SubmitButton>
              <div className="md:col-span-2 lg:col-span-5">
                <label className="label" htmlFor="monitor-add-learners">Assign learners (optional)</label>
                <select id="monitor-add-learners" name="learnerIds" multiple size={4} className="select !h-auto !py-2">
                  {learners.map((learner) => (
                    <option key={learner.userId} value={learner.userId}>
                      {learner.user.name} · {learner.user.email}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-slate-400">
                  Hold Cmd/Ctrl to select several learners. You can assign more later from each monitor card.
                </p>
              </div>
            </form>
            <p className="px-5 pb-4 text-[10px] leading-4 text-slate-400">
              New monitors receive a temporary password in the email outbox. Existing accounts are linked to this
              workspace without changing their password.
            </p>
          </section>

          {monitors.length === 0 ? (
            <EmptyState
              icon={<Eye className="size-5 text-brand-600" />}
              title="No monitors yet"
              description="Add a sponsor, company or parent above, then assign the learners they should see."
            />
          ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              {monitors.map((monitor) => {
                const assigned = monitor.monitorAssignments;
                return (
                  <section key={monitor.id} className="card overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar name={monitor.user.name} src={monitor.user.avatarUrl} size="md" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{monitor.user.name}</p>
                          <p className="truncate text-[11px] text-slate-500">{monitor.user.email}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <Badge tone={monitorTypeTone(monitor.monitorType)}>
                              {monitorTypeLabel(monitor.monitorType)}
                            </Badge>
                            {monitor.monitorOrganization && (
                              <span className="text-[10px] text-slate-400">
                                <Building2 className="mr-1 inline size-3" />
                                {monitor.monitorOrganization}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <form action={removeMemberAction}>
                        <input type="hidden" name="membershipId" value={monitor.id} />
                        <input type="hidden" name="returnTo" value="/dashboard/monitor?tab=monitors" />
                        <SubmitButton
                          variant="ghost"
                          className="btn-sm text-rose-600"
                          confirm={`Remove ${monitor.user.name} from this workspace?`}
                        >
                          <Trash2 className="size-3" /> Remove
                        </SubmitButton>
                      </form>
                    </div>

                    <form action={updateMonitorAction} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_1.3fr_auto] sm:items-end">
                      <input type="hidden" name="membershipId" value={monitor.id} />
                      <input type="hidden" name="tab" value="monitors" />
                      <div>
                        <label className="label" htmlFor={`type-${monitor.id}`}>Type</label>
                        <select id={`type-${monitor.id}`} name="monitorType" defaultValue={monitor.monitorType ?? "SPONSOR"} className="select !py-2 text-xs">
                          {MONITOR_TYPES.map((type) => (
                            <option key={type} value={type}>{monitorTypeLabel(type)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label" htmlFor={`org-${monitor.id}`}>Organization</label>
                        <input id={`org-${monitor.id}`} name="monitorOrganization" defaultValue={monitor.monitorOrganization ?? ""} className="input !py-2 text-xs" />
                      </div>
                      <SubmitButton variant="secondary" className="btn-sm" pendingText="Saving…">
                        Save
                      </SubmitButton>
                    </form>

                    <div className="border-t border-slate-100 px-5 py-4">
                      <p className="mb-2 text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                        Can view ({assigned.length})
                      </p>
                      {assigned.length === 0 ? (
                        <p className="text-xs text-slate-500">No learners assigned yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {assigned.map((assignment) => (
                            <div key={assignment.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-slate-700">{assignment.learner.name}</p>
                                <p className="truncate text-[10px] text-slate-400">{assignment.learner.email}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Link href={`/dashboard/monitor?tab=learners&learner=${assignment.learnerId}`} className="btn-ghost btn-sm px-2">
                                  <Eye className="size-3" />
                                </Link>
                                <form action={unassignMonitorAction}>
                                  <input type="hidden" name="assignmentId" value={assignment.id} />
                                  <input type="hidden" name="tab" value="monitors" />
                                  <SubmitButton
                                    variant="ghost"
                                    className="btn-sm px-2 text-rose-600"
                                    confirm={`Stop ${monitor.user.name} from viewing ${assignment.learner.name}?`}
                                  >
                                    <Trash2 className="size-3" />
                                  </SubmitButton>
                                </form>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <form action={assignMonitorAction} className="mt-4 space-y-2">
                        <input type="hidden" name="membershipId" value={monitor.id} />
                        <input type="hidden" name="tab" value="monitors" />
                        <label className="label" htmlFor={`assign-${monitor.id}`}>Add learner access</label>
                        <select id={`assign-${monitor.id}`} name="learnerIds" multiple size={3} className="select !h-auto !py-2 text-xs">
                          {learners.map((learner) => (
                            <option key={learner.userId} value={learner.userId}>
                              {learner.user.name} · {learner.user.email}
                            </option>
                          ))}
                        </select>
                        <SubmitButton variant="secondary" className="btn-sm" pendingText="Assigning…">
                          <Users className="size-3.5" /> Assign selected learners
                        </SubmitButton>
                      </form>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "learners" && (
        <div className="space-y-5">
          {snapshot && selectedLearner && (
            <section>
              <Link href={tabHref("learners")} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
                <ArrowLeft className="size-3.5" /> All learners
              </Link>
              <LearnerSnapshot snapshot={snapshot} />
            </section>
          )}

          <section className="card overflow-hidden">
            <PanelHeader
              icon={<Users className="size-4" />}
              title="Learner oversight"
              description="Open a read-only snapshot or link a monitor to a learner."
            />
            {learners.length === 0 ? (
              <p className="p-5 text-xs text-slate-500">No learners in this workspace yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Learner</th>
                      <th>Sponsorship</th>
                      <th>Attendance</th>
                      <th>Monitors</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {learners.map((learner) => {
                      const profile = profileByLearner.get(learner.userId);
                      const records = attendanceByLearner.get(learner.userId) ?? [];
                      const linked = monitorsByLearner.get(learner.userId) ?? [];
                      return (
                        <tr key={learner.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <Avatar name={learner.user.name} src={learner.user.avatarUrl} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-slate-800">{learner.user.name}</p>
                                <p className="truncate text-[10px] text-slate-400">
                                  {profile?.studentNumber || learner.user.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td>
                            <p className="text-xs text-slate-700">{sponsorshipLabel(profile?.sponsorshipType)}</p>
                            {profile?.sponsorshipProvider && (
                              <p className="truncate text-[10px] text-slate-400">{profile.sponsorshipProvider}</p>
                            )}
                          </td>
                          <td>
                            <span className="text-xs font-semibold text-slate-700">
                              {records.length ? `${attendanceRate(records)}%` : "—"}
                            </span>
                          </td>
                          <td>
                            {linked.length === 0 ? (
                              <Badge tone="slate">None</Badge>
                            ) : (
                              <div className="flex max-w-xs flex-wrap gap-1">
                                {linked.map((assignment) => (
                                  <Badge key={assignment.id} tone={monitorTypeTone(assignment.monitor.monitorType)}>
                                    {assignment.monitor.user.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>
                            <Link href={tabHref("learners", learner.userId)} className="btn-secondary btn-sm">
                              <Eye className="size-3.5" /> Snapshot
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {monitors.length > 0 && learners.length > 0 && (
            <section className="card-pad">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <ShieldCheck className="size-4 text-brand-600" /> Link a monitor to a learner
              </h2>
              <form action={assignMonitorToLearnerAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.6fr_auto] sm:items-end">
                <input type="hidden" name="tab" value="learners" />
                <div>
                  <label className="label" htmlFor="link-learner">Learner</label>
                  <select id="link-learner" name="learnerId" required className="select">
                    <option value="">Choose a learner</option>
                    {learners.map((learner) => (
                      <option key={learner.userId} value={learner.userId}>{learner.user.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="link-monitors">Monitors</label>
                  <select id="link-monitors" name="monitorIds" multiple size={3} className="select !h-auto !py-2">
                    {monitors.map((monitor) => (
                      <option key={monitor.id} value={monitor.id}>
                        {monitor.user.name} · {monitorTypeLabel(monitor.monitorType)}
                      </option>
                    ))}
                  </select>
                </div>
                <SubmitButton pendingText="Linking…">
                  <Users className="size-3.5" /> Link access
                </SubmitButton>
              </form>
            </section>
          )}
        </div>
      )}

      {tab === "users" && (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <section className="table-wrap">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-3">
              <h2 className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <UserCog className="size-3.5 text-slate-400" /> All workspace users ({memberships.length})
              </h2>
              <span className="text-[10px] text-slate-400">Owners and your own account are protected</span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Monitor details</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {memberships.map((membership) => {
                  const protectedRow =
                    membership.role === "OWNER" || membership.userId === ctx.user.id;
                  return (
                    <tr key={membership.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <Avatar name={membership.user.name} src={membership.user.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-800">
                              {membership.user.name}
                              {membership.userId === ctx.user.id && (
                                <span className="ml-1 font-normal text-slate-400">(you)</span>
                              )}
                            </p>
                            <p className="truncate text-[10px] text-slate-400">{membership.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        {protectedRow ? (
                          <Badge tone={ROLE_TONE[membership.role] ?? "slate"}>
                            {ROLE_LABELS[membership.role as Role] ?? membership.role}
                          </Badge>
                        ) : (
                          <form action={changeRoleAction} className="flex items-center gap-1">
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <input type="hidden" name="returnTo" value="/dashboard/monitor?tab=users" />
                            <select name="role" defaultValue={membership.role} className="select !w-28 !px-2 !py-1 text-[11px]">
                              {(["ADMIN", "TEACHER", "MODERATOR", "MONITOR", "STUDENT"] as Role[]).map((role) => (
                                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                              ))}
                            </select>
                            <SubmitButton variant="ghost" className="btn-sm px-2">Save</SubmitButton>
                          </form>
                        )}
                      </td>
                      <td>
                        {membership.role === "MONITOR" ? (
                          <Badge tone="green">{monitorTypeLabel(membership.monitorType)}</Badge>
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-[11px] text-slate-500">
                        {formatDate(membership.createdAt)}
                      </td>
                      <td className="text-right">
                        {!protectedRow && (
                          <form action={removeMemberAction}>
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <input type="hidden" name="returnTo" value="/dashboard/monitor?tab=users" />
                            <SubmitButton
                              variant="ghost"
                              className="btn-sm text-rose-600"
                              confirm={`Remove ${membership.user.name} from this workspace?`}
                            >
                              <Trash2 className="size-3" /> Remove
                            </SubmitButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <div className="space-y-5">
            <section className="card-pad">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <UserPlus className="size-4 text-brand-600" /> Invite any user
              </h2>
              <form action={inviteMemberAction} className="mt-4 space-y-3">
                <input type="hidden" name="returnTo" value="/dashboard/monitor?tab=users" />
                <div>
                  <label className="label" htmlFor="monitor-user-invite-email">Email address</label>
                  <input id="monitor-user-invite-email" name="email" type="email" required placeholder="colleague@school.edu" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="monitor-user-invite-role">Role</label>
                  <select id="monitor-user-invite-role" name="role" defaultValue="MONITOR" className="select">
                    {(["MONITOR", "ADMIN", "TEACHER", "MODERATOR", "STUDENT"] as Role[]).map((role) => (
                      <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label" htmlFor="monitor-user-invite-type">Monitor type</label>
                    <select id="monitor-user-invite-type" name="monitorType" defaultValue="SPONSOR" className="select">
                      {MONITOR_TYPES.map((type) => (
                        <option key={type} value={type}>{monitorTypeLabel(type)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="monitor-user-invite-org">Organization</label>
                    <input id="monitor-user-invite-org" name="monitorOrganization" className="input" />
                  </div>
                </div>
                <p className="text-[10px] leading-4 text-slate-400">
                  Monitor type and organization apply only when the Monitor role is selected. Invites expire in 7 days.
                </p>
                <SubmitButton className="w-full" pendingText="Sending…">
                  <Mail className="size-3.5" /> Send invitation
                </SubmitButton>
              </form>
            </section>

            <section className="card-pad">
              <h2 className="text-sm font-bold text-slate-900">Pending invitations</h2>
              {invitations.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-400">No pending invitations.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {invitations.map((invite) => (
                    <li key={invite.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">{invite.email}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {ROLE_LABELS[invite.role as Role] ?? invite.role} · expires {formatDate(invite.expiresAt)}
                        </p>
                      </div>
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="invitationId" value={invite.id} />
                        <input type="hidden" name="returnTo" value="/dashboard/monitor?tab=users" />
                        <SubmitButton
                          variant="ghost"
                          className="btn-sm text-rose-600"
                          confirm={`Revoke the invitation for ${invite.email}?`}
                        >
                          Revoke
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {sp.error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {sp.error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
