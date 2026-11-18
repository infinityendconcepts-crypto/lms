/** Shared metadata for course-plan Kanban columns and Gantt bars. */

export const PLAN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "MET"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type PlanPriority = (typeof PLAN_PRIORITIES)[number];

export type PlanStatusMeta = {
  label: string;
  short: string;
  description: string;
  tone: "slate" | "amber" | "green";
  dot: string;
  bar: string;
  soft: string;
};

export const PLAN_STATUS_META: Record<PlanStatus, PlanStatusMeta> = {
  NOT_STARTED: {
    label: "Not yet done",
    short: "Not started",
    description: "Planned but not started",
    tone: "slate",
    dot: "bg-slate-400",
    bar: "bg-slate-400",
    soft: "bg-slate-50",
  },
  IN_PROGRESS: {
    label: "In progress",
    short: "In progress",
    description: "Actively being worked on",
    tone: "amber",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    soft: "bg-amber-50/70",
  },
  MET: {
    label: "Met",
    short: "Met",
    description: "Completed and signed off",
    tone: "green",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    soft: "bg-emerald-50/70",
  },
};

export const PLAN_PRIORITY_META: Record<PlanPriority, { label: string; tone: "slate" | "amber" | "red" }> = {
  LOW: { label: "Low", tone: "slate" },
  MEDIUM: { label: "Medium", tone: "amber" },
  HIGH: { label: "High", tone: "red" },
};

export function isPlanStatus(value: string): value is PlanStatus {
  return (PLAN_STATUSES as readonly string[]).includes(value);
}

export function isPlanPriority(value: string): value is PlanPriority {
  return (PLAN_PRIORITIES as readonly string[]).includes(value);
}

export function planStatusFrom(value: string | null | undefined, fallback: PlanStatus = "NOT_STARTED"): PlanStatus {
  const candidate = String(value ?? "");
  return isPlanStatus(candidate) ? candidate : fallback;
}

export function planPriorityFrom(
  value: string | null | undefined,
  fallback: PlanPriority = "MEDIUM"
): PlanPriority {
  const candidate = String(value ?? "");
  return isPlanPriority(candidate) ? candidate : fallback;
}
