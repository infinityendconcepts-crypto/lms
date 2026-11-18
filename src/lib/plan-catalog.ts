import "server-only";

import { z } from "zod";
import { db } from "@/lib/db";
import {
  CURRENCIES,
  PLANS,
  applyPlanOverrides,
  type Currency,
  type Plan,
  type PlanId,
  type PlanOverrides,
  type PlanPrices,
} from "@/lib/plans";

export const PLAN_SETTING_KEY = "plan_overrides";

const PlanOverrideSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  price: z.number().min(0).max(1_000_000).optional(),
  prices: z.record(z.string(), z.number().min(0).max(1_000_000)).optional(),
  tagline: z.string().max(240).optional(),
  seats: z.number().int().min(1).max(10_000_000).nullable().optional(),
  courses: z.number().int().min(1).max(10_000_000).nullable().optional(),
  storageMb: z.number().int().min(1).max(10_000_000).optional(),
  customBranding: z.boolean().optional(),
  api: z.boolean().optional(),
  sso: z.boolean().optional(),
  features: z.array(z.string().min(1).max(160)).max(12).optional(),
});

const PlanOverridesSchema = z.record(z.string(), PlanOverrideSchema);

/** Stored plan edits, validated on read so a bad row can never break billing. */
export async function getPlanOverrides(): Promise<PlanOverrides> {
  const row = await db.platformSetting.findUnique({ where: { key: PLAN_SETTING_KEY } });
  if (!row) return {};
  try {
    const parsed = PlanOverridesSchema.parse(JSON.parse(row.value));
    const clean: PlanOverrides = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!(id in PLANS)) continue;
      const prices: PlanPrices = {};
      for (const [code, amount] of Object.entries(value.prices ?? {})) {
        if ((CURRENCIES as readonly string[]).includes(code)) prices[code as Currency] = amount;
      }
      clean[id as PlanId] = { ...value, prices };
    }
    return clean;
  } catch {
    return {};
  }
}

export async function getPlanCatalog(): Promise<Record<PlanId, Plan>> {
  return applyPlanOverrides(await getPlanOverrides());
}

export async function getPlanList(): Promise<Plan[]> {
  return Object.values(await getPlanCatalog());
}

export async function getPlan(plan: string): Promise<Plan> {
  const catalog = await getPlanCatalog();
  return catalog[(plan as PlanId) in catalog ? (plan as PlanId) : "STARTER"];
}
