import Link from "next/link";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SystemRibbon as RibbonConfig } from "@/lib/system-ribbon";

const toneStyles = {
  info: "border-brand-200 bg-brand-600 text-white",
  warning: "border-amber-300 bg-amber-500 text-amber-950",
  success: "border-emerald-300 bg-emerald-600 text-white",
} as const;

export function SystemRibbon({ ribbon }: { ribbon: RibbonConfig }) {
  if (!ribbon.enabled || !ribbon.message.trim()) return null;
  const tone = toneStyles[ribbon.tone] ?? toneStyles.info;
  const link =
    ribbon.linkHref && ribbon.linkLabel ? (
      /^https?:\/\//i.test(ribbon.linkHref) ? (
        <a
          href={ribbon.linkHref}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline decoration-white/50 underline-offset-2 hover:decoration-white"
        >
          {ribbon.linkLabel}
        </a>
      ) : (
        <Link
          href={ribbon.linkHref}
          className="font-semibold underline decoration-white/50 underline-offset-2 hover:decoration-white"
        >
          {ribbon.linkLabel}
        </Link>
      )
    ) : null;

  return (
    <div className={cn("relative z-[60] border-b px-4 py-2 text-sm", tone)} role="status" aria-live="polite">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 text-center sm:gap-3">
        <Megaphone className="size-4 shrink-0 opacity-90" aria-hidden />
        <p className="min-w-0 leading-5">
          <span className="font-semibold">System update:</span>{" "}
          <span>{ribbon.message}</span>
          {link ? <span className="ml-2">{link}</span> : null}
        </p>
      </div>
    </div>
  );
}
