"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";

const MAX_CODE = 120_000;

const LANGUAGES = [
  "html",
  "css",
  "javascript",
  "typescript",
  "python",
  "java",
  "c",
  "cpp",
  "csharp",
  "go",
  "rust",
  "sql",
  "bash",
  "other",
];

async function padInTenant(padId: string, tenantId: string) {
  const pad = await db.codePad.findFirst({ where: { id: padId, tenantId }, include: { course: true } });
  if (!pad) throw new Error("Coding pad not found");
  return pad;
}

export async function createCodePadAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  const course = await db.course.findFirst({ where: { id: courseId, tenantId: ctx.tenant.id } });
  if (!course) throw new Error("Course not found");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect(`/dashboard/courses/${courseId}?tab=coding&error=Give+the+pad+a+title`);

  const last = await db.codePad.findFirst({
    where: { courseId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const languageRaw = String(formData.get("language") ?? "javascript");

  const pad = await db.codePad.create({
    data: {
      tenantId: ctx.tenant.id,
      courseId,
      title: title.slice(0, 160),
      language: LANGUAGES.includes(languageRaw) ? languageRaw : "other",
      prompt: String(formData.get("prompt") ?? "").trim(),
      starterCode: String(formData.get("starterCode") ?? "").slice(0, MAX_CODE),
      published: formData.get("published") === "on",
      order: (last?.order ?? 0) + 1,
      createdById: ctx.user.id,
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "codepad.created",
    target: pad.id,
    meta: { courseId, title },
  });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/courses/${courseId}?tab=coding&saved=pad`);
}

export async function updateCodePadAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const padId = String(formData.get("padId") ?? "");
  const pad = await padInTenant(padId, ctx.tenant.id);
  const languageRaw = String(formData.get("language") ?? pad.language);

  await db.codePad.update({
    where: { id: padId },
    data: {
      title: String(formData.get("title") ?? "").trim().slice(0, 160) || pad.title,
      language: LANGUAGES.includes(languageRaw) ? languageRaw : pad.language,
      prompt: String(formData.get("prompt") ?? "").trim(),
      starterCode: String(formData.get("starterCode") ?? "").slice(0, MAX_CODE),
      solution: String(formData.get("solution") ?? "").trim().slice(0, MAX_CODE) || null,
      published: formData.get("published") === "on",
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "codepad.updated",
    target: padId,
    meta: { courseId: pad.courseId },
  });
  revalidatePath(`/dashboard/courses/${pad.courseId}`);
  revalidatePath(`/learn/${pad.courseId}/pads/${padId}`);
  redirect(`/dashboard/courses/${pad.courseId}?tab=coding&saved=pad-updated`);
}

export async function deleteCodePadAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const padId = String(formData.get("padId") ?? "");
  const pad = await padInTenant(padId, ctx.tenant.id);
  await db.codePad.delete({ where: { id: padId } });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "codepad.deleted",
    target: padId,
    meta: { courseId: pad.courseId },
  });
  revalidatePath(`/dashboard/courses/${pad.courseId}`);
  redirect(`/dashboard/courses/${pad.courseId}?tab=coding&saved=pad-removed`);
}

/** Learner saves a draft or submits the pad for review. */
export async function saveCodePadAction(formData: FormData) {
  const ctx = await requireTenant("STUDENT");
  const padId = String(formData.get("padId") ?? "");
  const intent = String(formData.get("intent") ?? "save");
  const code = String(formData.get("code") ?? "").slice(0, MAX_CODE);

  const pad = await db.codePad.findFirst({
    where: { id: padId, tenantId: ctx.tenant.id },
    include: { course: true },
  });
  if (!pad) throw new Error("Coding pad not found");

  const enrollment = await db.enrollment.findUnique({
    where: { courseId_userId: { courseId: pad.courseId, userId: ctx.user.id } },
  });
  if (!enrollment) {
    redirect(`/learn/${pad.courseId}?error=Join+the+course+to+use+this+pad`);
  }
  if (!pad.published) {
    redirect(`/learn/${pad.courseId}?error=This+pad+is+not+open+yet`);
  }

  const submit = intent === "submit";
  const existing = await db.codePadSubmission.findUnique({
    where: { padId_userId: { padId, userId: ctx.user.id } },
  });
  if (submit && existing?.status === "REVIEWED") {
    redirect(`/learn/${pad.courseId}/pads/${padId}?error=This+submission+has+already+been+reviewed`);
  }

  await db.codePadSubmission.upsert({
    where: { padId_userId: { padId, userId: ctx.user.id } },
    create: {
      padId,
      userId: ctx.user.id,
      code,
      status: submit ? "SUBMITTED" : "DRAFT",
      submittedAt: submit ? new Date() : null,
    },
    update: {
      code,
      status: submit ? "SUBMITTED" : existing?.status === "REVIEWED" ? "REVIEWED" : "DRAFT",
      submittedAt: submit ? new Date() : existing?.submittedAt,
    },
  });

  if (submit) {
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.id,
      action: "codepad.submitted",
      target: padId,
      meta: { courseId: pad.courseId },
    });
  }
  revalidatePath(`/learn/${pad.courseId}/pads/${padId}`);
  revalidatePath(`/dashboard/courses/${pad.courseId}`);
  redirect(
    `/learn/${pad.courseId}/pads/${padId}?saved=${submit ? "submitted" : "draft"}`
  );
}

export async function gradeCodePadAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const submissionId = String(formData.get("submissionId") ?? "");
  const submission = await db.codePadSubmission.findFirst({
    where: { id: submissionId, pad: { tenantId: ctx.tenant.id } },
    include: { pad: true },
  });
  if (!submission) throw new Error("Submission not found");

  const scoreRaw = Number(formData.get("score") ?? 0);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, scoreRaw)) : 0;

  await db.codePadSubmission.update({
    where: { id: submissionId },
    data: {
      status: "REVIEWED",
      score,
      feedback: String(formData.get("feedback") ?? "").trim().slice(0, 4000) || null,
    },
  });

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "codepad.reviewed",
    target: submissionId,
    meta: { padId: submission.padId, score },
  });
  revalidatePath(`/dashboard/courses/${submission.pad.courseId}`);
  revalidatePath(`/learn/${submission.pad.courseId}/pads/${submission.padId}`);
  redirect(`/dashboard/courses/${submission.pad.courseId}?tab=coding&saved=review`);
}
