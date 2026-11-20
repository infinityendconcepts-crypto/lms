/**
 * Lesson blocks are stored as a JSON string on Lesson.contentBlocks so the
 * existing Markdown `content` column keeps working for AI assist, previews and
 * older readers. This module is intentionally client-safe: no server imports.
 */

export const LESSON_BLOCK_TYPES = [
  "text",
  "video",
  "code",
  "math",
  "image",
  "presentation",
] as const;

export type LessonBlockType = (typeof LESSON_BLOCK_TYPES)[number];

export type LessonImage = {
  id: string;
  url: string;
  caption: string;
};

export type LessonSlide = {
  id: string;
  title: string;
  text: string;
  imageUrl: string;
};

export type LessonBlock =
  | { id: string; type: "text"; content: string }
  | {
      id: string;
      type: "video";
      title: string;
      source: "link" | "upload";
      url: string;
      attachmentId: string;
    }
  | { id: string; type: "code"; title: string; padId: string }
  | { id: string; type: "math"; title: string; content: string }
  | {
      id: string;
      type: "image";
      title: string;
      columns: number;
      images: LessonImage[];
    }
  | {
      id: string;
      type: "presentation";
      title: string;
      slides: LessonSlide[];
    };

export type CodePadOption = { id: string; title: string; language: string };

export type LegacyLessonFields = {
  content?: string | null;
  meetingUrl?: string | null;
  codePadId?: string | null;
  videoAttachments?: { id: string; name: string }[];
};

export const LESSON_BLOCK_LABELS: Record<LessonBlockType, string> = {
  text: "Text",
  video: "Video",
  code: "Coding pad",
  math: "Mathematics",
  image: "Image gallery",
  presentation: "Presentation",
};

export function createId(prefix = "b") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** Stable IDs for blocks derived on both the server and the client. */
function stableId(prefix: string, value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

/** Only http(s) links and uploaded files served by /api/files are kept. */
export function safeMediaUrl(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^\/api\/files\/[A-Za-z0-9_-]+(?:\?.*)?$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeBlock(value: unknown): LessonBlock | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id) || stableId("block", JSON.stringify(raw));
  const title = text(raw.title);

  switch (raw.type) {
    case "text":
      return { id, type: "text", content: text(raw.content) };
    case "video": {
      const source = raw.source === "upload" ? "upload" : "link";
      const url = safeMediaUrl(raw.url);
      const attachmentId = /^[A-Za-z0-9_-]+$/.test(text(raw.attachmentId))
        ? text(raw.attachmentId)
        : "";
      if (!url && !attachmentId) return null;
      return {
        id,
        type: "video",
        title: title || (source === "upload" ? "Uploaded video" : "Lesson video"),
        source,
        url: source === "upload" ? `/api/files/${attachmentId}` : url,
        attachmentId,
      };
    }
    case "code":
      return {
        id,
        type: "code",
        title: title || "Coding practice",
        padId: /^[A-Za-z0-9_-]+$/.test(text(raw.padId)) ? text(raw.padId) : "",
      };
    case "math":
      return { id, type: "math", title: title || "Mathematics", content: text(raw.content) };
    case "image": {
      const images = Array.isArray(raw.images)
        ? raw.images
            .map((image): LessonImage | null => {
              if (!image || typeof image !== "object") return null;
              const item = image as Record<string, unknown>;
              const url = safeMediaUrl(item.url);
              if (!url) return null;
              return {
                id: text(item.id) || stableId("image", JSON.stringify(item)),
                url,
                caption: text(item.caption),
              };
            })
            .filter((image): image is LessonImage => Boolean(image))
        : [];
      if (!images.length) return null;
      const columns = Number(raw.columns);
      return {
        id,
        type: "image",
        title: title || "Image gallery",
        columns: columns === 2 || columns === 3 ? columns : 2,
        images,
      };
    }
    case "presentation": {
      const slides = Array.isArray(raw.slides)
        ? raw.slides
            .map((slide): LessonSlide | null => {
              if (!slide || typeof slide !== "object") return null;
              const item = slide as Record<string, unknown>;
              const imageUrl = safeMediaUrl(item.imageUrl);
              const slideText = text(item.text);
              const slideTitle = text(item.title);
              if (!imageUrl && !slideText && !slideTitle) return null;
              return {
                id: text(item.id) || stableId("slide", JSON.stringify(item)),
                title: slideTitle,
                text: slideText,
                imageUrl,
              };
            })
            .filter((slide): slide is LessonSlide => Boolean(slide))
        : [];
      if (!slides.length) return null;
      return { id, type: "presentation", title: title || "Presentation", slides };
    }
    default:
      return null;
  }
}

/** Build editable blocks from the fields lessons used before the builder. */
export function legacyLessonBlocks(fields: LegacyLessonFields): LessonBlock[] {
  const content = text(fields.content);
  const blocks: LessonBlock[] = [
    { id: stableId("text", content), type: "text", content },
  ];

  const meetingUrl = text(fields.meetingUrl);
  if (meetingUrl) {
    const url = safeMediaUrl(meetingUrl);
    if (url) {
      blocks.push({
        id: stableId("meeting", url),
        type: "video",
        title: "Lesson video",
        source: "link",
        url,
        attachmentId: "",
      });
    }
  }

  for (const attachment of fields.videoAttachments ?? []) {
    blocks.push({
      id: stableId("video", attachment.id),
      type: "video",
      title: attachment.name || "Uploaded video",
      source: "upload",
      url: `/api/files/${attachment.id}`,
      attachmentId: attachment.id,
    });
  }

  const codePadId = text(fields.codePadId);
  if (codePadId) {
    blocks.push({
      id: stableId("pad", codePadId),
      type: "code",
      title: "Coding practice",
      padId: codePadId,
    });
  }

  return blocks;
}

/** Defensive parse used by both the editor and the save action. */
export function parseLessonBlocks(
  raw: string | null | undefined,
  fallback?: LegacyLessonFields
): LessonBlock[] {
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(text(raw, "[]") || "[]");
  } catch {
    parsed = [];
  }
  const blocks = Array.isArray(parsed)
    ? parsed.map(normalizeBlock).filter((block): block is LessonBlock => Boolean(block))
    : [];
  if (blocks.length) return blocks;
  return fallback ? legacyLessonBlocks(fallback) : [];
}

export function createLessonBlock(type: LessonBlockType): LessonBlock {
  switch (type) {
    case "text":
      return { id: createId(), type: "text", content: "" };
    case "video":
      return {
        id: createId(),
        type: "video",
        title: "",
        source: "link",
        url: "",
        attachmentId: "",
      };
    case "code":
      return { id: createId(), type: "code", title: "Coding practice", padId: "" };
    case "math":
      return { id: createId(), type: "math", title: "Mathematics", content: "" };
    case "image":
      return {
        id: createId(),
        type: "image",
        title: "Image gallery",
        columns: 2,
        images: [{ id: createId("i"), url: "", caption: "" }],
      };
    case "presentation":
      return {
        id: createId(),
        type: "presentation",
        title: "Presentation",
        slides: [{ id: createId("s"), title: "", text: "", imageUrl: "" }],
      };
  }
}

/** Keep the Markdown column readable for AI assist and legacy previews. */
export function blocksToMarkdown(blocks: LessonBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === "text") return block.content.trim();
      if (block.type === "math") return block.content.trim() ? `$$\n${block.content.trim()}\n$$` : "";
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function blocksToMeetingUrl(blocks: LessonBlock[]): string | null {
  const video = blocks.find((block) => block.type === "video" && block.source === "link");
  return video?.type === "video" ? video.url || null : null;
}

export function blocksToCodePadId(blocks: LessonBlock[]): string | null {
  const code = blocks.find((block) => block.type === "code" && block.padId);
  return code?.type === "code" ? code.padId || null : null;
}

/** Drop references to pads that do not belong to this course. */
export function sanitizeBlocksForSave(
  blocks: LessonBlock[],
  allowedPadIds: Set<string>
): LessonBlock[] {
  return blocks.map((block) =>
    block.type === "code" && block.padId && !allowedPadIds.has(block.padId)
      ? { ...block, padId: "" }
      : block
  );
}

export function blockSummary(block: LessonBlock): string {
  switch (block.type) {
    case "text":
      return block.content.replace(/[#*_`$>]/g, "").trim().slice(0, 90) || "Empty text block";
    case "video":
      return block.title || (block.source === "upload" ? "Uploaded video" : block.url || "Add a video link");
    case "code":
      return block.title || "Choose a coding pad";
    case "math":
      return block.content.trim().slice(0, 90) || "Add an equation";
    case "image":
      return block.title || `${block.images.length} image${block.images.length === 1 ? "" : "s"}`;
    case "presentation":
      return block.title || `${block.slides.length} slide${block.slides.length === 1 ? "" : "s"}`;
  }
}
