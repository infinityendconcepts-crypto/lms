"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { getPlanState } from "@/lib/usage";
import { removeUpload } from "@/lib/storage";
import {
  blocksToCodePadId,
  blocksToMarkdown,
  blocksToMeetingUrl,
  parseLessonBlocks,
  sanitizeBlocksForSave,
} from "@/lib/lesson-blocks";
import { getLessonLockReason, hasPrerequisiteCycle } from "@/lib/lesson-access";
import { nowMs } from "@/lib/utils";

async function courseInTenant(courseId: string, tenantId: string) {
  const course = await db.course.findFirst({ where: { id: courseId, tenantId } });
  if (!course) throw new Error("Course not found");
  return course;
}

async function lessonCodePadId({
  courseId,
  tenantId,
  formData,
}: {
  courseId: string;
  tenantId: string;
  formData: FormData;
}) {
  const codePadId = String(formData.get("codePadId") ?? "").trim();
  if (!codePadId) return null;
  const pad = await db.codePad.findFirst({ where: { id: codePadId, courseId, tenantId } });
  if (!pad) throw new Error("Coding pad not found");
  return pad.id;
}

function dateInputOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? ("invalid" as const) : date;
}

export async function createCourseAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2) redirect("/dashboard/courses?error=Give+your+course+a+title");

  const state = await getPlanState(ctx.tenant.id);
  if (state.plan.courses !== null && state.usage.courses >= state.plan.courses) {
    redirect(
      `/dashboard/billing?error=${encodeURIComponent(
        `Your ${state.plan.name} plan includes ${state.plan.courses} courses. Upgrade for more.`
      )}`
    );
  }

  const course = await db.course.create({
    data: {
      tenantId: ctx.tenant.id,
      ownerId: ctx.user.id,
      title,
      subtitle: String(formData.get("subtitle") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim(),
      subject: String(formData.get("subject") ?? "Mathematics").trim() || "Mathematics",
      level: String(formData.get("level") ?? "General").trim() || "General",
    },
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "course.created",
    target: course.id,
    meta: { title },
  });
  revalidatePath("/dashboard/courses");
  redirect(`/dashboard/courses/${course.id}`);
}

export async function updateCourseAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  await courseInTenant(courseId, ctx.tenant.id);
  const status = String(formData.get("status") ?? "DRAFT");
  const allowed = ["DRAFT", "PUBLISHED", "ARCHIVED"];
  const budgetRaw = String(formData.get("budget") ?? "").trim();
  const budget = budgetRaw ? Number(budgetRaw) : null;
  const minEntryRaw = Number(formData.get("minEntryScore") ?? 60);

  await db.course.update({
    where: { id: courseId },
    data: {
      title: String(formData.get("title") ?? "").trim() || "Untitled course",
      subtitle: String(formData.get("subtitle") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim(),
      subject: String(formData.get("subject") ?? "Mathematics").trim() || "Mathematics",
      level: String(formData.get("level") ?? "General").trim() || "General",
      coverUrl: String(formData.get("coverUrl") ?? "").trim() || null,
      status: allowed.includes(status) ? status : "DRAFT",
      budget: Number.isFinite(budget) && (budget ?? 0) >= 0 ? budget : null,
      entryRequirements: String(formData.get("entryRequirements") ?? "").trim(),
      minEntryScore: Number.isFinite(minEntryRaw)
        ? Math.max(0, Math.min(100, Math.round(minEntryRaw)))
        : 60,
    },
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "course.updated",
    target: courseId,
  });
  revalidatePath(`/dashboard/courses/${courseId}`);
  revalidatePath("/dashboard/courses");
  redirect(`/dashboard/courses/${courseId}?saved=1`);
}

export async function deleteCourseAction(formData: FormData) {
  const ctx = await requireTenant("ADMIN");
  const courseId = String(formData.get("courseId") ?? "");
  await courseInTenant(courseId, ctx.tenant.id);
  await db.course.delete({ where: { id: courseId } });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "course.deleted",
    target: courseId,
  });
  revalidatePath("/dashboard/courses");
  redirect("/dashboard/courses");
}

export async function createLessonAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  await courseInTenant(courseId, ctx.tenant.id);
  const title = String(formData.get("title") ?? "").trim() || "Untitled lesson";
  const codePadId = await lessonCodePadId({
    courseId,
    tenantId: ctx.tenant.id,
    formData,
  });
  const last = await db.lesson.findFirst({
    where: { courseId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const lesson = await db.lesson.create({
    data: {
      courseId,
      title,
      codePadId,
      order: (last?.order ?? 0) + 1,
      summary: String(formData.get("summary") ?? "").trim() || null,
    },
  });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/lessons/${lesson.id}`);
}

export async function updateLessonAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const lessonId = String(formData.get("lessonId") ?? "");
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { course: true },
  });
  if (!lesson || lesson.course.tenantId !== ctx.tenant.id) throw new Error("Lesson not found");

  const siblings = await db.lesson.findMany({
    where: { courseId: lesson.courseId },
    orderBy: { order: "asc" },
    select: { id: true, title: true, prerequisiteIds: true, opensAt: true, closesAt: true },
  });
  const requestedPrerequisites = [
    ...new Set(
      formData
        .getAll("prerequisiteIds")
        .map((id) => String(id).trim())
        .filter(Boolean)
    ),
  ];
  const siblingIds = new Set(siblings.map((item) => item.id));
  if (
    requestedPrerequisites.some((id) => id === lessonId || !siblingIds.has(id)) ||
    hasPrerequisiteCycle({ lessonId, prerequisiteIds: requestedPrerequisites, lessons: siblings })
  ) {
    redirect(
      `/dashboard/lessons/${lessonId}?error=${encodeURIComponent(
        "Choose valid prerequisites without creating a cycle."
      )}`
    );
  }

  const opensAt = dateInputOrNull(formData.get("opensAt"));
  const closesAt = dateInputOrNull(formData.get("closesAt"));
  if (
    opensAt === "invalid" ||
    closesAt === "invalid" ||
    (opensAt && closesAt && closesAt.getTime() < opensAt.getTime())
  ) {
    redirect(
      `/dashboard/lessons/${lessonId}?error=${encodeURIComponent(
        "Check the lesson open and close dates."
      )}`
    );
  }

  const allowedPadIds = await db.codePad.findMany({
    where: { courseId: lesson.courseId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  const legacyContent = String(formData.get("content") ?? "");
  const parsedBlocks = parseLessonBlocks(String(formData.get("contentBlocks") ?? ""), {
    content: legacyContent,
    meetingUrl: String(formData.get("meetingUrl") ?? ""),
    codePadId: String(formData.get("codePadId") ?? ""),
  });
  const blocks = sanitizeBlocksForSave(
    parseLessonBlocks(JSON.stringify(parsedBlocks)),
    new Set(allowedPadIds.map((pad) => pad.id))
  );
  const markdown = blocksToMarkdown(blocks) || legacyContent;
  const meetingUrl =
    blocksToMeetingUrl(blocks) ?? (String(formData.get("meetingUrl") ?? "").trim() || null);
  const codePadId = blocksToCodePadId(blocks);

  await db.lesson.update({
    where: { id: lessonId },
    data: {
      title: String(formData.get("title") ?? "").trim() || "Untitled lesson",
      summary: String(formData.get("summary") ?? "").trim() || null,
      content: markdown,
      contentBlocks: JSON.stringify(blocks),
      prerequisiteIds: JSON.stringify(requestedPrerequisites),
      opensAt,
      closesAt,
      codePadId,
      estimatedMinutes: Math.max(1, Number(formData.get("estimatedMinutes") ?? 15) || 15),
      meetingUrl,
      published: formData.get("published") === "on",
    },
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "lesson.updated",
    target: lessonId,
  });
  revalidatePath(`/dashboard/lessons/${lessonId}`);
  revalidatePath(`/dashboard/courses/${lesson.courseId}`);
  redirect(`/dashboard/lessons/${lessonId}?saved=1`);
}

export async function deleteLessonAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const lessonId = String(formData.get("lessonId") ?? "");
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { course: true },
  });
  if (!lesson || lesson.course.tenantId !== ctx.tenant.id) throw new Error("Lesson not found");
  await db.lesson.delete({ where: { id: lessonId } });
  revalidatePath(`/dashboard/courses/${lesson.courseId}`);
  redirect(`/dashboard/courses/${lesson.courseId}`);
}

export async function enrollStudentAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  await courseInTenant(courseId, ctx.tenant.id);

  const user = await db.user.findUnique({ where: { email } });
  const membership = user
    ? await db.membership.findUnique({
        where: { tenantId_userId: { tenantId: ctx.tenant.id, userId: user.id } },
      })
    : null;

  if (!user || !membership) {
    redirect(
      `/dashboard/courses/${courseId}?tab=students&error=${encodeURIComponent(
        "No member with that email. Invite them from Settings → Members first."
      )}`
    );
  }

  await db.enrollment.upsert({
    where: { courseId_userId: { courseId, userId: user.id } },
    create: { tenantId: ctx.tenant.id, courseId, userId: user.id },
    update: { status: "ACTIVE" },
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "enrollment.added",
    target: user.email,
    meta: { courseId },
  });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=students&enrolled=1`);
}

export async function enrollAllStudentsAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  await courseInTenant(courseId, ctx.tenant.id);
  const students = await db.membership.findMany({
    where: { tenantId: ctx.tenant.id, role: "STUDENT", status: "ACTIVE" },
    select: { userId: true },
  });
  const existing = await db.enrollment.findMany({
    where: { courseId },
    select: { userId: true },
  });
  const enrolled = new Set(existing.map((e) => e.userId));
  const fresh = students.filter((s) => !enrolled.has(s.userId));
  if (fresh.length) {
    await db.enrollment.createMany({
      data: fresh.map((s) => ({ tenantId: ctx.tenant.id, courseId, userId: s.userId })),
    });
  }
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=students&enrolled=${fresh.length}`);
}

export async function unenrollStudentAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  await courseInTenant(courseId, ctx.tenant.id);
  await db.enrollment.deleteMany({ where: { id: enrollmentId, courseId } });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=students`);
}

export async function enrollSelfAction(formData: FormData) {
  const ctx = await requireTenant("STUDENT");
  const courseId = String(formData.get("courseId") ?? "");
  const course = await courseInTenant(courseId, ctx.tenant.id);
  if (course.status !== "PUBLISHED") redirect("/dashboard/courses?error=This+course+is+not+open+yet");
  await db.enrollment.upsert({
    where: { courseId_userId: { courseId, userId: ctx.user.id } },
    create: { tenantId: ctx.tenant.id, courseId, userId: ctx.user.id },
    update: {},
  });
  revalidatePath("/dashboard/courses");
  redirect(`/learn/${courseId}`);
}

/** Recalculate a learner's completion percentage from published lessons. */
export async function recalcProgress(courseId: string, userId: string) {
  const [published, completed] = await Promise.all([
    db.lesson.count({ where: { courseId, published: true } }),
    db.lessonCompletion.count({
      where: { userId, lesson: { courseId, published: true } },
    }),
  ]);
  const progress = published === 0 ? 0 : Math.round((completed / published) * 100);
  await db.enrollment.updateMany({ where: { courseId, userId }, data: { progress } });
}

export async function markLessonCompleteAction(formData: FormData) {
  const ctx = await requireTenant("STUDENT");
  const lessonId = String(formData.get("lessonId") ?? "");
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { course: true },
  });
  if (!lesson || lesson.course.tenantId !== ctx.tenant.id) return;

  const enrollment = await db.enrollment.findUnique({
    where: { courseId_userId: { courseId: lesson.courseId, userId: ctx.user.id } },
  });
  if (!enrollment) return;

  const [siblings, completions] = await Promise.all([
    db.lesson.findMany({
      where: { courseId: lesson.courseId },
      select: { id: true, title: true, prerequisiteIds: true, opensAt: true, closesAt: true },
    }),
    db.lessonCompletion.findMany({
      where: { userId: ctx.user.id, lesson: { courseId: lesson.courseId } },
      select: { lessonId: true },
    }),
  ]);
  const lockReason = getLessonLockReason({
    lesson,
    lessons: siblings,
    completedLessonIds: new Set(completions.map((item) => item.lessonId)),
    now: nowMs(),
  });
  if (lockReason) return;

  await db.lessonCompletion.upsert({
    where: { lessonId_userId: { lessonId, userId: ctx.user.id } },
    create: { lessonId, userId: ctx.user.id },
    update: {},
  });
  await recalcProgress(lesson.courseId, ctx.user.id);
  revalidatePath(`/learn/${lesson.courseId}/lessons/${lessonId}`);
  revalidatePath(`/learn/${lesson.courseId}`);
}

export async function deleteAttachmentAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const id = String(formData.get("attachmentId") ?? "");
  const attachment = await db.attachment.findFirst({
    where: { id, tenantId: ctx.tenant.id },
  });
  if (!attachment) return;
  await db.attachment.delete({ where: { id } });
  await removeUpload(attachment.storageKey);
  revalidatePath(`/dashboard/lessons/${attachment.lessonId ?? ""}`);
  redirect(
    attachment.lessonId
      ? `/dashboard/lessons/${attachment.lessonId}?saved=1`
      : `/dashboard/courses/${attachment.courseId ?? ""}?tab=documents`
  );
}
