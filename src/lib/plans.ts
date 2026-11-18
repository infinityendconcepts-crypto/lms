export type PlanId = "STARTER" | "GROWTH" | "SCALE";

export const CURRENCIES = ["ZAR", "USD", "EUR", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = "ZAR";

export const CURRENCY_LABELS: Record<Currency, string> = {
  ZAR: "South African Rand",
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
};

export function currencyFor(value: string | null | undefined): Currency {
  return CURRENCIES.includes(value as Currency) ? (value as Currency) : DEFAULT_CURRENCY;
}

export type PlanPrices = Partial<Record<Currency, number>>;

export type Plan = {
  id: PlanId;
  name: string;
  /** Fallback price, used when a currency has no explicit override. */
  price: number;
  prices?: PlanPrices;
  tagline: string;
  seats: number | null;
  courses: number | null;
  storageMb: number;
  customBranding: boolean;
  api: boolean;
  sso: boolean;
  features: string[];
};

/** Super-admin edits are stored as partial overrides over these compile-time defaults. */
export type PlanOverride = Partial<Omit<Plan, "id">>;
export type PlanOverrides = Partial<Record<PlanId, PlanOverride>>;

export const PLANS: Record<PlanId, Plan> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    price: 19,
    tagline: "For a single teacher building a paid classroom.",
    seats: 100,
    courses: 10,
    storageMb: 2_048,
    customBranding: false,
    api: false,
    sso: false,
    features: [
      "Up to 100 learners",
      "10 courses",
      "All 9 question types + math editor",
      "Auto-grading & gradebook",
      "Document, video & PDF lessons",
      "Email support",
    ],
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    price: 49,
    tagline: "For departments and small schools.",
    seats: 400,
    courses: 50,
    storageMb: 10_240,
    customBranding: true,
    api: false,
    sso: false,
    features: [
      "Up to 400 learners",
      "50 courses",
      "Custom branding & logo",
      "Case-study & rubric grading",
      "CSV gradebook export",
      "Priority support",
    ],
  },
  SCALE: {
    id: "SCALE",
    name: "Scale",
    price: 99,
    tagline: "For multi-campus schools and tutoring groups.",
    seats: null,
    courses: null,
    storageMb: 51_200,
    customBranding: true,
    api: true,
    sso: true,
    features: [
      "Unlimited learners & courses",
      "Custom branding + own domain",
      "SSO / SAML (roadmap wired)",
      "API access & webhooks",
      "Audit log retention",
      "Dedicated onboarding",
    ],
  },
};

export const PLAN_LIST = Object.values(PLANS);

export function planFor(plan: string): Plan {
  return PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : "STARTER"];
}

/** Merge stored platform overrides over the built-in plan catalogue. */
export function applyPlanOverrides(overrides: PlanOverrides): Record<PlanId, Plan> {
  const catalog = {} as Record<PlanId, Plan>;
  for (const id of Object.keys(PLANS) as PlanId[]) {
    catalog[id] = { ...PLANS[id], ...(overrides[id] ?? {}), id };
  }
  return catalog;
}

export function priceFor(plan: Plan, currency: Currency): number {
  const override = plan.prices?.[currency];
  if (typeof override === "number" && Number.isFinite(override)) return override;
  return plan.price;
}

export const TRIAL_DAYS = 14;

export function trialDaysLeft(endsAt: Date | null | undefined) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000));
}

export function limitLabel(limit: number | null) {
  return limit === null ? "Unlimited" : String(limit);
}
