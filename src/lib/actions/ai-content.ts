"use server";

import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import {
  generateContentDraft,
  loadAttachmentText,
  type ContentDraftMode,
  type ContentDraftResult,
} from "@/lib/ai/content";

export type GenerateContentDraftResponse = ContentDraftResult & {
  ok: boolean;
  usedAttachment: boolean;
  attachmentName: string | null;
};

/**
 * Generate a lesson draft from an uploaded file (or a lesson/course attachment).
 * Always returns a result instead of redirecting so the editor can preview it.
 */
export async function generateContentDraftAction(input: {
  attachmentId?: string;
  lessonId?: string;
  courseId?: string;
  mode?: ContentDraftMode;
  providerChoice?: string;
}): Promise<GenerateContentDraftResponse> {
  const ctx = await requireTenant("TEACHER");
  const tenantId = ctx.tenant.id;
  const mode: ContentDraftMode = input.mode ?? "all";
  const providerChoice = input.providerChoice ?? "auto";

  let attachmentId = input.attachmentId || null;

  // If no explicit attachment, pick the first readable attachment of the lesson or course.
  if (!attachmentId) {
    const candidates = await db.attachment.findMany({
      where: {
        tenantId,
        ...(input.lessonId
          ? { lessonId: input.lessonId }
          : input.courseId
            ? { courseId: input.courseId, lessonId: null }
            : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, mimeType: true },
      take: 25,
    });
    const readable = candidates.find(
      (file) =>
        file.mimeType.startsWith("text/") ||
        /\.(txt|md|csv|json|html?|svg|xml)$/i.test(file.name)
    );
    attachmentId = readable?.id ?? null;
  }

  let text = "";
  let attachmentName: string | null = null;
  if (attachmentId) {
    const loaded = await loadAttachmentText(attachmentId, tenantId);
    if (loaded) {
      text = loaded.text;
      attachmentName = loaded.name;
    }
  }

  if (!text.trim()) {
    // Still produce a useful outline from the lesson title when no text is readable.
    const lesson = input.lessonId
      ? await db.lesson.findFirst({
          where: { id: input.lessonId, course: { tenantId } },
          select: { title: true, summary: true, content: true },
        })
      : null;
    const course = input.courseId
      ? await db.course.findFirst({
          where: { id: input.courseId, tenantId },
          select: { title: true },
        })
      : null;
    const subject = lesson?.title || course?.title || "this topic";
    const body = (lesson?.content ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    text = [
      `# ${subject}`,
      lesson?.summary ? `Overview: ${lesson.summary}` : "",
      body.slice(0, 20_000),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const result = await generateContentDraft({
    tenantId,
    text,
    fileName: attachmentName ?? "lesson notes",
    mode,
    providerChoice,
  });

  await audit({
    tenantId,
    actorId: ctx.user.id,
    action: "ai.content_generated",
    target: attachmentId ?? input.lessonId ?? input.courseId ?? null,
    meta: { mode, source: result.source, usedAttachment: Boolean(attachmentName) },
  });

  return {
    ...result,
    ok: true,
    usedAttachment: Boolean(attachmentName),
    attachmentName,
  };
}
