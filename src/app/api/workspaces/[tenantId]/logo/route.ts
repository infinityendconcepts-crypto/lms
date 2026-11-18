import { readFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { atLeast } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { extensionOf, removeUpload, resolveStoragePath, saveUpload } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LogoContext = { params: Promise<{ tenantId: string }> };

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
};

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function asText(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function looksLikeImage(ext: string, head: Uint8Array) {
  if (ext === "png") {
    return asText(head, 0, 4) === "\x89PNG" && asText(head, 4, 8) === "\r\n\x1a\n";
  }
  if (ext === "jpg" || ext === "jpeg") {
    return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  }
  if (ext === "gif") {
    const tag = asText(head, 0, 6);
    return tag === "GIF87a" || tag === "GIF89a";
  }
  if (ext === "webp") {
    return asText(head, 0, 4) === "RIFF" && asText(head, 8, 12) === "WEBP";
  }
  if (ext === "avif") {
    const brand = asText(head, 8, 12);
    return asText(head, 4, 8) === "ftyp" && (brand === "avif" || brand === "avis");
  }
  if (ext === "svg") {
    return /<svg[\s>]/i.test(new TextDecoder().decode(head));
  }
  return false;
}

async function validateLogo(file: File) {
  const ext = extensionOf(file.name);
  const mimeType = LOGO_MIME[ext];
  if (!mimeType) throw new Error("Upload a PNG, JPG, WEBP, GIF, AVIF or SVG image.");
  if (file.size > MAX_LOGO_BYTES) throw new Error("Logo must be 5 MB or smaller.");
  if (file.type && file.type !== mimeType) {
    throw new Error("The file type does not match its image format.");
  }

  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (!looksLikeImage(ext, head)) throw new Error("That file is not a valid image.");
  return mimeType;
}

type AuthSuccess = { session: NonNullable<Awaited<ReturnType<typeof getSession>>> };
type AuthFailure = { error: string; status: number };

async function authorize(tenantId: string): Promise<AuthSuccess | AuthFailure> {
  const session = await getSession();
  if (!session) return { error: "Sign in required", status: 401 } as const;

  if (session.user.isSuperAdmin) return { session } as const;

  const membership = await db.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId: session.user.id } },
    select: { role: true, status: true },
  });
  if (!membership || membership.status !== "ACTIVE" || !atLeast(membership.role, "ADMIN")) {
    return { error: "Only workspace admins can change the logo", status: 403 } as const;
  }
  return { session } as const;
}

function refreshLogoViews() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings");
  revalidatePath("/admin");
}

export async function GET(_req: Request, { params }: LogoContext) {
  const { tenantId } = await params;
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { logoStorageKey: true, logoMimeType: true },
  });
  if (!tenant?.logoStorageKey) return new NextResponse("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readFile(resolveStoragePath(tenant.logoStorageKey));
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = extensionOf(tenant.logoStorageKey);
  const mimeType = LOGO_MIME[ext] ?? tenant.logoMimeType ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": mimeType,
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Content-Disposition": `inline; filename="workspace-logo.${ext}"`,
    "X-Content-Type-Options": "nosniff",
  };
  if (mimeType === "image/svg+xml") {
    headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }

  return new NextResponse(new Uint8Array(bytes), { headers });
}

export async function POST(req: Request, { params }: LogoContext) {
  const { tenantId } = await params;
  const auth = await authorize(tenantId);
  if ("error" in auth) return fail(auth.error, auth.status);

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, logoStorageKey: true },
  });
  if (!tenant) return fail("Workspace not found", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Upload a logo file.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose an image to upload.", 400);

  let mimeType: string;
  try {
    mimeType = await validateLogo(file);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Invalid image.", 400);
  }

  const uploaded = await saveUpload(file);
  const logoUrl = `/api/workspaces/${tenantId}/logo`;
  try {
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        logoUrl,
        logoStorageKey: uploaded.storageKey,
        logoMimeType: mimeType,
        logoUpdatedAt: new Date(),
      },
    });
  } catch (e) {
    await removeUpload(uploaded.storageKey);
    throw e;
  }
  if (tenant.logoStorageKey && tenant.logoStorageKey !== uploaded.storageKey) {
    await removeUpload(tenant.logoStorageKey);
  }

  await audit({
    tenantId,
    actorId: auth.session.user.id,
    action: "workspace.logo.updated",
    target: tenantId,
    meta: { name: uploaded.name, size: uploaded.size, mimeType },
  });
  refreshLogoViews();
  return NextResponse.json({ ok: true, url: logoUrl });
}

export async function DELETE(_req: Request, { params }: LogoContext) {
  const { tenantId } = await params;
  const auth = await authorize(tenantId);
  if ("error" in auth) return fail(auth.error, auth.status);

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, logoStorageKey: true },
  });
  if (!tenant) return fail("Workspace not found", 404);

  await db.tenant.update({
    where: { id: tenantId },
    data: { logoUrl: null, logoStorageKey: null, logoMimeType: null, logoUpdatedAt: new Date() },
  });
  if (tenant.logoStorageKey) await removeUpload(tenant.logoStorageKey);

  await audit({
    tenantId,
    actorId: auth.session.user.id,
    action: "workspace.logo.removed",
    target: tenantId,
  });
  refreshLogoViews();
  return NextResponse.json({ ok: true, url: null });
}
