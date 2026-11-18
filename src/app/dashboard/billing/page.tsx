import Link from "next/link";
import {
  ArrowRight,
  Check,
  CreditCard,
  Database,
  GraduationCap,
  HardDrive,
  Receipt,
  Sparkles,
  Users,
} from "lucide-react";
import { requireTenant } from "@/lib/tenant";
import { cancelPlanAction, selectPlanAction } from "@/lib/actions/billing";
import { Badge, PageHeader, Progress, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { getPlanState } from "@/lib/usage";
import { PLAN_LIST, currencyFor, limitLabel, trialDaysLeft } from "@/lib/plans";
import { formatBytes } from "@/lib/storage";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Billing & plan" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string; canceled?: string; resumed?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenant("ADMIN");
  const state = await getPlanState(ctx.tenant.id);
  const sub = state.subscription;
  const owner = ctx.role === "OWNER";
  const currency = currencyFor(ctx.tenant.currency);
  const trialLeft = sub?.status === "TRIALING" ? trialDaysLeft(sub.currentPeriodEnd) : 0;

  const storageMb = state.usage.storageBytes / 1024 / 1024;
  const storagePct = Math.min(100, Math.round((storageMb / state.plan.storageMb) * 100));

  return (
    <div>
      <PageHeader
        eyebrow="Commercial"
        title="Billing & plan"
        subtitle="Rent Nkanyezi LMS by the seat. Upgrade, downgrade or cancel at any time — changes apply immediately in this demo."
        actions={
          <Link href="/dashboard/settings" className="btn-secondary btn-sm">
            Workspace settings
          </Link>
        }
      />

      {(sp.upgraded || sp.canceled || sp.resumed || sp.error) && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            sp.error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {sp.error ??
            (sp.upgraded
              ? `You are now on the ${sp.upgraded[0]}${sp.upgraded.slice(1).toLowerCase()} plan.`
              : sp.canceled
                ? "Your plan will cancel at the end of the current period."
                : "Cancellation reversed — your plan stays active.")}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <section className="relative overflow-hidden rounded-2xl bg-slate-900 p-6 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(circle at 90% 0%, #6366f1, transparent 45%), radial-gradient(circle at 5% 100%, #8b5cf6, transparent 45%)",
            }}
          />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-200">
                  Current plan
                </p>
                <h2 className="mt-1 text-2xl font-bold">{state.plan.name}</h2>
                <p className="mt-0.5 text-xs text-slate-300">{state.plan.tagline}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold">
                  {formatMoney(state.plan.price, currency, { decimals: 0 })}
                  <span className="text-sm font-medium text-slate-300">/mo</span>
                </p>
                {sub && <StatusBadge status={sub.status} />}
              </div>
            </div>

            {trialLeft > 0 && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3.5 py-2.5 text-xs text-amber-100">
                <Sparkles className="size-4 shrink-0" />
                <span>
                  <b>{trialLeft} days left</b> in your Growth trial. Add a plan before{" "}
                  {formatDate(sub?.currentPeriodEnd ?? null)} to keep everything running.
                </span>
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white/10 p-3">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-300">
                  <Users className="size-3" /> Learners
                </p>
                <p className="mt-1 text-lg font-bold">
                  {state.usage.students}
                  <span className="text-xs font-medium text-slate-300">
                    {" "}
                    / {limitLabel(state.plan.seats)}
                  </span>
                </p>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-300">
                  <GraduationCap className="size-3" /> Courses
                </p>
                <p className="mt-1 text-lg font-bold">
                  {state.usage.courses}
                  <span className="text-xs font-medium text-slate-300">
                    {" "}
                    / {limitLabel(state.plan.courses)}
                  </span>
                </p>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-300">
                  <HardDrive className="size-3" /> Storage
                </p>
                <p className="mt-1 text-lg font-bold">{formatBytes(state.usage.storageBytes)}</p>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[10px] text-slate-300">
                <span>Storage used</span>
                <span>
                  {storagePct}% of {formatBytes(state.plan.storageMb * 1024 * 1024)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-white/70" style={{ width: `${Math.max(2, storagePct)}%` }} />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="card-pad">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Receipt className="size-4 text-slate-400" /> Subscription
            </h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Plan</dt>
                <dd className="font-semibold text-slate-800">{state.plan.name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Status</dt>
                <dd className="font-semibold text-slate-800">{sub?.status?.toLowerCase() ?? "none"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Seats</dt>
                <dd className="font-semibold text-slate-800">
                  {state.usage.students} used · {limitLabel(state.plan.seats)} included
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Renews</dt>
                <dd className="font-semibold text-slate-800">
                  {sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Payment method</dt>
                <dd className="font-semibold text-slate-800">Demo · no card</dd>
              </div>
            </dl>
            {sub?.cancelAtPeriodEnd && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Cancels on {formatDate(sub.currentPeriodEnd)}. You can resume any time.
              </div>
            )}
            {owner ? (
              <form action={cancelPlanAction} className="mt-3">
                <input type="hidden" name="cancel" value={sub?.cancelAtPeriodEnd ? "0" : "1"} />
                <SubmitButton variant="secondary" className="btn-sm w-full">
                  {sub?.cancelAtPeriodEnd ? "Resume subscription" : "Cancel at period end"}
                </SubmitButton>
              </form>
            ) : (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                Only the workspace owner can change billing.
              </p>
            )}
          </div>

          <div className="card-pad">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Database className="size-4 text-slate-400" /> Usage this period
            </h2>
            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                  <span>Learner seats</span>
                  <span>{state.usage.students} active</span>
                </div>
                <Progress
                  value={
                    state.plan.seats === null
                      ? 5
                      : Math.min(100, (state.usage.students / state.plan.seats) * 100)
                  }
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                  <span>Courses</span>
                  <span>{state.usage.courses} created</span>
                </div>
                <Progress
                  value={
                    state.plan.courses === null
                      ? 5
                      : Math.min(100, (state.usage.courses / state.plan.courses) * 100)
                  }
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                  <span>Graded submissions</span>
                  <span>{state.usage.submissions} total</span>
                </div>
                <Progress value={Math.min(100, state.usage.submissions)} />
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-8 mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Choose a plan</h2>
          <p className="text-[11px] text-slate-500">
            Every plan includes all nine question types, math rendering, auto-grading and secure files.
          </p>
        </div>
        <span className="hidden text-[10px] text-slate-400 sm:block">14-day Growth trial on signup</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_LIST.map((plan) => {
          const current = plan.id === state.plan.id;
          return (
            <div
              key={plan.id}
              className={`card relative flex flex-col overflow-hidden p-5 ${
                current ? "ring-2 ring-brand-500" : ""
              }`}
            >
              {plan.id === "GROWTH" && !current && (
                <span className="absolute top-4 right-4 rounded-full bg-brand-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                  Popular
                </span>
              )}
              <h3 className="text-sm font-bold text-slate-900">{plan.name}</h3>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{plan.tagline}</p>
              <p className="mt-3 text-2xl font-bold text-slate-900">
                {formatMoney(plan.price, currency, { decimals: 0 })}
                <span className="text-xs font-medium text-slate-400">/month</span>
              </p>
              <ul className="mt-3 flex-1 space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-1.5 text-[11px] leading-5 text-slate-600">
                    <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                {current ? (
                  <span className="btn-secondary btn-sm w-full cursor-default opacity-70">
                    <Check className="size-3.5" /> Current plan
                  </span>
                ) : owner ? (
                  <form action={selectPlanAction}>
                    <input type="hidden" name="plan" value={plan.id} />
                    <SubmitButton variant="secondary" className="w-full" pendingText="Switching…">
                      Switch to {plan.name} <ArrowRight className="size-3.5" />
                    </SubmitButton>
                  </form>
                ) : (
                  <span className="btn-secondary btn-sm w-full cursor-not-allowed opacity-60">
                    Owner action
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <CreditCard className="size-4 text-slate-400" />
          Demo checkout — no card is charged. Swap <code className="rounded bg-slate-100 px-1">selectPlanAction</code>{" "}
          for Stripe Checkout to go live.
        </span>
        <Badge tone="brand">
          <Sparkles className="size-3" /> Stripe-ready
        </Badge>
      </div>
    </div>
  );
}
