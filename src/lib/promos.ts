import "server-only";

import { db } from "@/lib/db";
import { priceFor, type Currency, type Plan } from "@/lib/plans";

export const PROMO_KINDS = ["PERCENT", "FIXED"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

export type AppliedPromo = {
  id: string;
  code: string;
  kind: PromoKind;
  value: number;
  listPrice: number;
  effectivePrice: number;
  trialDays: number | null;
  seatBoost: number | null;
};

export function normalizePromoCode(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().slice(0, 32);
}

/**
 * Validate a promo against the current catalogue. Prices are accounting-only —
 * this demo never charges a card — but entitlements (trial days, seats) are real.
 */
export async function resolvePromo(
  code: string,
  plan: Plan,
  currency: Currency
): Promise<{ promo?: AppliedPromo; error?: string }> {
  const normalized = normalizePromoCode(code);
  if (!normalized) return {};

  const row = await db.promoCode.findUnique({ where: { code: normalized } });
  if (!row) return { error: "That promo code was not found." };
  if (!row.active) return { error: "That promo code is no longer active." };
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return { error: "That promo code has expired." };
  }
  if (row.planId && row.planId !== plan.id) {
    return { error: `That code only applies to the ${row.planId.toLowerCase()} plan.` };
  }
  if (row.maxRedemptions !== null && row.redeemedCount >= row.maxRedemptions) {
    return { error: "That promo code has been fully redeemed." };
  }

  const listPrice = priceFor(plan, currency);
  const raw = row.kind === "PERCENT" ? listPrice * (1 - row.value / 100) : listPrice - row.value;
  const effectivePrice = Math.max(0, Math.round(raw * 100) / 100);

  return {
    promo: {
      id: row.id,
      code: row.code,
      kind: row.kind as PromoKind,
      value: row.value,
      listPrice,
      effectivePrice,
      trialDays: row.trialDays,
      seatBoost: row.seatBoost,
    },
  };
}

export async function recordPromoRedemption(codeId: string, tenantId: string) {
  const existing = await db.promoRedemption.findUnique({
    where: { codeId_tenantId: { codeId, tenantId } },
    select: { id: true },
  });
  if (existing) {
    await db.promoRedemption.update({
      where: { id: existing.id },
      data: { usedAt: new Date() },
    });
    return;
  }
  await db.$transaction([
    db.promoCode.update({ where: { id: codeId }, data: { redeemedCount: { increment: 1 } } }),
    db.promoRedemption.create({ data: { codeId, tenantId } }),
  ]);
}
