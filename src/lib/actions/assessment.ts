"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { parseData, QUESTION_TYPE_LIST } from "@/lib/questions";

async function assessmentInTenant(assessmentId: string, tenantId: string) {
  const assessment = await db.assessment.findFirst({
    where: { id: assessmentId, tenantId },
    include: { course: true },
  });
  if (!assessment) throw new Error("Assessment not found");
  return assessment;
}

function questionHasOpenEnded(type: string, rawData: string) {
  if (type === "OPEN_ENDED") return true;
  if (type !== "CASE_STUDY") return false;
  try {
    const data = JSON.parse(rawData || "{}") as {
      subQuestions?: { type?: string; data?: { subQuestions?: unknown[] } }[];
    };
    return (data.subQuestions ?? []).some((sub) => sub.type === "OPEN_ENDED");
  } catch {
    return false;
  }
}

async function openEndedCount(assessmentId: string) {
  const questions = await db.question.findMany({
    where: { assessmentId },
    select: { type: true, data: true },
  });
  return questions.filter((question) => questionHasOpenEnded(question.type, question.data)).length;
}

function isQuiz(type: string) {
  return type === "QUIZ";
}

export async function createAssessmentAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const courseId = String(formData.get("courseId") ?? "");
  const course = await db.course.findFirst({ where: { id: courseId, tenantId: ctx.tenant.id } });
  if (!course) throw new Error("Course not found");

  const type = String(formData.get("type") ?? "QUIZ");
  const stageId = String(formData.get("stageId") ?? "") || null;
  if (stageId) {
    const stage = await db.courseStage.findFirst({ where: { id: stageId, courseId } });
    if (!stage) throw new Error("Stage not found");
  }
  const allowedTypes = ["QUIZ", "EXAM", "ASSIGNMENT", "PLACEMENT"];
  const assessment = await db.assessment.create({
    data: {
      tenantId: ctx.tenant.id,
      courseId,
      stageId,
      title: String(formData.get("title") ?? "").trim() || "Untitled assessment",
      type: allowedTypes.includes(type) ? type : "QUIZ",
    },
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "assessment.created",
    target: assessment.id,
  });
  revalidatePath(`/dashboard/courses/${courseId}`);
  redirect(`/dashboard/assessments/${assessment.id}`);
}

export async function updateAssessmentAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const id = String(formData.get("assessmentId") ?? "");
  await assessmentInTenant(id, ctx.tenant.id);

  const status = String(formData.get("status") ?? "DRAFT");
  const showResults = String(formData.get("showResults") ?? "AFTER_SUBMIT");
  const typeRaw = String(formData.get("type") ?? "QUIZ");
  const type = ["QUIZ", "EXAM", "ASSIGNMENT", "PLACEMENT"].includes(typeRaw) ? typeRaw : "QUIZ";
  if (isQuiz(type)) {
    const blocked = await openEndedCount(id);
    if (blocked > 0) {
      redirect(
        `/dashboard/assessments/${id}?error=${encodeURIComponent(
          `Quizzes cannot contain open-ended questions. Remove ${blocked} open-ended question${
            blocked === 1 ? "" : "s"
          } first, or switch this assessment to an exam.`
        )}`
      );
    }
  }
  const stageId = String(formData.get("stageId") ?? "") || null;
  if (stageId) {
    const stage = await db.courseStage.findFirst({
      where: { id: stageId, courseId: (await assessmentInTenant(id, ctx.tenant.id)).courseId },
    });
    if (!stage) throw new Error("Stage not found");
  }
  const numberOrNull = (key: string) => {
    const n = Number(formData.get(key));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };
  const dateOrNull = (key: string) => {
    const raw = String(formData.get(key) ?? "");
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  await db.assessment.update({
    where: { id },
    data: {
      title: String(formData.get("title") ?? "").trim() || "Untitled assessment",
      instructions: String(formData.get("instructions") ?? ""),
      type,
      stageId,
      timeLimitMin: numberOrNull("timeLimitMin"),
      attemptsAllowed: Math.max(1, Math.min(10, numberOrNull("attemptsAllowed") ?? 1)),
      passScore: Math.max(0, Math.min(100, Number(formData.get("passScore") ?? 50) || 50)),
      randomize: formData.get("randomize") === "on",
      openAt: dateOrNull("openAt"),
      dueAt: dateOrNull("dueAt"),
      status: ["DRAFT", "PUBLISHED", "CLOSED"].includes(status) ? status : "DRAFT",
      showResults: ["AFTER_SUBMIT", "AFTER_DUE", "MANUAL"].includes(showResults)
        ? showResults
        : "AFTER_SUBMIT",
    },
  });
  revalidatePath(`/dashboard/assessments/${id}`);
  redirect(`/dashboard/assessments/${id}?saved=1`);
}

export async function deleteAssessmentAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const id = String(formData.get("assessmentId") ?? "");
  const assessment = await assessmentInTenant(id, ctx.tenant.id);
  await db.assessment.delete({ where: { id } });
  revalidatePath(`/dashboard/courses/${assessment.courseId}`);
  redirect(`/dashboard/courses/${assessment.courseId}?tab=assessments`);
}

export async function saveQuestionAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const questionId = String(formData.get("questionId") ?? "");
  const assessmentId = String(formData.get("assessmentId") ?? "") || null;
  const type = String(formData.get("type") ?? "MULTIPLE_CHOICE");

  if (!QUESTION_TYPE_LIST.includes(type as never)) throw new Error("Unknown question type");

  if (assessmentId) {
    const assessment = await assessmentInTenant(assessmentId, ctx.tenant.id);
    if (assessment.type === "QUIZ" && questionHasOpenEnded(type, String(formData.get("data") ?? "{}"))) {
      redirect(
        `/dashboard/assessments/${assessmentId}?error=${encodeURIComponent(
          "Quizzes cannot contain open-ended questions. Use multiple choice, numeric, formula, fill-blank, matching, yes/no, image or case-study prompts with closed sub-questions."
        )}#questions`
      );
    }
  }

  const rawData = String(formData.get("data") ?? "{}");
  const parsed = parseData<Record<string, unknown>>(rawData);
  if (Object.keys(parsed).length === 0) throw new Error("Question configuration is empty");

  const payload = {
    type,
    prompt: String(formData.get("prompt") ?? "").trim(),
    mediaUrl: String(formData.get("mediaUrl") ?? "").trim() || null,
    points: Math.max(0.25, Number(formData.get("points") ?? 1) || 1),
    difficulty: String(formData.get("difficulty") ?? "MEDIUM"),
    tags: String(formData.get("tags") ?? "").trim(),
    data: JSON.stringify(parsed),
    explanation: String(formData.get("explanation") ?? "").trim() || null,
  };

  if (questionId) {
    const existing = await db.question.findFirst({
      where: { id: questionId, tenantId: ctx.tenant.id },
    });
    if (!existing) throw new Error("Question not found");
    await db.question.update({ where: { id: questionId }, data: payload });
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.id,
      action: "question.updated",
      target: questionId,
    });
  } else {
    const count = assessmentId
      ? await db.question.count({ where: { assessmentId } })
      : await db.question.count({ where: { tenantId: ctx.tenant.id, assessmentId: null } });
    const created = await db.question.create({
      data: {
        ...payload,
        tenantId: ctx.tenant.id,
        assessmentId,
        order: count + 1,
      },
    });
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.id,
      action: "question.created",
      target: created.id,
      meta: { type, assessmentId },
    });
  }

  if (assessmentId) {
    revalidatePath(`/dashboard/assessments/${assessmentId}`);
    redirect(`/dashboard/assessments/${assessmentId}?saved=question#questions`);
  }
  revalidatePath("/dashboard/bank");
  redirect("/dashboard/bank?saved=1");
}

export async function deleteQuestionAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const id = String(formData.get("questionId") ?? "");
  const question = await db.question.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!question) return;
  await db.question.delete({ where: { id } });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "question.deleted",
    target: id,
  });
  if (question.assessmentId) {
    revalidatePath(`/dashboard/assessments/${question.assessmentId}`);
    redirect(`/dashboard/assessments/${question.assessmentId}?deleted=1#questions`);
  }
  revalidatePath("/dashboard/bank");
  redirect("/dashboard/bank?deleted=1");
}

export async function duplicateQuestionAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const id = String(formData.get("questionId") ?? "");
  const question = await db.question.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!question) return;
  const count = question.assessmentId
    ? await db.question.count({ where: { assessmentId: question.assessmentId } })
    : 0;
  await db.question.create({
    data: {
      tenantId: ctx.tenant.id,
      assessmentId: question.assessmentId,
      type: question.type,
      prompt: question.prompt,
      mediaUrl: question.mediaUrl,
      points: question.points,
      difficulty: question.difficulty,
      tags: question.tags,
      data: question.data,
      explanation: question.explanation,
      order: count + 1,
    },
  });
  if (question.assessmentId) revalidatePath(`/dashboard/assessments/${question.assessmentId}`);
  revalidatePath("/dashboard/bank");
  redirect(
    question.assessmentId
      ? `/dashboard/assessments/${question.assessmentId}?saved=duplicate#questions`
      : "/dashboard/bank?saved=duplicate"
  );
}

export async function saveToBankAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const id = String(formData.get("questionId") ?? "");
  const question = await db.question.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!question || !question.assessmentId) return;
  await db.question.create({
    data: {
      tenantId: ctx.tenant.id,
      assessmentId: null,
      type: question.type,
      prompt: question.prompt,
      mediaUrl: question.mediaUrl,
      points: question.points,
      difficulty: question.difficulty,
      tags: question.tags,
      data: question.data,
      explanation: question.explanation,
    },
  });
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    action: "question.saved_to_bank",
    target: id,
  });
  revalidatePath("/dashboard/bank");
  redirect(`/dashboard/assessments/${question.assessmentId}?saved=bank#questions`);
}

export async function addFromBankAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const bankQuestionId = String(formData.get("bankQuestionId") ?? "");
  const assessmentId = String(formData.get("assessmentId") ?? "");
  const assessment = await assessmentInTenant(assessmentId, ctx.tenant.id);
  const question = await db.question.findFirst({
    where: { id: bankQuestionId, tenantId: ctx.tenant.id, assessmentId: null },
  });
  if (!question) return;
  if (assessment.type === "QUIZ" && questionHasOpenEnded(question.type, question.data)) {
    redirect(
      `/dashboard/assessments/${assessmentId}?error=${encodeURIComponent(
        "That bank question is open-ended, so it cannot be added to a quiz."
      )}#questions`
    );
  }
  const count = await db.question.count({ where: { assessmentId } });
  await db.question.create({
    data: {
      tenantId: ctx.tenant.id,
      assessmentId,
      type: question.type,
      prompt: question.prompt,
      mediaUrl: question.mediaUrl,
      points: question.points,
      difficulty: question.difficulty,
      tags: question.tags,
      data: question.data,
      explanation: question.explanation,
      order: count + 1,
    },
  });
  revalidatePath(`/dashboard/assessments/${assessmentId}`);
  redirect(`/dashboard/assessments/${assessmentId}?saved=bank#questions`);
}

export async function moveQuestionAction(formData: FormData) {
  const ctx = await requireTenant("TEACHER");
  const id = String(formData.get("questionId") ?? "");
  const direction = String(formData.get("direction") ?? "up");
  const question = await db.question.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!question?.assessmentId) return;

  const neighbors = await db.question.findMany({
    where: { assessmentId: question.assessmentId },
    orderBy: { order: "asc" },
  });
  const index = neighbors.findIndex((q) => q.id === id);
  const swapWith = direction === "up" ? neighbors[index - 1] : neighbors[index + 1];
  if (!swapWith) return;

  await db.$transaction([
    db.question.update({ where: { id: question.id }, data: { order: swapWith.order } }),
    db.question.update({ where: { id: swapWith.id }, data: { order: question.order } }),
  ]);
  revalidatePath(`/dashboard/assessments/${question.assessmentId}`);
  redirect(`/dashboard/assessments/${question.assessmentId}#questions`);
}
