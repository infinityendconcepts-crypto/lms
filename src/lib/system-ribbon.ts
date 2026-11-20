import "server-only";

import { db } from "@/lib/db";

export const SYSTEM_RIBBON_KEY = "system_ribbon";

export type SystemRibbonTone = "info" | "warning" | "success";

export type SystemRibbon = {
  enabled: boolean;
  message: string;
  tone: SystemRibbonTone;
  linkLabel?: string;
  linkHref?: string;
};

const DEFAULT_RIBBON: SystemRibbon = {
  enabled: false,
  message: "",
  tone: "info",
};

function normalizeTone(value: unknown): SystemRibbonTone {
  return value === "warning" || value === "success" || value === "info" ? value : "info";
}

export async function getSystemRibbon(): Promise<SystemRibbon> {
  try {
    const row = await db.platformSetting.findUnique({ where: { key: SYSTEM_RIBBON_KEY } });
    if (!row?.value) return DEFAULT_RIBBON;
    const parsed = JSON.parse(row.value) as Partial<SystemRibbon> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_RIBBON;
    const message = typeof parsed.message === "string" ? parsed.message.trim() : "";
    const linkLabel = typeof parsed.linkLabel === "string" ? parsed.linkLabel.trim() : "";
    const linkHref = typeof parsed.linkHref === "string" ? parsed.linkHref.trim() : "";
    return {
      enabled: Boolean(parsed.enabled) && message.length > 0,
      message,
      tone: normalizeTone(parsed.tone),
      ...(linkLabel ? { linkLabel } : {}),
      ...(linkHref ? { linkHref } : {}),
    };
  } catch {
    return DEFAULT_RIBBON;
  }
}
