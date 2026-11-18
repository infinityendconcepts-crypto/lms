import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  FileText,
  ListChecks,
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
import { Avatar, Badge, PageHeader, PanelHeader, Stat, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { SelectAllCheckbox } from "@/components/SelectAllCheckbox";
import {
  addStaffAction,
  batchInviteStaffAction,
  bulkStaffAction,
  importStaffAction,
} from "@/lib/actions/people";
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
    added?: string;
    invites?: string;
    affected?: string;
    skipped?: string;
    detail?: string;
    error?: string;
    tab?: string;
  }>;
}) {
  const sp = await searchParams;
  const activeTab = sp.tab === "invite" || sp.tab === "import" ? sp.tab : "add";
  const tabHref = (tab: string) => {
    const params = new URLSearchParams({ tab });
    return `?${params.toString()}`;
  };
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
    : sp.invites
      ? {
          tone: "ok" as const,
          message: `${sp.invites} staff ${sp.invites === "1" ? "invitation" : "invitations"} sent${sp.skipped ? ` · ${sp.skipped} skipped` : ""}. Check the email outbox for join links.`,
        }
      : sp.added
      ? {
          tone: "ok" as const,
          message: `${sp.added} staff ${sp.added === "1" ? "account" : "accounts"} added. Temporary passwords were written to the email outbox.`,
        }
      : sp.affected
        ? {
            tone: "ok" as const,
            message: `${sp.affected} staff ${sp.affected === "1" ? "member" : "members"} updated${sp.skipped ? ` · ${sp.skipped} skipped` : ""}.`,
          }
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
            {admin && (
              <>
                <a href={tabHref("add")} className="btn-primary btn-sm">
                  <UserPlus className="size-3.5" /> Add staff
                </a>
                <a href={tabHref("invite")} className="btn-secondary btn-sm">
                  <Mail className="size-3.5" /> Batch invite
                </a>
                <a href={tabHref("import")} className="btn-secondary btn-sm">
                  <FileText className="size-3.5" /> Import CSV
                </a>
              </>
            )}
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
          {sp.detail && <p className="mt-1 text-xs opacity-80">{sp.detail}</p>}
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

      {admin && (
        <div className="mt-6">
          <Tabs
            items={[
              { href: tabHref("add"), label: "Add staff" },
              { href: tabHref("invite"), label: "Batch invite" },
              { href: tabHref("import"), label: "Import CSV" },
            ]}
            current={tabHref(activeTab)}
          />
          <div className="card overflow-hidden">
            {activeTab === "add" && (
              <>
                <PanelHeader
                  icon={<UserPlus className="size-4" />}
                  title="Add staff directly"
                  description="Create the account now and link it to this workspace."
                />
                <form
                  action={addStaffAction}
                  className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1.3fr_1fr_auto] lg:items-end"
                >
                  <input type="hidden" name="returnTo" value="/dashboard/staff" />
                  <input type="hidden" name="tab" value="add" />
                  <div>
                    <label className="label" htmlFor="staff-add-name">Full name</label>
                    <input id="staff-add-name" name="name" required placeholder="Amina Patel" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="staff-add-email">Email address</label>
                    <input id="staff-add-email" name="email" type="email" required placeholder="amina@school.edu" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="staff-add-role">Role</label>
                    <select id="staff-add-role" name="role" defaultValue="MODERATOR" className="select">
                      <option value="MODERATOR">Moderator</option>
                      <option value="TEACHER">Teacher</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <SubmitButton pendingText="Adding…">
                    <CheckCircle2 className="size-3.5" /> Add staff
                  </SubmitButton>
                </form>
                <p className="px-5 pb-4 text-[10px] leading-4 text-slate-400">
                  New people receive a temporary password in the email outbox. Existing Nkanyezi accounts are linked
                  to this workspace without changing their password.
                </p>
              </>
            )}

            {activeTab === "invite" && (
              <>
                <PanelHeader
                  icon={<Mail className="size-4" />}
                  title="Batch invite staff"
                  description="Send 7-day join links to one or several colleagues."
                />
                <form action={batchInviteStaffAction} className="grid gap-4 p-5 md:grid-cols-2">
                  <input type="hidden" name="returnTo" value="/dashboard/staff" />
                  <input type="hidden" name="tab" value="invite" />
                  <div>
                    <label className="label" htmlFor="staff-invite-file">CSV file (optional)</label>
                    <input id="staff-invite-file" name="file" type="file" accept=".csv,text/csv" className="input !py-2" />
                  </div>
                  <div>
                    <label className="label" htmlFor="staff-invite-role">Role for these invitations</label>
                    <select id="staff-invite-role" name="role" defaultValue="MODERATOR" className="select">
                      <option value="MODERATOR">Moderator</option>
                      <option value="TEACHER">Teacher</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="label" htmlFor="staff-invite-emails">Or paste emails</label>
                    <textarea
                      id="staff-invite-emails"
                      name="csv"
                      rows={5}
                      placeholder={"colleague1@school.edu\ncolleague2@school.edu"}
                      className="textarea"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                    <SubmitButton pendingText="Sending…">
                      <Mail className="size-3.5" /> Send invites
                    </SubmitButton>
                    <a
                      href="/templates/staff-people-template.csv"
                      download
                      className="text-[11px] font-semibold text-brand-600 hover:underline"
                    >
                      Download template
                    </a>
                  </div>
                </form>
                <p className="px-5 pb-4 text-[10px] leading-4 text-slate-400">
                  Upload the template or paste one email per line. Existing members are skipped; pending invites are
                  replaced. Inviting one person works here too.
                </p>
              </>
            )}

            {activeTab === "import" && (
              <>
                <PanelHeader
                  icon={<FileText className="size-4" />}
                  title="Import staff from CSV"
                  description="Create several staff accounts at once from a spreadsheet."
                />
                <form action={importStaffAction} className="grid gap-4 p-5 md:grid-cols-2">
                  <input type="hidden" name="returnTo" value="/dashboard/staff" />
                  <input type="hidden" name="tab" value="import" />
                  <div>
                    <label className="label" htmlFor="staff-csv-file">CSV file</label>
                    <input id="staff-csv-file" name="file" type="file" accept=".csv,text/csv" className="input !py-2" />
                  </div>
                  <div>
                    <label className="label" htmlFor="staff-csv-role">Default role when the CSV has no role column</label>
                    <select id="staff-csv-role" name="role" defaultValue="MODERATOR" className="select">
                      <option value="MODERATOR">Moderator</option>
                      <option value="TEACHER">Teacher</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="label" htmlFor="staff-csv-text">Or paste CSV</label>
                    <textarea
                      id="staff-csv-text"
                      name="csv"
                      rows={5}
                      placeholder={"name,email,role\nAmina Patel,amina@school.edu,TEACHER"}
                      className="textarea"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                    <SubmitButton pendingText="Importing…">
                      <FileText className="size-3.5" /> Import staff
                    </SubmitButton>
                    <a
                      href="/templates/staff-people-template.csv"
                      download
                      className="text-[11px] font-semibold text-brand-600 hover:underline"
                    >
                      Download template
                    </a>
                  </div>
                </form>
                <p className="px-5 pb-4 text-[10px] leading-4 text-slate-400">
                  Columns: <code>name</code>, <code>email</code>, <code>role</code>. Roles may be Moderator, Teacher or
                  Admin. Invalid and duplicate rows are skipped and reported.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {admin && staff.length > 0 && (
        <form id="staff-bulk-form" action={bulkStaffAction} className="card mb-4 mt-6 flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="returnTo" value="/dashboard/staff" />
          <SelectAllCheckbox scopeId="staff-list" />
          <div>
            <label className="label" htmlFor="staff-bulk-action">Batch action</label>
            <select id="staff-bulk-action" name="bulkAction" className="select !w-40">
              <option value="role">Change role</option>
              <option value="remove">Remove from workspace</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="staff-bulk-role">New role</label>
            <select id="staff-bulk-role" name="role" className="select !w-36" defaultValue="MODERATOR">
              <option value="MODERATOR">Moderator</option>
              <option value="TEACHER">Teacher</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <SubmitButton
            variant="secondary"
            confirm="Apply this batch action to the selected staff members?"
          >
            <ListChecks className="size-3.5" /> Apply to selected
          </SubmitButton>
          <p className="w-full text-[10px] text-slate-400">
            Select people in the table below. Owners and your own account are protected.
          </p>
        </form>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="table-wrap" id="staff-list">
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
                <th className="w-8">{admin && <span className="sr-only">Select</span>}</th>
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
                      {admin && !protectedRow && (
                        <input
                          type="checkbox"
                          form="staff-bulk-form"
                          name="memberIds"
                          value={membership.id}
                          data-person-id={membership.id}
                          aria-label={`Select ${membership.user.name}`}
                          className="size-3.5"
                        />
                      )}
                    </td>
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
