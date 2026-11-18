import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSession, TENANT_COOKIE } from "@/lib/auth";
import { saveUpload, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { atLeast } from "@/lib/tenant";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jar = await cookies();
  const tenantId = jar.get(TENANT_COOKIE)?.value;
  if (!tenantId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const membership = await db.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId: session.user.id } },
  });
  if (!membership || !atLeast(membership.role, "TEACHER")) {
    return NextResponse.json({ error: "Only teachers can upload files" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file supplied" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)` },
      { status: 413 }
    );
  }

  let courseId: string | null = null;
  let lessonId: string | null = null;
  const rawCourse = String(form.get("courseId") ?? "");
  const rawLesson = String(form.get("lessonId") ?? "");

  if (rawCourse) {
    const course = await db.course.findFirst({ where: { id: rawCourse, tenantId } });
    if (course) courseId = course.id;
  }
  if (rawLesson) {
    const lesson = await db.lesson.findFirst({
      where: { id: rawLesson, course: { tenantId } },
      include: { course: true },
    });
    if (lesson) {
      lessonId = lesson.id;
      courseId = lesson.courseId;
    }
  }

  try {
    const stored = await saveUpload(file);
    const attachment = await db.attachment.create({
      data: {
        tenantId,
        courseId,
        lessonId,
        uploadedById: session.user.id,
        name: stored.name,
        mimeType: stored.mimeType,
        size: stored.size,
        storageKey: stored.storageKey,
        kind: stored.kind,
      },
    });
    await audit({
      tenantId,
      actorId: session.user.id,
      action: "file.uploaded",
      target: attachment.id,
      meta: { name: stored.name, size: stored.size },
    });
    return NextResponse.json({
      id: attachment.id,
      url: `/api/files/${attachment.id}?name=${encodeURIComponent(attachment.name)}`,
      name: attachment.name,
      kind: attachment.kind,
      size: attachment.size,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 400 }
    );
  }
}
