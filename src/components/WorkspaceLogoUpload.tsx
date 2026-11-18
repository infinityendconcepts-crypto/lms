"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { WorkspaceLogo, workspaceLogoUrl, type LogoTenant } from "@/components/WorkspaceLogo";
import { cn } from "@/lib/utils";

export function WorkspaceLogoUpload({
  tenant,
  compact = false,
}: {
  tenant: LogoTenant & { id: string };
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [hasLogo, setHasLogo] = useState(Boolean(tenant.logoUrl));
  const [version, setVersion] = useState(() => Date.now());

  const previewTenant = {
    ...tenant,
    logoUrl: hasLogo ? tenant.logoUrl : null,
    updatedAt: version,
  };
  const previewUrl = workspaceLogoUrl(previewTenant);

  async function upload() {
    if (!selected || busy) return;
    setBusy("upload");
    setError("");
    setMessage("");
    const body = new FormData();
    body.set("file", selected);

    try {
      const res = await fetch(`/api/workspaces/${tenant.id}/logo`, { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "The logo could not be uploaded.");
        return;
      }
      setHasLogo(true);
      setVersion(Date.now());
      setSelected(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Logo updated.");
      router.refresh();
    } catch {
      setError("The logo could not be uploaded. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy("remove");
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/workspaces/${tenant.id}/logo`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "The logo could not be removed.");
        return;
      }
      setHasLogo(false);
      setVersion(Date.now());
      setSelected(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Logo removed. Showing workspace initials instead.");
      router.refresh();
    } catch {
      setError("The logo could not be removed. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white",
        compact ? "p-3" : "p-4"
      )}
    >
      <div className="flex items-center gap-3">
        <WorkspaceLogo
          tenant={previewTenant}
          size={compact ? "sm" : "md"}
          className="border border-slate-200"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-900">Workspace logo</p>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
            PNG, JPG, WEBP, GIF, AVIF or SVG · max 5 MB
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          setError("");
          setMessage("");
          setSelected(e.target.files?.[0] ?? null);
        }}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={Boolean(busy)}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-3.5" /> Choose image
        </button>
        {selected && (
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={Boolean(busy)}
            onClick={upload}
          >
            {busy === "upload" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Upload logo
          </button>
        )}
        {hasLogo && (
          <button
            type="button"
            className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            disabled={Boolean(busy)}
            onClick={remove}
          >
            {busy === "remove" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Remove
          </button>
        )}
      </div>

      {selected && (
        <p className="mt-2 truncate text-[10px] text-slate-400">Selected: {selected.name}</p>
      )}
      {error && <p className="mt-2 text-[11px] font-medium text-rose-600">{error}</p>}
      {message && !error && (
        <p className="mt-2 text-[11px] font-medium text-emerald-600">{message}</p>
      )}
      {previewUrl && (
        <p className="mt-2 text-[10px] text-slate-400">
          Visible in the dashboard, invitations and workspace switcher.
        </p>
      )}
    </div>
  );
}
