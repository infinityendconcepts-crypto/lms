"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { dayBounds, isAttendanceStatus, registerDate } from "@/lib/attendance";

export async function createAttendanceSessionAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "").trim();
  const course = await db.course.findFirst({
    where: { id: courseId, tenantId: ctx.tenant.id },
    select: { id: true, title: true },
  });
  if (!course) redirect("/dashboard/attendance?error=Choose+a+course+for+this+register");

  const date = registerDate(String(formData.get("date") ?? ""));
  const { start, end } = dayBounds(date);

  const existing = await db.attendanceSession.findFirst({
    where: {
      tenantId: ctx.tenant.id,
      courseId,
      date: { gte: start, lt: end },
    },
    select: { id: true },
  });
  if (existing) redirect(`/dashboard/attendance/${existing.id}?existing=1`);

  const lessonIdRaw = String(formData.get("lessonId") ?? "").trim();
  const lesson = lessonIdRaw
    ? await db.lesson.findFirst({
        where: { id: lessonIdRaw, courseId },
        select: { id: true, title: true },
      })
    : null;

  const title = String(formData.get("title") ?? "").trim() || lesson?.title || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const roster = await db.enrollment.findMany({
    where: { courseId, status: "ACTIVE" },
    select: { userId: true },
  });

  const session = await db.attendanceSession.create({
    data: {
      tenantId: ctx.tenant.id,
      courseId,
      lessonId: lesson?.id ?? null,
      title,
      date,
      notes,
      createdById: ctx.user.id,
      records: roster.length
        ? {
            create: roster.map((r) => ({
              studentId: r.userId,
              status: "PRESENT",
              markedById: ctx.user.id,
            })),
          }
        : undefined,
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "attendance.created",
    target: session.id,
    meta: { courseId, course: course.title, date: date.toISOString(), roster: roster.length },
  });

  revalidatePath("/dashboard/attendance");
  redirect(`/dashboard/attendance/${session.id}?created=1`);
}

export async function saveAttendanceAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const session = await db.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: ctx.tenant.id },
    include: {
      course: { select: { id: true, enrollments: { select: { userId: true } } } },
      records: { select: { studentId: true } },
    },
  });
  if (!session) redirect("/dashboard/attendance?error=Register+not+found");

  // Only learners currently enrolled in the course, or already on this
  // register, can be marked. This blocks cross-tenant / arbitrary user IDs.
  const allowed = new Set<string>([
    ...session.course.enrollments.map((e) => e.userId),
    ...session.records.map((r) => r.studentId),
  ]);

  const marks = new Map<string, { status: string; note: string | null }>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("status_")) continue;
    const studentId = key.slice("status_".length);
    if (!allowed.has(studentId)) continue;
    const status = String(value);
    if (!isAttendanceStatus(status)) continue;
    marks.set(studentId, {
      status,
      note: String(formData.get(`note_${studentId}`) ?? "").trim().slice(0, 240) || null,
    });
  }

  if (marks.size === 0) {
    redirect(`/dashboard/attendance/${sessionId}?error=No+learners+to+mark`);
  }

  await db.$transaction(
    [...marks.entries()].map(([studentId, mark]) =>
      db.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId } },
        create: {
          sessionId,
          studentId,
          status: mark.status,
          note: mark.note,
          markedById: ctx.user.id,
        },
        update: { status: mark.status, note: mark.note, markedById: ctx.user.id },
      })
    )
  );

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "attendance.marked",
    target: sessionId,
    meta: {
      courseId: session.courseId,
      marks: Object.fromEntries([...marks.entries()].map(([id, m]) => [id, m.status])),
    },
  });

  revalidatePath(`/dashboard/attendance/${sessionId}`);
  revalidatePath("/dashboard/attendance");
  redirect(`/dashboard/attendance/${sessionId}?saved=1`);
}

export async function updateAttendanceSessionAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const session = await db.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: ctx.tenant.id },
    include: { course: { select: { id: true, title: true } } },
  });
  if (!session) redirect("/dashboard/attendance?error=Register+not+found");

  const date = registerDate(String(formData.get("date") ?? ""));
  const lessonIdRaw = String(formData.get("lessonId") ?? "").trim();
  const lesson = lessonIdRaw
    ? await db.lesson.findFirst({ where: { id: lessonIdRaw, courseId: session.courseId }, select: { id: true } })
    : null;

  await db.attendanceSession.update({
    where: { id: sessionId },
    data: {
      date,
      lessonId: lesson?.id ?? null,
      title: String(formData.get("title") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim().slice(0, 500) || null,
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "attendance.updated",
    target: sessionId,
    meta: { courseId: session.courseId, title: session.course.title },
  });

  revalidatePath(`/dashboard/attendance/${sessionId}`);
  revalidatePath("/dashboard/attendance");
  redirect(`/dashboard/attendance/${sessionId}?saved=1`);
}

export async function deleteAttendanceSessionAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const session = await db.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: ctx.tenant.id },
    include: { course: { select: { title: true } } },
  });
  if (!session) redirect("/dashboard/attendance?error=Register+not+found");

  await db.attendanceSession.delete({ where: { id: sessionId } });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "attendance.deleted",
    target: sessionId,
    meta: { courseId: session.courseId, course: session.course.title },
  });

  revalidatePath("/dashboard/attendance");
  redirect("/dashboard/attendance?deleted=1");
}
