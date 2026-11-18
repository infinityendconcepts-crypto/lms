import { cn } from "@/lib/utils";
import { WorkspaceLogo, type LogoTenant } from "@/components/WorkspaceLogo";

export function Logo({
  size = "md",
  className,
  tenant,
  inverted = false,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  tenant?: LogoTenant;
  inverted?: boolean;
}) {
  const dims = {
    sm: "size-8 rounded-lg",
    md: "size-9 rounded-xl",
    lg: "size-12 rounded-2xl",
  }[size];
  const textClass = inverted ? "text-white" : "text-slate-900";
  const accentClass = inverted ? "text-indigo-300" : "text-brand-600";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {tenant ? (
        <WorkspaceLogo tenant={tenant} size={size} />
      ) : (
        <span
          className={cn(
            "relative inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-brand-500 via-brand-600 to-violet-600 font-bold text-white shadow-md shadow-brand-600/25",
            dims
          )}
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-[60%]" aria-hidden>
            <path
              d="M12 2.5 13.95 9.1 20.5 11.05 13.95 13 12 19.5 10.05 13 3.5 11.05 10.05 9.1 12 2.5Z"
              fill="currentColor"
            />
            <path d="M19 17.5 19.6 19.4 21.5 20 19.6 20.6 19 22.5 18.4 20.6 16.5 20 18.4 19.4 19 17.5Z" fill="currentColor" opacity=".75" />
          </svg>
        </span>
      )}
      <span
        className={cn(
          "truncate font-bold tracking-[-0.02em]",
          size === "lg" ? "text-[19px]" : "text-[15px]",
          tenant ? textClass : inverted ? "text-white" : "text-slate-900"
        )}
      >
        {tenant ? (
          tenant.name
        ) : (
          <>
            Nkanyezi<span className={accentClass}> LMS</span>
          </>
        )}
      </span>
    </span>
  );
}
