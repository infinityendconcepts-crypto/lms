"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { PLANS, currencyFor, priceFor, type PlanId } from "@/lib/plans";
import { getPlan } from "@/lib/plan-catalog";
import { normalizePromoCode, recordPromoRedemption, resolvePromo } from "@/lib/promos";
import { audit } from "@/lib/audit";

/**
 * Mock checkout. Wire this to Stripe Checkout in production:
 * create a Checkout Session here, then activate the plan from the webhook.
 */
export async function selectPlanAction(formData: FormData) {
  const ctx = await requireTenant("OWNER");
  const planId = String(formData.get("plan") ?? "") as PlanId;
  if (!(planId in PLANS)) redirect("/dashboard/billing?error=Unknown+plan");

  const plan = await getPlan(planId);
  const currency = currencyFor(ctx.tenant.currency);
  const code = normalizePromoCode(String(formData.get("promoCode") ?? ""));
  const { promo, error } = code
    ? await resolvePromo(code, plan, currency)
    : { promo: undefined, error: undefined };
  if (error) redirect(`/dashboard/billing?error=${encodeURIComponent(error)}`);

  const seats = plan.seats === null ? 999_999 : plan.seats + (promo?.seatBoost ?? 0);
  const days = promo?.trialDays && promo.trialDays > 0 ? promo.trialDays : 30;
  const periodEnd = new Date(Date.now() + days * 86_400_000);
  const effectivePrice = promo?.effectivePrice ?? priceFor(plan, currency);

  await db.subscription.upsert({
    where: { tenantId: ctx.tenant.id },
    create: {
      tenantId: ctx.tenant.id,
      plan: plan.id,
      seats,
      status: "ACTIVE",
      currentPeriodEnd: periodEnd,
      promoCode: promo?.code ?? null,
      effectivePrice,
    },
    update: {
      plan: plan.id,
      seats,
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: periodEnd,
      promoCode: promo?.code ?? null,
      effectivePrice,
    },
  });
  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: { trialEndsAt: promo?.trialDays ? periodEnd : null },
  });
  if (promo) await recordPromoRedemption(promo.id, ctx.tenant.id);
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "billing.plan_selected",
    target: plan.id,
    meta: { seats, price: effectivePrice, currency, promoCode: promo?.code ?? null },
  });
  revalidatePath("/dashboard/billing");
  redirect(`/dashboard/billing?upgraded=${plan.id}${promo ? `&promo=${promo.code}` : ""}`);
}

export async function cancelPlanAction(formData: FormData) {
  const ctx = await requireTenant("OWNER");
  const cancel = formData.get("cancel") === "1";
  await db.subscription.updateMany({
    where: { tenantId: ctx.tenant.id },
    data: { cancelAtPeriodEnd: cancel },
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: cancel ? "billing.cancel_scheduled" : "billing.cancel_reversed",
  });
  revalidatePath("/dashboard/billing");
  redirect(`/dashboard/billing?${cancel ? "canceled" : "resumed"}=1`);
}
