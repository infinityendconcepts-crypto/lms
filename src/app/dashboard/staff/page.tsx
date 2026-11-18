import Link from "next/link";
import {
  Clock3,
  Mail,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { canAdmin, requireTenant, ROLE_LABELS, type Role } from "@/lib/tenant";
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInviteAction,
} from "@/lib/actions/tenant";
import { Avatar, Badge, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

const STAFF_ROLES: Role[] = ["OWNER", "ADMIN", "TEACHER", "MODERATOR"];
const ROLE_ORDER: Record<string, number> = { OWNER: 0, ADMIN: 1, TEACHER: 2, MODERATOR: 3 };
const ROLE_TONE: Record<string, "brand" | "sky" | "green" | "amber"> = {
  OWNER: "brand",
  ADMIN: "sky",
  TEACHER: "green",
  MODERATOR: "amber",
};

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    invited?: string;
    removed?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("MODERATOR");
  const admin = canAdmin(ctx.role);

  const [memberships, invitations] = await Promise.all([
    db.membership.findMany({
      where: { tenantId: ctx.tenant.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    db.invitation.findMany({
      where: { tenantId: ctx.tenant.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const staff = memberships
    .filter((m) => STAFF_ROLES.includes(m.role as Role))
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
  const pendingStaff = invitations.filter((i) => STAFF_ROLES.includes(i.role as Role));

  const banner = sp.error
    ? { tone: "error" as const, message: sp.error }
    : sp.invited
      ? { tone: "ok" as const, message: `Invitation sent to ${sp.invited}. Check the email outbox for the join link.` }
      : sp.removed
        ? { tone: "ok" as const, message: "Staff member removed from this workspace." }
        : sp.saved
          ? { tone: "ok" as const, message: "Role updated." }
          : null;

  return (
    <div>
      <PageHeader
        eyebrow={`${ctx.tenant.name} · people`}
        title="Staff"
        subtitle="Everyone who can teach, grade or moderate in this workspace, and what they can do."
        actions={
          <>
            <Link href="/dashboard/moderation" className="btn-secondary btn-sm">
              <ShieldCheck className="size-3.5" /> Moderation
            </Link>
            <Link href="/dashboard/settings?tab=members" className="btn-secondary btn-sm">
              <Users className="size-3.5" /> All members
            </Link>
          </>
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
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Staff members" value={staff.length} icon={<UserCog className="size-4" />} />
        <Stat
          label="Owners & admins"
          value={staff.filter((m) => ["OWNER", "ADMIN"].includes(m.role)).length}
          icon={<ShieldCheck className="size-4" />}
        />
        <Stat
          label="Teachers"
          value={staff.filter((m) => m.role === "TEACHER").length}
          icon={<Users className="size-4" />}
        />
        <Stat
          label="Moderators"
          value={staff.filter((m) => m.role === "MODERATOR").length}
          icon={<Mail className="size-4" />}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="table-wrap">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-3">
            <h2 className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <UserCog className="size-3.5 text-slate-400" /> Staff directory ({staff.length})
            </h2>
            <span className="text-[10px] text-slate-400">
              {admin ? "Owners and your own role are protected" : "View only"}
            </span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((membership) => {
                const protectedRow =
                  membership.role === "OWNER" || membership.userId === ctx.user.id;
                return (
                  <tr key={membership.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={membership.user.name}
                          src={membership.user.avatarUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">
                            {membership.user.name}
                            {membership.userId === ctx.user.id && (
                              <span className="ml-1 font-normal text-slate-400">(you)</span>
                            )}
                          </p>
                          <p className="truncate text-[10px] text-slate-400">
                            {membership.user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      {admin && !protectedRow ? (
                        <form action={changeRoleAction} className="flex items-center gap-1">
                          <input type="hidden" name="membershipId" value={membership.id} />
                          <input type="hidden" name="returnTo" value="/dashboard/staff" />
                          <select
                            name="role"
                            defaultValue={membership.role}
                            className="select !w-28 !px-2 !py-1 text-[11px]"
                          >
                            <option value="MODERATOR">Moderator</option>
                            <option value="TEACHER">Teacher</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                          <SubmitButton variant="ghost" className="btn-sm px-2">
                            Save
                          </SubmitButton>
                        </form>
                      ) : (
                        <Badge tone={ROLE_TONE[membership.role] ?? "slate"}>
                          {ROLE_LABELS[membership.role as Role]}
                        </Badge>
                      )}
                    </td>
                    <td className="text-[11px] text-slate-500">
                      {formatDate(membership.createdAt)}
                    </td>
                    <td className="text-right">
                      {admin && !protectedRow && (
                        <form action={removeMemberAction}>
                          <input type="hidden" name="membershipId" value={membership.id} />
                          <input type="hidden" name="returnTo" value="/dashboard/staff" />
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
        </div>

        <div className="space-y-5">
          {admin && (
            <section className="card-pad">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <UserPlus className="size-4 text-brand-600" /> Invite staff
              </h2>
              <form action={inviteMemberAction} className="mt-3 space-y-3">
                <input type="hidden" name="returnTo" value="/dashboard/staff" />
                <div>
                  <label className="label" htmlFor="staff-email">
                    Email address
                  </label>
                  <input
                    id="staff-email"
                    name="email"
                    type="email"
                    required
                    placeholder="colleague@school.edu"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="staff-role">
                    Role
                  </label>
                  <select id="staff-role" name="role" className="select" defaultValue="MODERATOR">
                    <option value="MODERATOR">Moderator — review submitted work</option>
                    <option value="TEACHER">Teacher — build courses and grade</option>
                    <option value="ADMIN">Admin — manage the workspace</option>
                  </select>
                </div>
                <SubmitButton className="w-full" pendingText="Sending…">
                  <UserPlus className="size-3.5" /> Send invitation
                </SubmitButton>
              </form>
              <p className="mt-2 text-[10px] leading-4 text-slate-400">
                Invites expire in 7 days. In development the join link is written to the email
                outbox. Staff invites do not use learner seats.
              </p>
            </section>
          )}

          <section className="card-pad">
            <h2 className="text-sm font-bold text-slate-900">What each role can do</h2>
            <ul className="mt-3 space-y-2 text-[11px] leading-4 text-slate-600">
              <li>
                <b>Owner / Admin</b> — manage members, branding, plans and every course.
              </li>
              <li>
                <b>Teacher</b> — build courses, assessments, grade and moderate.
              </li>
              <li>
                <b>Moderator</b> — review and finalize submitted tasks and exam answers.
              </li>
            </ul>
            <Link href="/dashboard/moderation" className="btn-secondary btn-sm mt-4 w-full">
              <ShieldCheck className="size-3.5" /> Open moderation queue
            </Link>
          </section>

          <section className="card-pad">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Clock3 className="size-4 text-slate-400" /> Pending staff invites
            </h2>
            {pendingStaff.length === 0 ? (
              <p className="mt-2 text-[11px] text-slate-400">No pending staff invitations.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {pendingStaff.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {invite.email}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {ROLE_LABELS[invite.role as Role] ?? invite.role} · expires{" "}
                        {formatDate(invite.expiresAt)}
                      </p>
                    </div>
                    {admin && (
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="invitationId" value={invite.id} />
                        <input type="hidden" name="returnTo" value="/dashboard/staff" />
                        <SubmitButton
                          variant="ghost"
                          className="btn-sm text-rose-600"
                          confirm={`Revoke the invitation for ${invite.email}?`}
                        >
                          Revoke
                        </SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
