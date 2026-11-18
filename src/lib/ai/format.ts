/** Risk bands shared by the analytics engine and the UI. */

export const RISK_BANDS = ["ON_TRACK", "WATCH", "AT_RISK", "CRITICAL"] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

export type RiskMeta = {
  label: string;
  tone: "green" | "amber" | "red" | "sky";
  bar: string;
  text: string;
  description: string;
};

export const RISK_META: Record<RiskBand, RiskMeta> = {
  ON_TRACK: {
    label: "On track",
    tone: "green",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
    description: "Strong signals across attendance, grades and submission habits.",
  },
  WATCH: {
    label: "Watch",
    tone: "amber",
    bar: "bg-amber-500",
    text: "text-amber-700",
    description: "Broadly steady, with one or two signals worth checking.",
  },
  AT_RISK: {
    label: "At risk",
    tone: "red",
    bar: "bg-orange-500",
    text: "text-orange-700",
    description: "Multiple signals suggest the learner needs support soon.",
  },
  CRITICAL: {
    label: "Critical",
    tone: "red",
    bar: "bg-rose-600",
    text: "text-rose-700",
    description: "Urgent: attendance, grades or engagement have broken down.",
  },
};

export function riskBandFor(probability: number): RiskBand {
  if (probability >= 75) return "ON_TRACK";
  if (probability >= 60) return "WATCH";
  if (probability >= 40) return "AT_RISK";
  return "CRITICAL";
}

export function asRiskBand(value: unknown): RiskBand {
  return RISK_BANDS.includes(value as RiskBand) ? (value as RiskBand) : "WATCH";
}
