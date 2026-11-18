"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { switchTenantAction } from "@/lib/actions/tenant";

export function TenantSwitcher({
  memberships,
  activeId,
}: {
  memberships: { tenantId: string; name: string; role: string; kind: string }[];
  activeId: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (memberships.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5">
      {pending && <Loader2 className="size-3.5 animate-spin text-slate-400" />}
      <select
        aria-label="Switch workspace"
        className="max-w-[190px] truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-brand-400 focus:outline-none"
        value={activeId}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(async () => {
            await switchTenantAction(id);
            router.refresh();
          });
        }}
      >
        {memberships.map((m) => (
          <option key={m.tenantId} value={m.tenantId}>
            {m.name} · {m.role.toLowerCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
