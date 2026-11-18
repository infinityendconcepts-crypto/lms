import Link from "next/link";
import type { ReactNode } from "react";
import { cn, initials } from "@/lib/utils";

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return <Tag className={cn("card", className)}>{children}</Tag>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          {icon}
        </div>
      )}
      <p className="font-semibold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <p className="stat-label">{label}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <p className="stat-value">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
  className,
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "brand" | "sky";
  className?: string;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-rose-50 text-rose-700",
    brand: "bg-brand-50 text-brand-700",
    sky: "bg-sky-50 text-sky-700",
  };
  return <span className={cn("badge", tones[tone], className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "slate" | "green" | "amber" | "red" | "brand" | "sky"> = {
    DRAFT: "slate",
    PUBLISHED: "green",
    ARCHIVED: "slate",
    CLOSED: "slate",
    ACTIVE: "green",
    TRIALING: "amber",
    PAST_DUE: "red",
    CANCELED: "red",
    IN_PROGRESS: "amber",
    SUBMITTED: "sky",
    GRADED: "green",
    SUSPENDED: "red",
  };
  const labels: Record<string, string> = {
    DRAFT: "Draft",
    PUBLISHED: "Published",
    ARCHIVED: "Archived",
    CLOSED: "Closed",
    ACTIVE: "Active",
    TRIALING: "Trial",
    PAST_DUE: "Past due",
    CANCELED: "Canceled",
    IN_PROGRESS: "In progress",
    SUBMITTED: "Needs grading",
    GRADED: "Graded",
    SUSPENDED: "Suspended",
  };
  return <Badge tone={map[status] ?? "slate"}>{labels[status] ?? status}</Badge>;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Avatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "size-8 text-[11px]", md: "size-10 text-xs", lg: "size-14 text-base" };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-violet-500 font-semibold text-white ring-2 ring-white",
        sizes[size]
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        initials(name) || "?"
      )}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs leading-5 text-slate-500">{hint}</p>}
    </div>
  );
}

export function Tabs({
  items,
  current,
}: {
  items: { href: string; label: string; count?: number }[];
  current: string;
}) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium whitespace-nowrap transition",
            item.href === current
              ? "bg-brand-50 text-brand-700"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">
              {item.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

export function PanelHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-slate-200" />
      {label && <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>}
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
