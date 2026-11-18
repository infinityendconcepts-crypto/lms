"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import {
  isPlanStatus,
  planPriorityFrom,
  planStatusFrom,
  type PlanStatus,
} from "@/lib/course-plan";

const COURSE_MISSING = "Course+not+found";

function planError(courseId: string, message: string): never {
  redirect(`/dashboard/courses/${courseId}?tab=plan&error=${message}`);
}

async function courseInTenant(courseId: string, tenantId: string) {
  const course = await db.course.findFirst({ where: { id: courseId, tenantId } });
  if (!course) redirect(`/dashboard/courses/${courseId}?tab=plan&error=${COURSE_MISSING}`);
  return course;
}

function parseDate(raw: string | null | undefined) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function resolveStage(stageId: string, courseId: string) {
  if (!stageId) return null;
  const stage = await db.courseStage.findFirst({ where: { id: stageId, courseId } });
  if (!stage) throw new Error("Stage not found");
  return stage.id;
}

async function resolveAssignee(assigneeId: string, tenantId: string) {
  if (!assigneeId) return null;
  const membership = await db.membership.findFirst({
    where: { tenantId, userId: assigneeId, status: "ACTIVE" },
    select: { userId: true },
  });
  if (!membership) throw new Error("Assignee is not an active workspace member");
  return membership.userId;
}

function taskInput(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const status = planStatusFrom(String(formData.get("status") ?? ""));
  const priority = planPriorityFrom(String(formData.get("priority") ?? ""));
  const startAt = parseDate(String(formData.get("startAt") ?? ""));
  const dueAt = parseDate(String(formData.get("dueAt") ?? ""));
  return {
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    status,
    priority,
    startAt,
    dueAt,
  };
}

function validateInput(input: ReturnType<typeof taskInput>, courseId: string) {
  if (!input.title) planError(courseId, "Give+the+task+a+title");
  if (input.startAt && input.dueAt && input.startAt.getTime() > input.dueAt.getTime()) {
    planError(courseId, "Start+date+must+be+before+the+due+date");
  }
}

export async function createCoursePlanTaskAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  await courseInTenant(courseId, ctx.tenant.id);

  const input = taskInput(formData);
  validateInput(input, courseId);

  const stageId = await resolveStage(String(formData.get("stageId") ?? ""), courseId);
  const assigneeId = await resolveAssignee(String(formData.get("assigneeId") ?? ""), ctx.tenant.id);
  const last = await db.coursePlanTask.findFirst({
    where: { courseId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await db.coursePlanTask.create({
    data: {
      tenantId: ctx.tenant.id,
      courseId,
      stageId,
      assigneeId,
      createdById: ctx.user.id,
      title: input.title.slice(0, 160),
      description: input.description,
      status: input.status,
      priority: input.priority,
      startAt: input.startAt,
      dueAt: input.dueAt,
      completedAt: input.status === "MET" ? new Date() : null,
      order: (last?.order ?? 0) + 1,
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "course.plan_task_created",
    target: courseId,
    meta: { title: input.title, status: input.status },
  });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=plan&saved=task`);
}

export async function updateCoursePlanTaskAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  await courseInTenant(courseId, ctx.tenant.id);

  const existing = await db.coursePlanTask.findFirst({
    where: { id: taskId, courseId, tenantId: ctx.tenant.id },
    select: { completedAt: true },
  });
  if (!existing) planError(courseId, "Task+not+found");

  const input = taskInput(formData);
  validateInput(input, courseId);

  const stageId = await resolveStage(String(formData.get("stageId") ?? ""), courseId);
  const assigneeId = await resolveAssignee(String(formData.get("assigneeId") ?? ""), ctx.tenant.id);

  await db.coursePlanTask.update({
    where: { id: taskId },
    data: {
      stageId,
      assigneeId,
      title: input.title.slice(0, 160),
      description: input.description,
      status: input.status,
      priority: input.priority,
      startAt: input.startAt,
      dueAt: input.dueAt,
      completedAt: input.status === "MET" ? (existing.completedAt ?? new Date()) : null,
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "course.plan_task_updated",
    target: taskId,
    meta: { courseId, title: input.title, status: input.status },
  });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=plan&saved=task`);
}

export async function deleteCoursePlanTaskAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  await courseInTenant(courseId, ctx.tenant.id);
  await db.coursePlanTask.deleteMany({
    where: { id: taskId, courseId, tenantId: ctx.tenant.id },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "course.plan_task_deleted",
    target: taskId,
    meta: { courseId },
  });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=plan&saved=task-removed`);
}

/** Called directly by the Kanban board when a card is dropped in a column. */
export async function setCoursePlanTaskStatusAction(input: {
  taskId: string;
  status: PlanStatus;
}) {
  const ctx = await requireTenant("TEACHER");
  const status = String(input.status ?? "");
  if (!isPlanStatus(status)) throw new Error("Unknown plan status");

  const task = await db.coursePlanTask.findFirst({
    where: { id: String(input.taskId ?? ""), tenantId: ctx.tenant.id },
    select: { id: true, courseId: true, completedAt: true, status: true },
  });
  if (!task) throw new Error("Task not found");
  if (task.status === status) return;

  await db.coursePlanTask.update({
    where: { id: task.id },
    data: {
      status,
      completedAt: status === "MET" ? (task.completedAt ?? new Date()) : null,
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "course.plan_task_moved",
    target: task.id,
    meta: { courseId: task.courseId, from: task.status, to: status },
  });
  revalidatePath(`/dashboard/courses/${task.courseId}`);
}

export async function moveCoursePlanTaskAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  if (!isPlanStatus(statusRaw)) planError(courseId, "Unknown+plan+status");
  await courseInTenant(courseId, ctx.tenant.id);

  const task = await db.coursePlanTask.findFirst({
    where: { id: taskId, courseId, tenantId: ctx.tenant.id },
    select: { id: true, completedAt: true, status: true },
  });
  if (!task) planError(courseId, "Task+not+found");
  if (task.status === statusRaw) {
    redirect(`/dashboard/courses/${courseId}?tab=plan`);
  }

  await db.coursePlanTask.update({
    where: { id: task.id },
    data: {
      status: statusRaw,
      completedAt: statusRaw === "MET" ? (task.completedAt ?? new Date()) : null,
    },
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "course.plan_task_moved",
    target: task.id,
    meta: { courseId, from: task.status, to: statusRaw },
  });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=plan&saved=task-moved`);
}
