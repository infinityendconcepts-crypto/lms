import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  CreditCard,
  Inbox,
  KeyRound,
  Mail,
  Palette,
  ShieldCheck,
  Sparkles,
  Star,
  UserCog,
  Trash2,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { db } from "@/lib/db";
import { canAdmin, canTeach, requireTenant, ROLE_LABELS, type Role } from "@/lib/tenant";
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInviteAction,
  updateWorkspaceAction,
} from "@/lib/actions/tenant";
import {
  deleteAiProviderAction,
  setDefaultAiProviderAction,
  testAiProviderAction,
} from "@/lib/actions/ai";
import { providerLabel } from "@/lib/ai/catalog";
import { hasDedicatedAiSecret } from "@/lib/ai/crypto";
import { listEnvProviders } from "@/lib/ai/providers";
import { AiProviderForm } from "@/components/ai/AiProviderForm";
import { Avatar, Badge, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { WorkspaceLogo } from "@/components/WorkspaceLogo";
import { WorkspaceLogoUpload } from "@/components/WorkspaceLogoUpload";
import { getPlanState } from "@/lib/usage";
import { CURRENCIES, CURRENCY_LABELS, currencyFor } from "@/lib/plans";
import { formatDate, timeAgo } from "@/lib/utils";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    saved?: string;
    error?: string;
    invited?: string;
    removed?: string;
    tested?: string;
    providerRemoved?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant();
  const admin = canAdmin(ctx.role);
  const teacher = canTeach(ctx.role);
  const tab =
    sp.tab === "staff" || sp.tab === "members" || sp.tab === "inbox" || sp.tab === "ai"
      ? sp.tab
      : "workspace";
  if ((tab === "staff" || tab === "members" || tab === "inbox" || tab === "ai") && !admin) {
    // Students and teachers can still see the workspace tab.
    return (
      <div>
        <PageHeader title="Settings" subtitle="Your workspace and account details." />
        <div className="card-pad max-w-2xl">
          <h2 className="text-sm font-bold text-slate-900">{ctx.tenant.name}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {ctx.tenant.headline ?? ctx.tenant.about ?? "No workspace description yet."}
          </p>
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-slate-400">Your role</dt>
              <dd className="font-semibold text-slate-800">{ROLE_LABELS[ctx.role]}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Email</dt>
              <dd className="font-semibold text-slate-800">{ctx.user.email}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Workspace type</dt>
              <dd className="font-semibold text-slate-800">
                {ctx.tenant.kind === "TEACHER" ? "Independent teacher" : "School"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Website</dt>
              <dd className="font-semibold text-slate-800">{ctx.tenant.website ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-[11px] text-slate-500">
            Ask a workspace admin if you need changes to branding, members or billing.
          </p>
        </div>
      </div>
    );
  }

  const [memberships, invitations, outbox, planState, aiConfigs] = await Promise.all([
    db.membership.findMany({
      where: { tenantId: ctx.tenant.id },
      include: { user: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    db.invitation.findMany({
      where: { tenantId: ctx.tenant.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    admin
      ? db.emailMessage.findMany({
          where: { tenantId: ctx.tenant.id },
          orderBy: { createdAt: "desc" },
          take: 25,
        })
      : Promise.resolve([]),
    getPlanState(ctx.tenant.id),
    admin
      ? db.aiProviderConfig.findMany({
          where: { tenantId: ctx.tenant.id },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  const envProviders = admin ? listEnvProviders() : [];
  const configuredEnv = envProviders.filter((provider) => provider.configured);

  const courses = await db.course.findMany({
    where: { tenantId: ctx.tenant.id },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  const banner = sp.error
    ? { tone: "error" as const, message: sp.error }
    : sp.invited
      ? { tone: "ok" as const, message: `Invitation sent to ${sp.invited}. Check the email outbox for the join link.` }
      : sp.removed
        ? { tone: "ok" as const, message: "Member removed from this workspace." }
        : sp.tested
          ? { tone: "ok" as const, message: "Connection successful — the model replied. Run a benchmark to see its analysis." }
          : sp.providerRemoved
            ? { tone: "ok" as const, message: "AI model removed from this workspace." }
            : sp.saved
              ? { tone: "ok" as const, message: "Changes saved." }
              : null;

  return (
    <div>
      <PageHeader
        eyebrow={`${ctx.tenant.name} · ${ROLE_LABELS[ctx.role]}`}
        title="Settings"
        subtitle="Brand the workspace, manage people and inspect outbound email."
        actions={
          <Link href="/dashboard/billing" className="btn-secondary btn-sm">
            <CreditCard className="size-3.5" /> Billing
          </Link>
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

      <Tabs
        current={`/dashboard/settings${tab === "workspace" ? "" : `?tab=${tab}`}`}
        items={[
          { href: "/dashboard/settings", label: "Workspace" },
          ...(admin
            ? [
                {
                  href: "/dashboard/settings?tab=staff",
                  label: "Staff",
                  count: memberships.filter((m) =>
                    ["OWNER", "ADMIN", "TEACHER", "MODERATOR"].includes(m.role)
                  ).length,
                },
                {
                  href: "/dashboard/settings?tab=members",
                  label: "Members",
                  count: memberships.length,
                },
                {
                  href: "/dashboard/settings?tab=inbox",
                  label: "Email outbox",
                  count: outbox.length,
                },
                {
                  href: "/dashboard/settings?tab=ai",
                  label: "AI models",
                  count: aiConfigs.length,
                },
              ]
            : []),
        ]}
      />

      {tab === "workspace" && (
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <form action={updateWorkspaceAction} className="card-pad grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Building2 className="size-4 text-slate-400" /> Workspace identity
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">
                This is what learners see across the dashboard and sign-in pages.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ws-name">
                Workspace name
              </label>
              <input
                id="ws-name"
                name="name"
                defaultValue={ctx.tenant.name}
                required
                className="input"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ws-headline">
                Headline
              </label>
              <input
                id="ws-headline"
                name="headline"
                defaultValue={ctx.tenant.headline ?? ""}
                placeholder="Where curious minds do real mathematics."
                className="input"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ws-about">
                About
              </label>
              <textarea
                id="ws-about"
                name="about"
                defaultValue={ctx.tenant.about ?? ""}
                rows={4}
                placeholder="A short description of your school or studio."
                className="textarea"
              />
            </div>
            <div>
              <label className="label" htmlFor="ws-website">
                Website
              </label>
              <input
                id="ws-website"
                name="website"
                type="url"
                defaultValue={ctx.tenant.website ?? ""}
                placeholder="https://"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="ws-color">
                Brand colour
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="ws-color"
                  name="brandColor"
                  type="color"
                  defaultValue={ctx.tenant.brandColor}
                  className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                />
                <span className="font-mono text-xs text-slate-500">{ctx.tenant.brandColor}</span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ws-currency">
                Workspace currency
              </label>
              <select
                id="ws-currency"
                name="currency"
                defaultValue={currencyFor(ctx.tenant.currency)}
                className="select"
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code} · {CURRENCY_LABELS[code]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-400">
                Applied to plan prices, course budgets and expenses across this workspace.
              </p>
            </div>
            <div className="sm:col-span-2 flex items-center justify-between border-t border-slate-100 pt-4">
              <p className="text-[10px] text-slate-400">
                Upload a logo in the branding panel — it applies across the workspace immediately.
              </p>
              <SubmitButton pendingText="Saving…">Save workspace</SubmitButton>
            </div>
          </form>

          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-5 text-white">
              <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  background: `radial-gradient(circle at 85% 5%, ${ctx.tenant.brandColor}, transparent 50%)`,
                }}
              />
              <div className="relative">
                <div className="flex items-center gap-2.5">
                  <WorkspaceLogo
                    tenant={{
                      id: ctx.tenant.id,
                      name: ctx.tenant.name,
                      logoUrl: ctx.tenant.logoUrl,
                      brandColor: ctx.tenant.brandColor,
                      updatedAt: ctx.tenant.logoUpdatedAt?.toISOString() ?? null,
                    }}
                    className="border border-white/20"
                  />
                  <div>
                    <p className="text-sm font-bold">{ctx.tenant.name}</p>
                    <p className="text-[10px] text-slate-300">
                      {ctx.tenant.kind === "TEACHER" ? "Teacher workspace" : "School workspace"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-300">
                  {ctx.tenant.headline ?? "Add a headline to greet your learners."}
                </p>
              </div>
            </div>

            {admin && (
              <WorkspaceLogoUpload
                key={`logo-${ctx.tenant.id}-${ctx.tenant.logoUrl ?? "none"}-${ctx.tenant.logoUpdatedAt?.toISOString() ?? "v0"}`}
                tenant={{
                  id: ctx.tenant.id,
                  name: ctx.tenant.name,
                  logoUrl: ctx.tenant.logoUrl,
                  brandColor: ctx.tenant.brandColor,
                  updatedAt: ctx.tenant.logoUpdatedAt?.toISOString() ?? null,
                }}
              />
            )}

            <div className="card p-5">
              <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <Palette className="size-3.5 text-slate-400" /> Plan & usage
              </h3>
              <p className="mt-1 text-[11px] text-slate-500">
                {planState.plan.name} plan ·{" "}
                {planState.seatLimit === null
                  ? "unlimited learners"
                  : `${planState.usage.students}/${planState.seatLimit} seats`}
              </p>
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{
                      width: `${
                        planState.seatLimit === null
                          ? 8
                          : Math.min(100, Math.round((planState.usage.students / planState.seatLimit) * 100))
                      }%`,
                    }}
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-sm font-bold text-slate-900">{planState.usage.courses}</p>
                  <p className="text-[9px] uppercase text-slate-400">courses</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-sm font-bold text-slate-900">{planState.usage.assessments}</p>
                  <p className="text-[9px] uppercase text-slate-400">assessments</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-sm font-bold text-slate-900">{planState.usage.submissions}</p>
                  <p className="text-[9px] uppercase text-slate-400">submissions</p>
                </div>
              </div>
              <Link href="/dashboard/billing" className="btn-primary btn-sm mt-4 w-full">
                <CreditCard className="size-3.5" /> Manage plan
              </Link>
            </div>

            {teacher && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <ShieldCheck className="size-3.5 text-slate-400" /> Roles
                </h3>
                <ul className="mt-2 space-y-1.5 text-[11px] text-slate-600">
                  <li><b>Owner</b> — billing, branding, every course and member.</li>
                  <li><b>Admin</b> — manage members, courses and settings.</li>
                  <li><b>Teacher</b> — build courses, assessments and grade.</li>
                  <li><b>Moderator</b> — review and finalize submitted work.</li>
                  <li><b>Student</b> — learn and submit assessments.</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "staff" && admin && (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="table-wrap">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-3">
              <h2 className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <UserCog className="size-3.5 text-slate-400" /> Workspace staff
              </h2>
              <Link href="/dashboard/moderation" className="btn-secondary btn-sm">
                <ShieldCheck className="size-3.5" /> Open moderation
              </Link>
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
                {memberships
                  .filter((m) => ["OWNER", "ADMIN", "TEACHER", "MODERATOR"].includes(m.role))
                  .map((membership) => {
                    const protectedRow =
                      membership.role === "OWNER" || membership.userId === ctx.user.id;
                    return (
                      <tr key={membership.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <Avatar name={membership.user.name} src={membership.user.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-900">
                                {membership.user.name}
                              </p>
                              <p className="truncate text-[10px] text-slate-400">
                                {membership.user.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          {protectedRow ? (
                            <Badge tone="brand">{ROLE_LABELS[membership.role as Role]}</Badge>
                          ) : (
                            <form action={changeRoleAction} className="flex items-center gap-1">
                              <input type="hidden" name="membershipId" value={membership.id} />
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
                          )}
                        </td>
                        <td className="text-[11px] text-slate-500">{formatDate(membership.createdAt)}</td>
                        <td className="text-right">
                          {!protectedRow && (
                            <form action={removeMemberAction}>
                              <input type="hidden" name="membershipId" value={membership.id} />
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

          <div className="card-pad">
            <h2 className="text-sm font-bold text-slate-900">What staff can do</h2>
            <ul className="mt-3 space-y-2 text-[11px] text-slate-600">
              <li><b>Owner / Admin</b> — manage members, branding, plans and every course.</li>
              <li><b>Teacher</b> — build courses, assessments, grade and moderate.</li>
              <li><b>Moderator</b> — review and finalize submitted tasks and exam answers.</li>
            </ul>
            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-slate-500">
              Invite or change roles on the Members tab. Moderators appear in the moderation queue
              straight away.
            </p>
            <Link href="/dashboard/settings?tab=members" className="btn-secondary btn-sm mt-3 w-full">
              Manage all members
            </Link>
          </div>
        </div>
      )}

      {tab === "members" && admin && (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="table-wrap">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-3">
              <h2 className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <Users className="size-3.5 text-slate-400" /> Members ({memberships.length})
              </h2>
              <span className="text-[10px] text-slate-400">Owners are protected</span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {memberships.map((membership) => {
                  const protectedRow = membership.role === "OWNER" || membership.userId === ctx.user.id;
                  return (
                    <tr key={membership.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <Avatar name={membership.user.name} src={membership.user.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-900">
                              {membership.user.name}
                              {membership.userId === ctx.user.id && (
                                <span className="ml-1 text-[9px] font-normal text-slate-400">(you)</span>
                              )}
                            </p>
                            <p className="truncate text-[10px] text-slate-400">{membership.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        {protectedRow ? (
                          <Badge tone="brand">{ROLE_LABELS[membership.role as Role]}</Badge>
                        ) : (
                          <form action={changeRoleAction} className="flex items-center gap-1">
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <select
                              name="role"
                              defaultValue={membership.role}
                              className="select !w-28 !px-2 !py-1 text-[11px]"
                            >
                              <option value="STUDENT">Student</option>
                              <option value="MODERATOR">Moderator</option>
                              <option value="TEACHER">Teacher</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                            <SubmitButton variant="ghost" className="btn-sm px-2">
                              Save
                            </SubmitButton>
                          </form>
                        )}
                      </td>
                      <td>
                        <Badge tone={membership.status === "ACTIVE" ? "green" : "red"}>
                          {membership.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="text-[11px] text-slate-500">{formatDate(membership.createdAt)}</td>
                      <td className="text-right">
                        {!protectedRow && (
                          <form action={removeMemberAction}>
                            <input type="hidden" name="membershipId" value={membership.id} />
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

          <div className="space-y-4">
            <div className="card-pad">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <UserPlus className="size-4 text-slate-400" /> Invite someone
              </h2>
              <form action={inviteMemberAction} className="mt-3 space-y-3">
                <div>
                  <label className="label" htmlFor="member-email">
                    Email
                  </label>
                  <input
                    id="member-email"
                    name="email"
                    type="email"
                    required
                    placeholder="colleague@school.edu"
                    className="input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label" htmlFor="member-role">
                      Role
                    </label>
                    <select id="member-role" name="role" className="select">
                      <option value="STUDENT">Student</option>
                      <option value="MODERATOR">Moderator</option>
                      <option value="TEACHER">Teacher</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="member-course">
                      Course
                    </label>
                    <select id="member-course" name="courseId" className="select">
                      <option value="">None</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <SubmitButton className="w-full" pendingText="Sending…">
                  <Mail className="size-3.5" /> Send invitation
                </SubmitButton>
              </form>
              <p className="mt-2 text-[10px] leading-4 text-slate-400">
                Invites expire in 7 days. In development, the join link is written to the email outbox.
              </p>
            </div>

            <div className="card-pad">
              <h2 className="text-sm font-bold text-slate-900">Pending invites</h2>
              {invitations.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-400">No pending invitations.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {invitations.map((invitation) => (
                    <div key={invitation.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-slate-700">{invitation.email}</p>
                        <p className="text-[9px] text-slate-400">
                          {invitation.role.toLowerCase()} · expires {formatDate(invitation.expiresAt)}
                          {invitation.expiresAt < new Date() && " · expired"}
                        </p>
                      </div>
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="invitationId" value={invitation.id} />
                        <SubmitButton variant="ghost" className="btn-sm text-rose-600">
                          Revoke
                        </SubmitButton>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "inbox" && admin && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Inbox className="size-4 text-slate-400" /> Development email outbox
            </h2>
            <span className="text-[11px] text-slate-400">Most recent {outbox.length}</span>
          </div>
          {outbox.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Inbox className="size-5" />}
                title="No email yet"
                description="Invitations and password resets are recorded here in development."
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {outbox.map((message) => (
                <details key={message.id} className="group px-5 py-3">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
                    <Badge tone={message.kind === "INVITATION" ? "brand" : "slate"}>
                      {message.kind.toLowerCase()}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
                      {message.subject}
                    </span>
                    <span className="text-[10px] text-slate-400">to {message.to}</span>
                    <span className="text-[10px] text-slate-400">{timeAgo(message.createdAt)}</span>
                  </summary>
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-[11px] leading-5 whitespace-pre-wrap text-slate-100">
                    {message.body}
                  </pre>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "ai" && admin && (
        <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
          <div className="space-y-5">
            <AiProviderForm hasConfigs={aiConfigs.length > 0} />

            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Bot className="size-4 text-brand-600" /> Saved models ({aiConfigs.length})
                </h2>
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <ShieldCheck className="size-3" /> Keys encrypted at rest
                </span>
              </div>
              {aiConfigs.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={<Bot className="size-5" />}
                    title="No model saved yet"
                    description="Benchmarks already work with the local model. Add a hosted model above for richer explanations, or set a provider key in .env."
                  />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {aiConfigs.map((config) => (
                    <div key={config.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-xs font-bold text-slate-900">
                              {config.label?.trim() || providerLabel(config.provider)}
                            </p>
                            {config.isDefault && (
                              <Badge tone="brand">
                                <Star className="size-2.5" /> Default
                              </Badge>
                            )}
                            {!config.enabled && <Badge tone="slate">Disabled</Badge>}
                          </div>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {providerLabel(config.provider)} · {config.model}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[9px] text-slate-400">
                            {config.baseUrl ?? "No base URL"}
                          </p>
                        </div>
                        <div className="text-right text-[10px] text-slate-400">
                          <p className="font-mono">{config.apiKeyHint ?? "No saved key"}</p>
                          <p className="mt-0.5">
                            {config.lastCheckedAt
                              ? `Checked ${timeAgo(config.lastCheckedAt)}`
                              : "Not tested yet"}
                          </p>
                        </div>
                      </div>

                      {config.lastError && (
                        <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[10px] leading-4 text-rose-700">
                          {config.lastError}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <form action={testAiProviderAction}>
                          <input type="hidden" name="providerId" value={config.id} />
                          <SubmitButton
                            variant="secondary"
                            className="btn-sm"
                            pendingText="Testing…"
                          >
                            <Zap className="size-3" /> Test
                          </SubmitButton>
                        </form>
                        {!config.isDefault && (
                          <form action={setDefaultAiProviderAction}>
                            <input type="hidden" name="providerId" value={config.id} />
                            <SubmitButton variant="ghost" className="btn-sm">
                              <Star className="size-3" /> Make default
                            </SubmitButton>
                          </form>
                        )}
                        <form action={deleteAiProviderAction}>
                          <input type="hidden" name="providerId" value={config.id} />
                          <SubmitButton
                            variant="ghost"
                            className="btn-sm text-rose-600"
                            confirm="Remove this model? Saved benchmarks are kept."
                          >
                            <Trash2 className="size-3" /> Remove
                          </SubmitButton>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <ShieldCheck className="size-3.5 text-emerald-500" /> Privacy &amp; keys
              </h3>
              <ul className="mt-2.5 space-y-2 text-[11px] leading-5 text-slate-600">
                <li>
                  Keys are encrypted with AES-256-GCM before storage and never returned to the
                  browser. Only a masked hint is shown.
                </li>
                <li>
                  Hosted models receive a learner ID, first name, course titles and learning
                  signals. Email addresses and free-text notes are never sent.
                </li>
                <li>
                  The local model runs on your server with no key, no API call and no third-party
                  data sharing. It always works as a fallback.
                </li>
              </ul>
              {!hasDedicatedAiSecret() && (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
                  Set <code className="font-mono font-semibold">AI_SECRET</code> in your environment
                  before production so saved keys use a dedicated encryption secret. Locally,{" "}
                  <code className="font-mono font-semibold">AUTH_SECRET</code> is used as a fallback.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <KeyRound className="size-3.5 text-slate-400" /> Environment keys
                </h3>
                <Badge tone={configuredEnv.length > 0 ? "green" : "slate"}>
                  {configuredEnv.length} configured
                </Badge>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">
                Keys set in <code className="font-mono">.env</code> appear in the benchmark model
                menu without saving anything here.
              </p>
              <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {envProviders.map((provider) => (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-slate-700">
                        {provider.label}
                      </p>
                      <p className="truncate font-mono text-[9px] text-slate-400">
                        {provider.keyOptional ? "No key required" : provider.keyEnv.join(" / ")}
                      </p>
                    </div>
                    {provider.configured ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                    ) : (
                      <span className="shrink-0 text-[9px] text-slate-300">Not set</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-5 text-white">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,#6366f1,transparent_55%)] opacity-50" />
              <div className="relative">
                <h3 className="flex items-center gap-2 text-xs font-bold">
                  <Sparkles className="size-3.5 text-brand-300" /> Run a benchmark
                </h3>
                <p className="mt-1.5 text-[11px] leading-5 text-slate-300">
                  Once a model is saved or an environment key is present, open Success insights and
                  pick it in the model menu. Failures fall back to the local model automatically.
                </p>
                <Link
                  href="/dashboard/insights"
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/20"
                >
                  Open insights <ArrowRight className="size-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
