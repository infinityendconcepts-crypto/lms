"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";

const EXPENSE_CATEGORIES = [
  "MATERIALS",
  "INSTRUCTOR",
  "VENUE",
  "TECHNOLOGY",
  "MARKETING",
  "TRANSPORT",
  "OTHER",
];

async function courseInTenant(courseId: string, tenantId: string) {
  const course = await db.course.findFirst({ where: { id: courseId, tenantId } });
  if (!course) throw new Error("Course not found");
  return course;
}

export async function createStageAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  await courseInTenant(courseId, ctx.tenant.id);

  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    redirect(`/dashboard/courses/${courseId}?tab=structure&error=Give+the+stage+a+title`);
  }

  const last = await db.courseStage.findFirst({
    where: { courseId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await db.courseStage.create({
    data: {
      courseId,
      title: title.slice(0, 120),
      description: String(formData.get("description") ?? "").trim() || null,
      order: (last?.order ?? 0) + 1,
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "course.stage_created",
    target: courseId,
    meta: { title },
  });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=structure&saved=stage`);
}

export async function deleteStageAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  const stageId = String(formData.get("stageId") ?? "");
  await courseInTenant(courseId, ctx.tenant.id);
  await db.courseStage.deleteMany({ where: { id: stageId, courseId } });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=structure&saved=stage-removed`);
}

export async function moveStageAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  const stageId = String(formData.get("stageId") ?? "");
  const direction = String(formData.get("direction") ?? "up");
  await courseInTenant(courseId, ctx.tenant.id);

  const stages = await db.courseStage.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
  });
  const index = stages.findIndex((stage) => stage.id === stageId);
  const swapWith = direction === "up" ? stages[index - 1] : stages[index + 1];
  if (!swapWith) {
    redirect(`/dashboard/courses/${courseId}?tab=structure`);
  }

  await db.$transaction([
    db.courseStage.update({ where: { id: stageId }, data: { order: swapWith.order } }),
    db.courseStage.update({ where: { id: swapWith.id }, data: { order: stages[index].order } }),
  ]);
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=structure`);
}

export async function assignStageAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const kind = String(formData.get("kind") ?? "lesson");
  const stageId = String(formData.get("stageId") ?? "") || null;
  await courseInTenant(courseId, ctx.tenant.id);

  if (stageId) {
    const stage = await db.courseStage.findFirst({ where: { id: stageId, courseId } });
    if (!stage) throw new Error("Stage not found");
  }

  if (kind === "assessment") {
    const assessment = await db.assessment.findFirst({ where: { id: itemId, courseId } });
    if (!assessment) throw new Error("Assessment not found");
    await db.assessment.update({ where: { id: itemId }, data: { stageId } });
  } else {
    const lesson = await db.lesson.findFirst({ where: { id: itemId, courseId } });
    if (!lesson) throw new Error("Lesson not found");
    await db.lesson.update({ where: { id: itemId }, data: { stageId } });
  }

  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=structure&saved=stage-assignment`);
}

export async function createExpenseAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  await courseInTenant(courseId, ctx.tenant.id);

  const title = String(formData.get("title") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  if (!title || !Number.isFinite(amount) || amount <= 0) {
    redirect(`/dashboard/courses/${courseId}?tab=budget&error=Add+a+title+and+a+positive+amount`);
  }

  const categoryRaw = String(formData.get("category") ?? "OTHER");
  const category = EXPENSE_CATEGORIES.includes(categoryRaw) ? categoryRaw : "OTHER";
  const incurredRaw = String(formData.get("incurredAt") ?? "");
  const incurredAt = incurredRaw ? new Date(incurredRaw) : new Date();

  await db.courseExpense.create({
    data: {
      tenantId: ctx.tenant.id,
      courseId,
      title: title.slice(0, 160),
      category,
      amount: Math.round(amount * 100) / 100,
      currency: ctx.tenant.currency || "ZAR",
      vendor: String(formData.get("vendor") ?? "").trim() || null,
      incurredAt: Number.isNaN(incurredAt.getTime()) ? new Date() : incurredAt,
      notes: String(formData.get("notes") ?? "").trim() || null,
      createdById: ctx.user.id,
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "course.expense_created",
    target: courseId,
    meta: { title, amount },
  });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=budget&saved=expense`);
}

export async function deleteExpenseAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  const expenseId = String(formData.get("expenseId") ?? "");
  await courseInTenant(courseId, ctx.tenant.id);
  await db.courseExpense.deleteMany({ where: { id: expenseId, courseId, tenantId: ctx.tenant.id } });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=budget&saved=expense-removed`);
}
