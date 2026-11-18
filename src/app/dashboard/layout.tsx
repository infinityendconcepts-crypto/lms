import Link from "next/link";
import { ArrowUpRight, LogOut, Sparkles } from "lucide-react";
import { getAppContext } from "@/lib/tenant";
import { logoutAction } from "@/lib/actions/auth";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { Logo } from "@/components/Logo";
import { WorkspaceLogo } from "@/components/WorkspaceLogo";
import { Avatar } from "@/components/ui";
import { MobileNav, SidebarNav } from "@/components/dashboard/SidebarNav";
import { planFor, trialDaysLeft } from "@/lib/plans";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAppContext();
  const plan = planFor(ctx.tenant.subscription?.plan ?? "STARTER");
  const trialLeft =
    ctx.tenant.subscription?.status === "TRIALING"
      ? trialDaysLeft(ctx.tenant.subscription.currentPeriodEnd)
      : 0;
  const admin = ["OWNER", "ADMIN"].includes(ctx.role);
  const memberships = ctx.memberships.map((m) => ({
    tenantId: m.tenantId,
    name: m.tenant.name,
    role: m.role,
    kind: m.tenant.kind,
    logoUrl: m.tenant.logoUrl,
    brandColor: m.tenant.brandColor,
    updatedAt: m.tenant.logoUpdatedAt?.toISOString() ?? null,
  }));

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-slate-200/80 bg-slate-50/80 px-4 py-5 backdrop-blur-xl lg:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2.5 px-2">
          <WorkspaceLogo
            tenant={{
              id: ctx.tenant.id,
              name: ctx.tenant.name,
              logoUrl: ctx.tenant.logoUrl,
              brandColor: ctx.tenant.brandColor,
              updatedAt: ctx.tenant.logoUpdatedAt?.toISOString() ?? null,
            }}
            className="border border-slate-200"
          />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-bold text-slate-900">
              {ctx.tenant.name}
            </span>
            <span className="block text-[10px] font-medium tracking-wide text-slate-400 uppercase">
              {ctx.tenant.kind === "TEACHER" ? "Teacher workspace" : "School workspace"}
            </span>
          </span>
        </Link>

        <div className="flex-1 overflow-y-auto pr-1">
          <SidebarNav role={ctx.role} isSuperAdmin={ctx.user.isSuperAdmin} />
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-800">{plan.name} plan</p>
              {trialLeft > 0 ? (
                <span className="badge bg-amber-50 text-amber-700">{trialLeft}d trial</span>
              ) : (
                <span className="badge bg-emerald-50 text-emerald-700">Active</span>
              )}
            </div>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              {plan.seats === null ? "Unlimited learners" : `${plan.seats} learner seats`} ·{" "}
              {plan.courses === null ? "unlimited courses" : `${plan.courses} courses`}
            </p>
            {admin && (
              <Link
                href="/dashboard/billing"
                className="mt-2.5 flex items-center justify-between rounded-lg bg-brand-50 px-2.5 py-1.5 text-[10px] font-semibold text-brand-700 transition hover:bg-brand-100"
              >
                <span className="flex items-center gap-1">
                  <Sparkles className="size-3" /> Manage plan
                </span>
                <ArrowUpRight className="size-3" />
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2.5 rounded-2xl px-1">
            <Avatar name={ctx.user.name} src={ctx.user.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-slate-800">{ctx.user.name}</p>
              <p className="truncate text-[10px] text-slate-400">{ctx.user.email}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                title="Sign out"
              >
                <LogOut className="size-3.5" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNav
              role={ctx.role}
              isSuperAdmin={ctx.user.isSuperAdmin}
              tenantName={ctx.tenant.name}
              userName={ctx.user.name}
            />
            <Link href="/dashboard" className="lg:hidden">
              <Logo
                size="sm"
                tenant={{
                  id: ctx.tenant.id,
                  name: ctx.tenant.name,
                  logoUrl: ctx.tenant.logoUrl,
                  brandColor: ctx.tenant.brandColor,
                  updatedAt: ctx.tenant.logoUpdatedAt?.toISOString() ?? null,
                }}
              />
            </Link>
            <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
              <span className="font-medium text-slate-600">{ctx.tenant.name}</span>
              <span>/</span>
              <span className="capitalize">{ctx.role.toLowerCase()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TenantSwitcher
              memberships={memberships}
              activeId={ctx.tenant.id}
              activeTenant={{
                id: ctx.tenant.id,
                name: ctx.tenant.name,
                logoUrl: ctx.tenant.logoUrl,
                brandColor: ctx.tenant.brandColor,
                updatedAt: ctx.tenant.logoUpdatedAt?.toISOString() ?? null,
              }}
            />
            <Link
              href="/"
              className="hidden rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 sm:block"
            >
              View site
            </Link>
            <div className="hidden h-6 w-px bg-slate-200 sm:block" />
            <div className="flex items-center gap-2">
              <Avatar name={ctx.user.name} src={ctx.user.avatarUrl} size="sm" />
              <div className="hidden leading-tight md:block">
                <p className="text-[11px] font-semibold text-slate-800">{ctx.user.name}</p>
                <p className="text-[10px] text-slate-400">{ctx.role.toLowerCase()}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
