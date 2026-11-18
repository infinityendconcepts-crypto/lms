import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { resolveStoragePath } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  req: Request,
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

  if (membership.role === "MONITOR") {
    return new NextResponse("Not found", { status: 404 });
  }

  if (membership.role === "STUDENT") {
    const courseId = attachment.courseId ?? attachment.lesson?.courseId ?? null;
    if (courseId) {
      const enrollment = await db.enrollment.findUnique({
        where: { courseId_userId: { courseId, userId: session.user.id } },
      });
      if (!enrollment) return new NextResponse("Not enrolled", { status: 403 });
    }
  }

  const inline =
    attachment.kind === "image" ||
    attachment.kind === "video" ||
    attachment.kind === "audio" ||
    attachment.mimeType === "application/pdf" ||
    attachment.mimeType.startsWith("text/");
  const headers: Record<string, string> = {
    "Content-Type": attachment.mimeType || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(
      attachment.name
    )}"`,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:",
  };

  const filePath = resolveStoragePath(attachment.storageKey);
  try {
    const range = req.headers.get("range");
    if (range && /^bytes=/.test(range)) {
      const info = await stat(filePath);
      const size = info.size;
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (!match) {
        return new NextResponse(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${size}` },
        });
      }

      let start: number;
      let end: number;
      if (!match[1] && match[2]) {
        // Suffix range: the last N bytes.
        start = Math.max(0, size - Number(match[2]));
        end = size - 1;
      } else {
        start = Number(match[1] || 0);
        end = match[2] ? Number(match[2]) : size - 1;
      }

      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= size) {
        return new NextResponse(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${size}` },
        });
      }
      end = Math.min(end, size - 1);

      const bytes = await readFile(filePath);
      const slice = bytes.subarray(start, end + 1);
      return new NextResponse(new Uint8Array(slice), {
        status: 206,
        headers: {
          ...headers,
          "Content-Length": String(slice.byteLength),
          "Content-Range": `bytes ${start}-${end}/${size}`,
        },
      });
    }

    const bytes = await readFile(filePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { ...headers, "Content-Length": String(bytes.byteLength) },
    });
  } catch {
    return new NextResponse("File missing from storage", { status: 410 });
  }
}
