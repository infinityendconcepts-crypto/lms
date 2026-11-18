import { cn, initials } from "@/lib/utils";

export type LogoTenant = {
  id?: string;
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  updatedAt?: string | number | Date | null;
};

/** Add a version query so a freshly uploaded logo is never served from cache. */
export function workspaceLogoUrl(tenant: Pick<LogoTenant, "logoUrl" | "updatedAt">) {
  if (!tenant.logoUrl) return null;
  if (!tenant.logoUrl.startsWith("/api/workspaces/")) return tenant.logoUrl;

  const version = tenant.updatedAt ? new Date(tenant.updatedAt).getTime() : Number.NaN;
  if (!Number.isFinite(version)) return tenant.logoUrl;
  return `${tenant.logoUrl}${tenant.logoUrl.includes("?") ? "&" : "?"}v=${version}`;
}

export function WorkspaceLogo({
  tenant,
  size = "md",
  className,
  alt = "",
}: {
  tenant: LogoTenant;
  size?: "sm" | "md" | "lg";
  className?: string;
  alt?: string;
}) {
  const dims = {
    sm: "size-8 rounded-lg text-[10px]",
    md: "size-10 rounded-xl text-xs",
    lg: "size-12 rounded-2xl text-sm",
  }[size];
  const url = workspaceLogoUrl(tenant);

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        className={cn(dims, "shrink-0 bg-white object-cover", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        dims,
        "inline-flex shrink-0 items-center justify-center font-bold text-white shadow-sm",
        className
      )}
      style={{ background: tenant.brandColor || "#4f46e5" }}
      aria-hidden={alt === ""}
    >
      {initials(tenant.name) || "NK"}
    </span>
  );
}
