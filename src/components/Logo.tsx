import { cn } from "@/lib/utils";

export function Logo({
  size = "md",
  className,
  tenantName,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  tenantName?: string;
}) {
  const dims = { sm: "size-8 rounded-lg text-sm", md: "size-9 rounded-xl text-base", lg: "size-12 rounded-2xl text-xl" };
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-brand-500 via-brand-600 to-violet-600 font-bold text-white shadow-md shadow-brand-600/25",
          dims[size]
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-[55%]" aria-hidden>
          <path
            d="M4 17.5 10.2 5.5a2 2 0 0 1 3.6 0L20 17.5M7.4 12.4h9.2"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {tenantName ? (
        <span className="truncate text-[15px] font-bold tracking-tight text-slate-900">{tenantName}</span>
      ) : (
        <span className="text-[17px] font-bold tracking-[-0.02em] text-slate-900">
          Axiom<span className="text-brand-600">.</span>
        </span>
      )}
    </span>
  );
}
