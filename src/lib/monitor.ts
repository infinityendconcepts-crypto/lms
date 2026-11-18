export const MONITOR_TYPES = ["SPONSOR", "COMPANY", "PARENT"] as const;

export type MonitorType = (typeof MONITOR_TYPES)[number];

export const MONITOR_TYPE_LABELS: Record<MonitorType, string> = {
  SPONSOR: "Sponsor",
  COMPANY: "Company",
  PARENT: "Parent",
};

const MONITOR_TYPE_TONES: Record<MonitorType, "brand" | "sky" | "green"> = {
  SPONSOR: "brand",
  COMPANY: "sky",
  PARENT: "green",
};

export function isMonitorType(value: unknown): value is MonitorType {
  return typeof value === "string" && (MONITOR_TYPES as readonly string[]).includes(value);
}

export function monitorType(value?: string | null): MonitorType {
  return isMonitorType(value) ? value : "SPONSOR";
}

export function monitorTypeLabel(value?: string | null) {
  return MONITOR_TYPE_LABELS[monitorType(value)];
}

export function monitorTypeTone(value?: string | null) {
  return MONITOR_TYPE_TONES[monitorType(value)];
}
