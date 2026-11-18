import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { resolveStoragePath } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new NextResponse("Sign in required", { status: 401 });

  const attachment = await db.attachment.findUnique({
    where: { id },
    include: { lesson: true, course: true },
  });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const membership = await db.membership.findUnique({
    where: {
      tenantId_userId: { tenantId: attachment.tenantId, userId: session.user.id },
    },
  });
  if (!membership) return new NextResponse("Not found", { status: 404 });

  if (membership.role === "STUDENT") {
    const courseId = attachment.courseId ?? attachment.lesson?.courseId ?? null;
    if (courseId) {
      const enrollment = await db.enrollment.findUnique({
        where: { courseId_userId: { courseId, userId: session.user.id } },
      });
      if (!enrollment) return new NextResponse("Not enrolled", { status: 403 });
    }
  }

  try {
    const bytes = await readFile(resolveStoragePath(attachment.storageKey));
    const inline =
      attachment.kind === "image" ||
      attachment.kind === "video" ||
      attachment.kind === "audio" ||
      attachment.mimeType === "application/pdf" ||
      attachment.mimeType.startsWith("text/");

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(
          attachment.name
        )}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:",
      },
    });
  } catch {
    return new NextResponse("File missing from storage", { status: 410 });
  }
}
