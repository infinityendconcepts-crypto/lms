import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarPlus,
  CreditCard,
  Globe2,
  GraduationCap,
  Mail,
  Plus,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";
import {
  createAdminWorkspaceAction,
  createPromoCodeAction,
  deletePromoCodeAction,
  extendTrialAction,
  savePlanDefinitionsAction,
  saveSystemRibbonAction,
  togglePromoCodeAction,
  toggleSuperAdminAction,
  toggleTenantSuspendedAction,
  updateSubscriptionAction,
  updateTenantPlanAction,
  updateWorkspaceAction,
} from "@/lib/actions/admin";
import { Avatar, Badge, Stat, StatusBadge } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { WorkspaceLogo } from "@/components/WorkspaceLogo";
import { WorkspaceLogoUpload } from "@/components/WorkspaceLogoUpload";
import { SubmitButton } from "@/components/SubmitButton";
import {
  CURRENCIES,
  CURRENCY_LABELS,
  DEFAULT_CURRENCY,
  currencyFor,
  priceFor,
  trialDaysLeft,
} from "@/lib/plans";
import { getPlanCatalog } from "@/lib/plan-catalog";
import { getSystemRibbon } from "@/lib/system-ribbon";
import { formatDate, formatMoney, timeAgo } from "@/lib/utils";

export const metadata = { title: "Platform admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireSuperAdmin();

  const [
    tenants,
    userCount,
    courseCount,
    assessmentCount,
    attemptCount,
    pendingGrading,
    recentUsers,
    audits,
    outbox,
    planCatalog,
    promos,
    systemRibbon,
  ] = await Promise.all([
    db.tenant.findMany({
      include: {
        subscription: true,
        _count: { select: { memberships: true, courses: true, assessments: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.user.count(),
    db.course.count(),
    db.assessment.count(),
    db.attempt.count(),
    db.attempt.count({ where: { status: "SUBMITTED" } }),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        memberships: {
          include: { tenant: { select: { name: true } } },
          take: 2,
        },
      },
    }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        actor: { select: { name: true, email: true } },
        tenant: { select: { name: true } },
      },
    }),
    db.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    getPlanCatalog(),
    db.promoCode.findMany({
      include: { _count: { select: { redemptions: true } } },
      orderBy: { createdAt: "desc" },
    }),
    getSystemRibbon(),
  ]);
  const plans = Object.values(planCatalog);

  const mrrByCurrency = tenants.reduce<Record<string, number>>((sums, tenant) => {
    if (tenant.subscription?.status !== "ACTIVE") return sums;
    const currency = currencyFor(tenant.currency);
    const plan = planCatalog[tenant.subscription.plan as keyof typeof planCatalog] ?? planCatalog.STARTER;
    sums[currency] =
      (sums[currency] ?? 0) + (tenant.subscription.effectivePrice ?? priceFor(plan, currency));
    return sums;
  }, {});
  const mrrLabel =
    Object.entries(mrrByCurrency)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => formatMoney(amount, currency, { decimals: 0 }))
      .join(" · ") || formatMoney(0, DEFAULT_CURRENCY, { decimals: 0 });
  const activeTenants = tenants.filter((t) => !t.suspended && t.subscription?.status === "ACTIVE").length;
  const trialing = tenants.filter(
    (t) => (t.subscription?.status === "TRIALING" || t.trialEndsAt) && !t.suspended
  ).length;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size="sm" inverted />
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">
              Platform admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="btn-ghost btn-sm text-white/80 hover:bg-white/10 hover:text-white">
              Back to app
            </Link>
            <span className="hidden items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] sm:flex">
              <Avatar name={session.user.name} size="sm" /> {session.user.email}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">
            Control plane
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Every workspace on Nkanyezi LMS
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Tenants, subscriptions, people and platform activity. Changes are written to the audit log.
          </p>
        </div>

        {sp.saved && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {sp.saved}
          </div>
        )}
        {sp.error && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {sp.error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Monthly recurring revenue"
            value={mrrLabel}
            hint={`${activeTenants} active · ${trialing} trialing`}
            icon={<CreditCard className="size-4" />}
          />
          <Stat
            label="Workspaces"
            value={tenants.length}
            hint={`${tenants.filter((t) => t.kind === "SCHOOL").length} schools · ${tenants.filter((t) => t.kind === "TEACHER").length} solo teachers · ${tenants.filter((t) => t.kind === "CRECHE").length} creches`}
            icon={<Building2 className="size-4" />}
          />
          <Stat
            label="People"
            value={userCount}
            hint={`${recentUsers.length ? `newest ${timeAgo(recentUsers[0].createdAt)}` : "no signups yet"}`}
            icon={<Users className="size-4" />}
          />
          <Stat
            label="Learning activity"
            value={attemptCount.toLocaleString()}
            hint={`${pendingGrading} submission${pendingGrading === 1 ? "" : "s"} awaiting grading`}
            icon={<Activity className="size-4" />}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="card flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <BookOpen className="size-4" />
            </span>
            <div>
              <p className="text-lg font-bold text-slate-900">{courseCount}</p>
              <p className="text-[11px] text-slate-500">courses</p>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <GraduationCap className="size-4" />
            </span>
            <div>
              <p className="text-lg font-bold text-slate-900">{assessmentCount}</p>
              <p className="text-[11px] text-slate-500">assessments</p>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Globe2 className="size-4" />
            </span>
            <div>
              <p className="text-lg font-bold text-slate-900">{new Set(tenants.map((t) => t.id)).size}</p>
              <p className="text-[11px] text-slate-500">isolated tenant databases</p>
            </div>
          </div>
        </div>

        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Building2 className="size-4 text-brand-500" /> Workspaces
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Create workspaces, edit details, manage subscriptions and suspend access.
              </p>
            </div>
            <details className="group relative">
              <summary className="btn-primary btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <Plus className="size-3.5" /> New workspace
              </summary>
              <form
                action={createAdminWorkspaceAction}
                className="card-pad absolute right-0 z-20 mt-2 w-[min(34rem,calc(100vw-2rem))] space-y-3 shadow-xl"
              >
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create a workspace</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Leave owner email blank to add yourself as the owner.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="admin-workspace-name">
                      Workspace name
                    </label>
                    <input
                      id="admin-workspace-name"
                      name="name"
                      required
                      minLength={2}
                      maxLength={80}
                      placeholder="Riverside School"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="admin-workspace-slug">
                      Slug <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                      id="admin-workspace-slug"
                      name="slug"
                      placeholder="riverside"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="admin-workspace-kind">
                      Type
                    </label>
                    <select id="admin-workspace-kind" name="kind" className="select">
                      <option value="SCHOOL">School</option>
                      <option value="TEACHER">Solo teacher</option>
                      <option value="CRECHE">Creche</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="admin-workspace-currency">
                      Currency
                    </label>
                    <select
                      id="admin-workspace-currency"
                      name="currency"
                      defaultValue={DEFAULT_CURRENCY}
                      className="select"
                    >
                      {CURRENCIES.map((code) => (
                        <option key={code} value={code}>
                          {code} · {CURRENCY_LABELS[code]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="admin-workspace-owner">
                      Owner email
                    </label>
                    <input
                      id="admin-workspace-owner"
                      name="ownerEmail"
                      type="email"
                      placeholder="existing@user.com"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="admin-workspace-plan">
                      Plan
                    </label>
                    <select id="admin-workspace-plan" name="plan" defaultValue="GROWTH" className="select">
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} ·{" "}
                          {formatMoney(priceFor(plan, DEFAULT_CURRENCY), DEFAULT_CURRENCY, { decimals: 0 })}/mo
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="admin-workspace-status">
                      Subscription status
                    </label>
                    <select id="admin-workspace-status" name="status" defaultValue="TRIALING" className="select">
                      <option value="TRIALING">Trialing</option>
                      <option value="ACTIVE">Active</option>
                    </select>
                  </div>
                </div>
                <SubmitButton className="w-full" pendingText="Creating…">
                  <Plus className="size-3.5" /> Create workspace
                </SubmitButton>
              </form>
            </details>
          </div>

          <div className="space-y-2">
            {tenants.map((tenant) => {
              const plan =
                planCatalog[tenant.subscription?.plan as keyof typeof planCatalog] ?? planCatalog.STARTER;
              const days = trialDaysLeft(tenant.trialEndsAt);
              const showTrial = days > 0 && (tenant.subscription?.status ?? "TRIALING") === "TRIALING";
              return (
                <div
                  key={tenant.id}
                  className={`card overflow-hidden ${tenant.suspended ? "border-rose-200 bg-rose-50/30" : ""}`}
                >
                  <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <WorkspaceLogo
                        tenant={{
                          id: tenant.id,
                          name: tenant.name,
                          logoUrl: tenant.logoUrl,
                          brandColor: tenant.brandColor,
                          updatedAt: tenant.logoUpdatedAt?.toISOString() ?? null,
                        }}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-bold text-slate-900">{tenant.name}</p>
                          <Badge tone={tenant.kind === "SCHOOL" ? "brand" : tenant.kind === "CRECHE" ? "amber" : "sky"}>
                            {tenant.kind === "SCHOOL" ? "School" : tenant.kind === "CRECHE" ? "Creche" : "Teacher"}
                          </Badge>
                          {tenant.suspended && <Badge tone="red">Suspended</Badge>}
                          {showTrial && <Badge tone="amber">Trial · {days}d left</Badge>}
                          {tenant.subscription && <StatusBadge status={tenant.subscription.status} />}
                          {tenant.subscription?.cancelAtPeriodEnd && (
                            <Badge tone="amber">Cancels at period end</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          /{tenant.slug} · {tenant._count.memberships} members · {tenant._count.courses} courses ·{" "}
                          {tenant._count.assessments} assessments · joined {formatDate(tenant.createdAt)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {plan.name} ·{" "}
                          {formatMoney(
                            tenant.subscription?.effectivePrice ??
                              priceFor(plan, currencyFor(tenant.currency)),
                            currencyFor(tenant.currency),
                            { decimals: 0 }
                          )}
                          /mo ·{" "}
                          {tenant.subscription?.seats ?? plan.seats ?? "∞"} seats
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <form action={updateTenantPlanAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="tenantId" value={tenant.id} />
                        <select
                          name="plan"
                          defaultValue={tenant.subscription?.plan ?? "STARTER"}
                          className="select h-8 w-28 py-0 text-[11px]"
                          aria-label={`Plan for ${tenant.name}`}
                        >
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <select
                          name="status"
                          defaultValue={tenant.subscription?.status ?? "TRIALING"}
                          className="select h-8 w-28 py-0 text-[11px]"
                          aria-label={`Status for ${tenant.name}`}
                        >
                          <option value="TRIALING">Trialing</option>
                          <option value="ACTIVE">Active</option>
                          <option value="PAST_DUE">Past due</option>
                          <option value="CANCELED">Canceled</option>
                        </select>
                        <SubmitButton variant="secondary" className="btn-sm" pendingText="…">
                          Save
                        </SubmitButton>
                      </form>
                      <form action={extendTrialAction}>
                        <input type="hidden" name="tenantId" value={tenant.id} />
                        <input type="hidden" name="days" value="14" />
                        <SubmitButton variant="ghost" className="btn-sm" pendingText="…">
                          <CalendarPlus className="size-3.5" /> +14d trial
                        </SubmitButton>
                      </form>
                      <form action={toggleTenantSuspendedAction}>
                        <input type="hidden" name="tenantId" value={tenant.id} />
                        <SubmitButton
                          variant={tenant.suspended ? "secondary" : "ghost"}
                          className="btn-sm"
                          pendingText="…"
                        >
                          {tenant.suspended ? (
                            <>
                              <ShieldCheck className="size-3.5" /> Restore
                            </>
                          ) : (
                            <>
                              <ShieldOff className="size-3.5" /> Suspend
                            </>
                          )}
                        </SubmitButton>
                      </form>
                      <Link
                        href={`/dashboard/settings?tenant=${tenant.id}`}
                        className="btn-ghost btn-sm"
                        title="Inspect workspace administration"
                      >
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </div>
                  </div>

                  <details className="group border-t border-slate-100 bg-slate-50/50">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 [&::-webkit-details-marker]:hidden">
                      <Settings2 className="size-3.5" /> Workspace & subscription details
                      <span className="ml-auto text-[10px] font-normal text-slate-400 group-open:hidden">Show</span>
                      <span className="ml-auto hidden text-[10px] font-normal text-slate-400 group-open:inline">Hide</span>
                    </summary>
                    <div className="grid gap-4 border-t border-slate-100 p-4 lg:grid-cols-2">
                      <form action={updateWorkspaceAction} className="space-y-3">
                        <input type="hidden" name="tenantId" value={tenant.id} />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Workspace</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="label" htmlFor={`workspace-name-${tenant.id}`}>
                              Name
                            </label>
                            <input
                              id={`workspace-name-${tenant.id}`}
                              name="name"
                              defaultValue={tenant.name}
                              required
                              className="input"
                            />
                          </div>
                          <div>
                            <label className="label" htmlFor={`workspace-slug-${tenant.id}`}>
                              Slug
                            </label>
                            <input
                              id={`workspace-slug-${tenant.id}`}
                              name="slug"
                              defaultValue={tenant.slug}
                              required
                              className="input"
                            />
                          </div>
                          <div>
                            <label className="label" htmlFor={`workspace-kind-${tenant.id}`}>
                              Type
                            </label>
                            <select
                              id={`workspace-kind-${tenant.id}`}
                              name="kind"
                              defaultValue={tenant.kind}
                              className="select"
                            >
                              <option value="SCHOOL">School</option>
                              <option value="TEACHER">Solo teacher</option>
                              <option value="CRECHE">Creche</option>
                            </select>
                          </div>
                          <div>
                            <label className="label" htmlFor={`workspace-color-${tenant.id}`}>
                              Brand color
                            </label>
                            <input
                              id={`workspace-color-${tenant.id}`}
                              name="brandColor"
                              type="color"
                              defaultValue={tenant.brandColor}
                              className="input h-9 p-1"
                            />
                          </div>
                          <div>
                            <label className="label" htmlFor={`workspace-currency-${tenant.id}`}>
                              Currency
                            </label>
                            <select
                              id={`workspace-currency-${tenant.id}`}
                              name="currency"
                              defaultValue={currencyFor(tenant.currency)}
                              className="select"
                            >
                              {CURRENCIES.map((code) => (
                                <option key={code} value={code}>
                                  {code} · {CURRENCY_LABELS[code]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="label" htmlFor={`workspace-headline-${tenant.id}`}>
                            Headline
                          </label>
                          <input
                            id={`workspace-headline-${tenant.id}`}
                            name="headline"
                            defaultValue={tenant.headline ?? ""}
                            className="input"
                          />
                        </div>
                        <WorkspaceLogoUpload
                          key={`logo-${tenant.id}-${tenant.logoUrl ?? "none"}-${tenant.logoUpdatedAt?.toISOString() ?? "v0"}`}
                          compact
                          tenant={{
                            id: tenant.id,
                            name: tenant.name,
                            logoUrl: tenant.logoUrl,
                            brandColor: tenant.brandColor,
                            updatedAt: tenant.logoUpdatedAt?.toISOString() ?? null,
                          }}
                        />
                        <SubmitButton variant="secondary" className="btn-sm" pendingText="Saving…">
                          Save workspace
                        </SubmitButton>
                      </form>

                      <form action={updateSubscriptionAction} className="space-y-3">
                        <input type="hidden" name="tenantId" value={tenant.id} />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Subscription</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="label" htmlFor={`sub-plan-${tenant.id}`}>
                              Plan
                            </label>
                            <select
                              id={`sub-plan-${tenant.id}`}
                              name="plan"
                              defaultValue={tenant.subscription?.plan ?? "STARTER"}
                              className="select"
                            >
                              {plans.map((plan) => (
                                <option key={plan.id} value={plan.id}>
                                  {plan.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="label" htmlFor={`sub-status-${tenant.id}`}>
                              Status
                            </label>
                            <select
                              id={`sub-status-${tenant.id}`}
                              name="status"
                              defaultValue={tenant.subscription?.status ?? "TRIALING"}
                              className="select"
                            >
                              <option value="TRIALING">Trialing</option>
                              <option value="ACTIVE">Active</option>
                              <option value="PAST_DUE">Past due</option>
                              <option value="CANCELED">Canceled</option>
                            </select>
                          </div>
                          <div>
                            <label className="label" htmlFor={`sub-seats-${tenant.id}`}>
                              Seats
                            </label>
                            <input
                              id={`sub-seats-${tenant.id}`}
                              name="seats"
                              type="number"
                              min={1}
                              max={1000000}
                              defaultValue={tenant.subscription?.seats ?? plan.seats ?? 100}
                              className="input"
                            />
                          </div>
                          <div>
                            <label className="label" htmlFor={`sub-renews-${tenant.id}`}>
                              Renews on
                            </label>
                            <input
                              id={`sub-renews-${tenant.id}`}
                              name="renewsOn"
                              type="date"
                              defaultValue={
                                tenant.subscription?.currentPeriodEnd
                                  ? tenant.subscription.currentPeriodEnd.toISOString().slice(0, 10)
                                  : ""
                              }
                              className="input"
                            />
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-[11px] text-slate-600">
                          <input
                            type="checkbox"
                            name="cancelAtPeriodEnd"
                            defaultChecked={tenant.subscription?.cancelAtPeriodEnd ?? false}
                            className="size-3.5 rounded border-slate-300"
                          />
                          Cancel at period end
                        </label>
                        <SubmitButton variant="secondary" className="btn-sm" pendingText="Saving…">
                          Save subscription
                        </SubmitButton>
                      </form>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Tag className="size-4 text-brand-500" /> Plans & promotions
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Edit the catalogue for the whole app and issue promo codes. Prices are accounting-only
              in this demo; no card is charged.
            </p>
          </div>

          <div className="space-y-3">
            <details className="card overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-xs font-bold text-slate-800 [&::-webkit-details-marker]:hidden">
                <span>Plan definitions · {plans.length} plans</span>
                <span className="text-[10px] font-normal text-slate-400">Edit names, prices and limits</span>
              </summary>
              <form action={savePlanDefinitionsAction} className="space-y-4 border-t border-slate-100 p-5">
                {plans.map((plan) => (
                  <div key={plan.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">{plan.id}</p>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <input
                          type="checkbox"
                          name={`${plan.id}_customBranding`}
                          defaultChecked={plan.customBranding}
                          className="size-3"
                        />
                        Branding
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <input type="checkbox" name={`${plan.id}_api`} defaultChecked={plan.api} className="size-3" />
                        API
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <input type="checkbox" name={`${plan.id}_sso`} defaultChecked={plan.sso} className="size-3" />
                        SSO
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className="label" htmlFor={`${plan.id}_name`}>Name</label>
                        <input id={`${plan.id}_name`} name={`${plan.id}_name`} defaultValue={plan.name} className="input" />
                      </div>
                      <div>
                        <label className="label" htmlFor={`${plan.id}_price`}>Fallback price</label>
                        <input
                          id={`${plan.id}_price`}
                          name={`${plan.id}_price`}
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={plan.price}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`${plan.id}_seats`}>Learner seats</label>
                        <input
                          id={`${plan.id}_seats`}
                          name={`${plan.id}_seats`}
                          placeholder="unlimited"
                          defaultValue={plan.seats === null ? "unlimited" : plan.seats}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`${plan.id}_courses`}>Courses</label>
                        <input
                          id={`${plan.id}_courses`}
                          name={`${plan.id}_courses`}
                          placeholder="unlimited"
                          defaultValue={plan.courses === null ? "unlimited" : plan.courses}
                          className="input"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label" htmlFor={`${plan.id}_tagline`}>Tagline</label>
                        <input
                          id={`${plan.id}_tagline`}
                          name={`${plan.id}_tagline`}
                          defaultValue={plan.tagline}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`${plan.id}_storageMb`}>Storage (MB)</label>
                        <input
                          id={`${plan.id}_storageMb`}
                          name={`${plan.id}_storageMb`}
                          type="number"
                          min={1}
                          defaultValue={plan.storageMb}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label">Per-currency prices</label>
                        <div className="grid grid-cols-4 gap-1">
                          {CURRENCIES.map((code) => (
                            <input
                              key={code}
                              name={`${plan.id}_price_${code}`}
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder={code}
                              defaultValue={plan.prices?.[code] ?? ""}
                              aria-label={`${plan.name} price in ${code}`}
                              className="input px-1.5 text-center text-[11px]"
                            />
                          ))}
                        </div>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-4">
                        <label className="label" htmlFor={`${plan.id}_features`}>
                          Feature bullets <span className="font-normal text-slate-400">(one per line)</span>
                        </label>
                        <textarea
                          id={`${plan.id}_features`}
                          name={`${plan.id}_features`}
                          rows={3}
                          defaultValue={plan.features.join("\n")}
                          className="textarea font-sans text-[12px]"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <SubmitButton pendingText="Saving plans…">Save plan definitions</SubmitButton>
              </form>
            </details>

            <details className="card overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-xs font-bold text-slate-800 [&::-webkit-details-marker]:hidden">
                <span>System update ribbon</span>
                <span className="text-[10px] font-normal text-slate-400">
                  {systemRibbon.enabled ? "Visible site-wide" : "Hidden"}
                </span>
              </summary>
              <div className="border-t border-slate-100 p-5">
                <form action={saveSystemRibbonAction} className="space-y-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={systemRibbon.enabled}
                      className="size-4 rounded border-slate-300"
                    />
                    Show ribbon on top for system updates
                  </label>
                  <div>
                    <label className="label" htmlFor="ribbon-message">
                      Message
                    </label>
                    <textarea
                      id="ribbon-message"
                      name="message"
                      rows={3}
                      defaultValue={systemRibbon.message}
                      placeholder="e.g. Scheduled maintenance tonight 22:00–23:00 UTC. Some features may be briefly unavailable."
                      className="textarea"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Displayed at the top of the app when enabled. Leave empty or uncheck to hide.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="label" htmlFor="ribbon-tone">
                        Style
                      </label>
                      <select id="ribbon-tone" name="tone" defaultValue={systemRibbon.tone} className="select">
                        <option value="info">Info (brand)</option>
                        <option value="warning">Warning</option>
                        <option value="success">Success</option>
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="ribbon-link-label">
                        Link label (optional)
                      </label>
                      <input
                        id="ribbon-link-label"
                        name="linkLabel"
                        defaultValue={systemRibbon.linkLabel ?? ""}
                        placeholder="Learn more"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="ribbon-link-href">
                        Link URL (optional)
                      </label>
                      <input
                        id="ribbon-link-href"
                        name="linkHref"
                        defaultValue={systemRibbon.linkHref ?? ""}
                        placeholder="/dashboard/notifications or https://…"
                        className="input"
                      />
                    </div>
                  </div>
                  <SubmitButton pendingText="Saving ribbon…">Save system ribbon</SubmitButton>
                </form>
              </div>
            </details>

            <details className="card overflow-hidden" open={promos.length === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-xs font-bold text-slate-800 [&::-webkit-details-marker]:hidden">
                <span>Promo codes · {promos.length} total</span>
                <span className="text-[10px] font-normal text-slate-400">Discounts, trials and seat boosts</span>
              </summary>
              <div className="border-t border-slate-100 p-5">
                <form action={createPromoCodeAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="label" htmlFor="promo-code">Code</label>
                    <input id="promo-code" name="code" required placeholder="WELCOME20" className="input uppercase" />
                  </div>
                  <div>
                    <label className="label" htmlFor="promo-plan">Plan</label>
                    <select id="promo-plan" name="planId" className="select">
                      <option value="">All plans</option>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>{plan.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="promo-kind">Discount type</label>
                    <select id="promo-kind" name="kind" className="select">
                      <option value="PERCENT">Percent off (%)</option>
                      <option value="FIXED">Fixed amount off</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="promo-value">Discount value</label>
                    <input id="promo-value" name="value" type="number" min={0.01} step="0.01" required className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="promo-trial">Extra trial days</label>
                    <input id="promo-trial" name="trialDays" type="number" min={0} max={365} placeholder="0" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="promo-seats">Extra seats</label>
                    <input id="promo-seats" name="seatBoost" type="number" min={0} placeholder="0" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="promo-max">Max redemptions</label>
                    <input id="promo-max" name="maxRedemptions" type="number" min={0} placeholder="Unlimited" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="promo-expiry">Expires on</label>
                    <input id="promo-expiry" name="expiresAt" type="date" className="input" />
                  </div>
                  <label className="flex items-center gap-2 self-end pb-2 text-[11px] text-slate-600">
                    <input name="active" type="checkbox" defaultChecked className="size-3.5" /> Active
                  </label>
                  <div className="sm:col-span-2 lg:col-span-3 lg:justify-self-end">
                    <SubmitButton className="w-full" pendingText="Creating…">
                      <Tag className="size-3.5" /> Create promo code
                    </SubmitButton>
                  </div>
                </form>

                <div className="table-wrap mt-5">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Applies to</th>
                        <th>Discount</th>
                        <th>Extras</th>
                        <th>Redeemed</th>
                        <th>Expires</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {promos.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-xs text-slate-400">
                            No promo codes yet.
                          </td>
                        </tr>
                      ) : (
                        promos.map((promo) => (
                          <tr key={promo.id}>
                            <td>
                              <span className="font-mono text-xs font-bold text-slate-800">{promo.code}</span>
                              {!promo.active && <Badge tone="slate">Paused</Badge>}
                            </td>
                            <td className="text-[11px] text-slate-600">
                              {promo.planId ? promo.planId.toLowerCase() : "All plans"}
                            </td>
                            <td className="text-[11px] text-slate-600">
                              {promo.kind === "PERCENT" ? `${promo.value}% off` : `${promo.value} off`}
                            </td>
                            <td className="text-[11px] text-slate-600">
                              {[
                                promo.trialDays ? `+${promo.trialDays}d trial` : null,
                                promo.seatBoost ? `+${promo.seatBoost} seats` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </td>
                            <td className="text-[11px] text-slate-600">
                              {promo._count.redemptions}
                              {promo.maxRedemptions !== null ? ` / ${promo.maxRedemptions}` : ""}
                            </td>
                            <td className="text-[11px] text-slate-500">
                              {promo.expiresAt ? formatDate(promo.expiresAt) : "Never"}
                            </td>
                            <td className="text-right">
                              <div className="flex justify-end gap-1">
                                <form action={togglePromoCodeAction}>
                                  <input type="hidden" name="promoId" value={promo.id} />
                                  <SubmitButton variant="ghost" className="btn-sm" pendingText="…">
                                    {promo.active ? "Pause" : "Activate"}
                                  </SubmitButton>
                                </form>
                                <form action={deletePromoCodeAction}>
                                  <input type="hidden" name="promoId" value={promo.id} />
                                  <SubmitButton
                                    variant="ghost"
                                    className="btn-sm text-rose-600"
                                    confirm={`Delete promo ${promo.code}?`}
                                    pendingText="…"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </SubmitButton>
                                </form>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          </div>
        </section>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Users className="size-3.5" /> Newest people
              </h2>
              <span className="text-[11px] text-slate-400">{userCount} total</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {recentUsers.map((user) => (
                <li key={user.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-800">
                      {user.name}
                      {user.isSuperAdmin && <ShieldCheck className="size-3 text-brand-500" />}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {user.email}
                      {user.memberships.length > 0 &&
                        ` · ${user.memberships.map((m) => m.tenant.name).join(", ")}`}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400">{timeAgo(user.createdAt)}</span>
                  <form action={toggleSuperAdminAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <SubmitButton variant="ghost" className="btn-sm" pendingText="…">
                      {user.isSuperAdmin ? "Revoke admin" : "Make admin"}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Sparkles className="size-3.5" /> Recent audit events
              </h2>
              <span className="text-[11px] text-slate-400">Newest first</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {audits.length === 0 ? (
                <li className="px-5 py-6 text-center text-xs text-slate-400">No events yet.</li>
              ) : (
                audits.map((event) => (
                  <li key={event.id} className="flex items-start gap-2 px-5 py-2.5">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-slate-700">{event.action}</p>
                      <p className="truncate text-[10px] text-slate-400">
                        {event.actor?.name ?? "System"}
                        {event.tenant ? ` · ${event.tenant.name}` : ""}
                        {event.target ? ` · ${event.target.slice(0, 12)}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(event.createdAt)}</span>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <section className="card mt-5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Mail className="size-3.5" /> Email outbox
            </h2>
            <span className="text-[11px] text-slate-400">Dev transport · swap in src/lib/email.ts</span>
          </div>
          {outbox.length === 0 ? (
            <p className="px-5 py-6 text-center text-xs text-slate-400">No messages sent yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {outbox.map((message) => (
                <li key={message.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{message.subject}</p>
                    <p className="truncate text-[11px] text-slate-400">
                      to {message.to} · {message.kind.toLowerCase()}
                    </p>
                  </div>
                  <Badge tone={message.sentAt ? "green" : "amber"}>
                    {message.sentAt ? "sent" : "queued"}
                  </Badge>
                  <span className="text-[10px] text-slate-400">{timeAgo(message.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-8 text-center text-[11px] text-slate-400">
          Signed in as {session.user.email} · super admin
        </p>
      </main>
    </div>
  );
}
