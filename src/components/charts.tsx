import { cn } from "@/lib/utils";

export type BarDatum = {
  label: string;
  value: number;
  color?: string;
  secondary?: number;
};

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function ChartCard({
  title,
  subtitle,
  children,
  className,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("card p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h2>
          {subtitle ? <p className="mt-1 text-[11px] text-slate-400">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function BarChart({
  data,
  max = 100,
  valueSuffix = "%",
  height = 160,
  empty = "No data to chart yet.",
  colorClass = "bg-brand-500",
}: {
  data: BarDatum[];
  max?: number;
  valueSuffix?: string;
  height?: number;
  empty?: string;
  colorClass?: string;
}) {
  if (!data.length || data.every((d) => d.value <= 0)) {
    return <p className="text-sm text-slate-400">{empty}</p>;
  }
  const ceiling = Math.max(max, ...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-semibold tabular-nums text-slate-600">
            {Math.round(d.value)}
            {valueSuffix}
          </span>
          <div className="flex w-full items-end justify-center" style={{ height: height - 34 }}>
            <div
              className={cn("w-full max-w-10 rounded-t-lg transition-all", d.color || colorClass)}
              style={{ height: `${Math.max(6, (d.value / ceiling) * 100)}%` }}
              title={`${d.label}: ${Math.round(d.value)}${valueSuffix}`}
            />
          </div>
          <span className="w-full truncate text-center text-[10px] text-slate-500" title={d.label}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function HorizontalBarChart({
  data,
  max = 100,
  valueSuffix = "%",
  empty = "No data to chart yet.",
}: {
  data: BarDatum[];
  max?: number;
  valueSuffix?: string;
  empty?: string;
}) {
  if (!data.length) {
    return <p className="text-sm text-slate-400">{empty}</p>;
  }
  const ceiling = Math.max(max, ...data.map((d) => Math.max(d.value, d.secondary ?? 0)), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
          <span className="truncate text-[11px] font-medium text-slate-600" title={d.label}>
            {d.label}
          </span>
          <div className="space-y-1">
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full", d.color || "bg-brand-500")}
                style={{ width: `${clampPercent((d.value / ceiling) * 100)}%` }}
                title={`${d.label}: ${Math.round(d.value)}${valueSuffix}`}
              />
            </div>
            {typeof d.secondary === "number" ? (
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${clampPercent((d.secondary / ceiling) * 100)}%` }}
                  title={`${d.label} (secondary): ${Math.round(d.secondary)}${valueSuffix}`}
                />
              </div>
            ) : null}
          </div>
          <span className="text-right text-[10px] font-semibold tabular-nums text-slate-600">
            {Math.round(d.value)}
            {valueSuffix}
            {typeof d.secondary === "number" ? ` / ${Math.round(d.secondary)}${valueSuffix}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({
  segments,
  size = 148,
  thickness = 18,
  centerLabel,
  centerValue,
  empty = "No data yet.",
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  empty?: string;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (total <= 0) {
    return <p className="text-sm text-slate-400">{empty}</p>;
  }
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const lengths = segments.map((segment) => (Math.max(0, segment.value) / total) * circumference);
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={thickness}
            className="text-slate-100"
          />
          {segments.map((segment, index) => {
            const value = Math.max(0, segment.value);
            const length = lengths[index] ?? 0;
            const offset = lengths.slice(0, index).reduce((sum, current) => sum + current, 0);
            return (
              <circle
                key={segment.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={thickness}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                className={segment.color}
              >
                <title>{`${segment.label}: ${value}`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue ? <span className="text-xl font-bold text-slate-900">{centerValue}</span> : null}
          {centerLabel ? <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{centerLabel}</span> : null}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-[11px] text-slate-600 sm:flex-col sm:items-start">
        {segments.map((segment) => (
          <span key={segment.label} className="flex items-center gap-1.5">
            <i className={cn("size-2.5 rounded-full bg-current", segment.color)} />
            <span>{segment.label}</span>
            <span className="font-semibold tabular-nums text-slate-800">{segment.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ScoreDistributionChart({
  scores,
  bins = [0, 40, 50, 60, 70, 85, 101],
  labels = ["0–39", "40–49", "50–59", "60–69", "70–84", "85–100"],
  colors = ["bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500", "bg-teal-500"],
}: {
  scores: number[];
  bins?: number[];
  labels?: string[];
  colors?: string[];
}) {
  if (!scores.length) {
    return <p className="text-sm text-slate-400">No scored attempts yet.</p>;
  }
  const counts = labels.map(() => 0);
  for (const score of scores) {
    const s = clampPercent(score);
    let placed = false;
    for (let i = 0; i < labels.length; i++) {
      const lo = bins[i] ?? 0;
      const hi = bins[i + 1] ?? 101;
      if (s >= lo && s < hi) {
        counts[i] += 1;
        placed = true;
        break;
      }
    }
    if (!placed) counts[counts.length - 1] += 1;
  }
  const maxCount = Math.max(1, ...counts);
  return (
    <div className="flex items-end gap-2" style={{ height: 150 }}>
      {counts.map((count, i) => (
        <div key={labels[i]} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-semibold tabular-nums text-slate-600">{count}</span>
          <div className="flex w-full items-end justify-center" style={{ height: 100 }}>
            <div
              className={cn("w-full max-w-10 rounded-t-lg", colors[i] || "bg-brand-500")}
              style={{ height: `${Math.max(count > 0 ? 8 : 2, (count / maxCount) * 100)}%`, opacity: count > 0 ? 1 : 0.25 }}
              title={`${labels[i]}: ${count} attempt${count === 1 ? "" : "s"}`}
            />
          </div>
          <span className="w-full truncate text-center text-[9px] leading-tight text-slate-500" title={labels[i]}>
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
}
