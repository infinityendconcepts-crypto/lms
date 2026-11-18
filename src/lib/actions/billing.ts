"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { PLANS, type PlanId } from "@/lib/plans";
import { audit } from "@/lib/audit";

/**
 * Mock checkout. Wire this to Stripe Checkout in production:
 * create a Checkout Session here, then activate the plan from the webhook.
 */
export async function selectPlanAction(formData: FormData) {
  const ctx = await requireTenant("OWNER");
  const planId = String(formData.get("plan") ?? "") as PlanId;
  if (!(planId in PLANS)) redirect("/dashboard/billing?error=Unknown+plan");

  const plan = PLANS[planId];
  await db.subscription.upsert({
    where: { tenantId: ctx.tenant.id },
    create: {
      tenantId: ctx.tenant.id,
      plan: plan.id,
      seats: plan.seats ?? 999_999,
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
    update: {
      plan: plan.id,
      seats: plan.seats ?? 999_999,
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: { trialEndsAt: null },
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "billing.plan_selected",
    target: plan.id,
    meta: { seats: plan.seats, price: plan.price },
  });
  revalidatePath("/dashboard/billing");
  redirect(`/dashboard/billing?upgraded=${plan.id}`);
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
