import "server-only";

import { readFile } from "node:fs/promises";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveStoragePath } from "@/lib/storage";
import { uid, type QuestionData, type QuestionType } from "@/lib/questions";
import { callProvider, extractJson } from "./providers";
import { resolveRuntime } from "./benchmark";

export type ContentDraftMode = "all" | "lesson" | "summary" | "questions";

export type DraftQuestion = {
  type: QuestionType;
  prompt: string;
  points: number;
  data: QuestionData;
};

export type ContentDraft = {
  title: string;
  summary: string;
  keyPoints: string[];
  content: string;
  questions: DraftQuestion[];
};

export type ContentDraftResult = {
  draft: ContentDraft;
  source: "local" | "provider";
  provider: string;
  model: string;
  error?: string;
};

const MAX_TEXT_BYTES = 150_000;
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "html", "htm", "svg", "xml"]);

/** Load readable text from a tenant-owned attachment, or null for binary files. */
export async function loadAttachmentText(attachmentId: string, tenantId: string) {
  const attachment = await db.attachment.findFirst({
    where: { id: attachmentId, tenantId },
    select: { id: true, name: true, mimeType: true, storageKey: true },
  });
  if (!attachment) return null;

  const ext = (attachment.name.split(".").pop() ?? "").toLowerCase();
  const textLike =
    attachment.mimeType.startsWith("text/") ||
    attachment.mimeType === "application/json" ||
    TEXT_EXTENSIONS.has(ext);
  if (!textLike) return null;

  const bytes = await readFile(resolveStoragePath(attachment.storageKey));
  const slice = bytes.subarray(0, MAX_TEXT_BYTES);
  const text = slice
    .toString("utf8")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
  return { name: attachment.name, text };
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "about", "which", "will",
  "they", "their", "there", "these", "those", "have", "has", "had", "was", "were", "are",
  "not", "but", "you", "your", "our", "its", "how", "why", "what", "when", "where", "can",
]);

function toLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function toSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20);
}

function trimAt(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function titleFrom(fileName: string, lines: string[]) {
  const heading = lines.find((line) => /^#{1,3}\s+\S/.test(line));
  if (heading) return heading.replace(/^#{1,3}\s+/, "").slice(0, 100);
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  return base ? base[0].toUpperCase() + base.slice(1) : "Untitled lesson";
}

function keyPointsFrom(lines: string[], sentences: string[]) {
  const bullets = lines
    .filter((line) => /^([-*•]|\d+[.)])\s+\S/.test(line))
    .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, "").trim())
    .filter((line) => line.length >= 12);
  const emphasized = sentences.filter((sentence) =>
    /\b(key|important|remember|must|should|always|never|therefore|in summary)\b/i.test(sentence)
  );
  const combined = [...bullets, ...emphasized, ...sentences];
  const unique: string[] = [];
  for (const item of combined) {
    const normalized = item.toLowerCase();
    if (unique.some((u) => u.toLowerCase().slice(0, 40) === normalized.slice(0, 40))) continue;
    unique.push(trimAt(item, 220));
    if (unique.length >= 6) break;
  }
  return unique;
}

function questionsFrom(sentences: string[], keyPoints: string[]): DraftQuestion[] {
  const source = [...keyPoints, ...sentences];
  const questions: DraftQuestion[] = [];

  for (const sentence of source) {
    if (questions.length >= 5) break;
    const words = sentence.replace(/[^A-Za-z0-9\s'-]/g, "").split(/\s+/);
    const candidate = words.find(
      (word) => word.length >= 6 && !STOP_WORDS.has(word.toLowerCase()) && /^[A-Za-z]/.test(word)
    );
    if (!candidate) continue;
    const prompt = sentence.replace(candidate, "______");
    questions.push({
      type: "FILL_BLANK",
      prompt: `Complete the statement: ${trimAt(prompt, 220)}`,
      points: 1,
      data: {
        blanks: [{ id: uid(), accepted: [candidate] }],
        caseSensitive: false,
      },
    });
  }

  for (const sentence of sentences.slice(0, 2)) {
    if (questions.length >= 6) break;
    questions.push({
      type: "YES_NO",
      prompt: `True or false: ${trimAt(sentence, 220)}`,
      points: 1,
      data: { correct: true },
    });
  }

  return questions;
}

/** Deterministic, offline draft built from headings, bullets and sentences. */
export function localContentDraft(
  text: string,
  fileName: string,
  mode: ContentDraftMode = "all"
): ContentDraft {
  const lines = toLines(text);
  const sentences = toSentences(text);
  const keyPoints = keyPointsFrom(lines, sentences);
  const title = titleFrom(fileName, lines);
  const summary = trimAt(
    sentences[0] ?? keyPoints[0] ?? `Notes extracted from ${fileName}.`,
    280
  );

  const sections: string[] = [];
  if (mode === "all" || mode === "lesson") {
    sections.push(`## Overview\n\n${summary}`);
    if (keyPoints.length) {
      sections.push(`## Key points\n\n${keyPoints.map((point) => `- ${point}`).join("\n")}`);
    }
    const body = sentences.slice(1, 6).map((sentence) => `- ${trimAt(sentence, 240)}`);
    if (body.length) sections.push(`## Notes\n\n${body.join("\n")}`);
  }

  return {
    title,
    summary: mode === "questions" ? "" : summary,
    keyPoints: mode === "questions" ? [] : keyPoints,
    content: sections.join("\n\n"),
    questions: mode === "lesson" || mode === "summary" ? [] : questionsFrom(sentences, keyPoints),
  };
}

const AiDraftSchema = z.object({
  summary: z.string().max(600).optional(),
  keyPoints: z.array(z.string().max(240)).max(8).optional(),
  content: z.string().max(12_000).optional(),
  questions: z
    .array(
      z.object({
        type: z.enum([
          "MULTIPLE_CHOICE",
          "YES_NO",
          "OPEN_ENDED",
          "NUMERIC",
          "FILL_BLANK",
        ]),
        prompt: z.string().max(400),
        points: z.number().min(1).max(20).optional(),
        answer: z.string().max(240).optional(),
        options: z.array(z.string().max(240)).max(6).optional(),
      })
    )
    .max(8)
    .optional(),
});

function mapAiQuestions(value: z.infer<typeof AiDraftSchema>["questions"]): DraftQuestion[] {
  return (value ?? []).map((q) => {
    const base = { prompt: q.prompt, points: q.points ?? 1 };
    switch (q.type) {
      case "YES_NO":
        return {
          ...base,
          type: "YES_NO" as const,
          data: { correct: /^(true|yes|1)$/i.test(q.answer ?? "true") },
        };
      case "FILL_BLANK":
        return {
          ...base,
          type: "FILL_BLANK" as const,
          data: {
            blanks: [{ id: uid(), accepted: [q.answer || "answer"] }],
            caseSensitive: false,
          },
        };
      case "NUMERIC":
        return {
          ...base,
          type: "NUMERIC" as const,
          data: { answer: Number(q.answer) || 0, tolerance: 0.001 },
        };
      case "OPEN_ENDED":
        return {
          ...base,
          type: "OPEN_ENDED" as const,
          data: { rubric: [{ id: uid(), criterion: "Addresses the prompt accurately", points: q.points ?? 1 }] },
        };
      case "MULTIPLE_CHOICE": {
        const texts = (q.options ?? []).filter(Boolean).slice(0, 6);
        const options = (texts.length ? texts : ["True", "False"]).map((text) => ({
          id: uid(),
          text,
        }));
        const answerText = (q.answer ?? "").toLowerCase();
        const correct = options.filter((option) => option.text.toLowerCase() === answerText).map((option) => option.id);
        return {
          ...base,
          type: "MULTIPLE_CHOICE" as const,
          data: { multiple: false, options, correct },
        };
      }
    }
  });
}

function systemPrompt() {
  return [
    "You are a helpful curriculum assistant. Draft lesson material ONLY from the supplied source text.",
    "Do not invent facts, numbers or claims that are not present in the source.",
    "Respond with a single JSON object matching this shape:",
    '{ "summary": string, "keyPoints": string[], "content": string (Markdown),',
    '  "questions": [{ "type": "MULTIPLE_CHOICE"|"YES_NO"|"OPEN_ENDED"|"NUMERIC"|"FILL_BLANK",',
    '     "prompt": string, "points": number, "answer"?: string, "options"?: string[] }] }',
    "Keep the summary under 200 words and produce at most 5 questions.",
    "For MULTIPLE_CHOICE include an options array and set answer to the exact correct option text.",
    "For FILL_BLANK set answer to the missing word or phrase.",
  ].join(" ");
}

/**
 * Always compute a local draft first, then optionally refine it with a hosted
 * or local provider. Provider failures keep the local result (local-first).
 */
export async function generateContentDraft(input: {
  tenantId: string;
  text: string;
  fileName: string;
  mode: ContentDraftMode;
  providerChoice: string;
}): Promise<ContentDraftResult> {
  const local = localContentDraft(input.text, input.fileName, input.mode);
  const { runtime, label } = await resolveRuntime(input.tenantId, input.providerChoice);
  if (!runtime) {
    return { draft: local, source: "local", provider: "local", model: "nkanyezi-content-v1" };
  }

  try {
    const result = await callProvider(runtime, {
      system: systemPrompt(),
      user: JSON.stringify({
        task: "draft_lesson_content",
        mode: input.mode,
        fileName: input.fileName,
        source: input.text.slice(0, 40_000),
      }),
      maxTokens: 2600,
      temperature: 0.3,
    });
    const parsed = AiDraftSchema.parse(extractJson(result.text));
    const aiQuestions = mapAiQuestions(parsed.questions);

    const draft: ContentDraft = {
      ...local,
      summary: parsed.summary?.trim() || local.summary,
      keyPoints: parsed.keyPoints?.length ? parsed.keyPoints : local.keyPoints,
      content:
        input.mode === "questions"
          ? ""
          : parsed.content?.trim() || local.content,
      questions:
        input.mode === "lesson" || input.mode === "summary"
          ? []
          : aiQuestions.length
            ? aiQuestions
            : local.questions,
    };

    return {
      draft,
      source: "provider",
      provider: label,
      model: runtime.model,
    };
  } catch (error) {
    return {
      draft: local,
      source: "local",
      provider: "local",
      model: "nkanyezi-content-v1",
      error: error instanceof Error ? error.message : "The model could not draft this content.",
    };
  }
}
