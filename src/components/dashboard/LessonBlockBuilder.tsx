"use client";

import { useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Eye,
  GripVertical,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  Plus,
  Presentation,
  Sigma,
  Trash2,
  Type,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { OverlayModal } from "@/components/OverlayModal";
import { RichTextEditor } from "@/components/RichTextEditor";
import { UploadField } from "@/components/UploadField";
import { TextBlockAssistant } from "@/components/ai/TextBlockAssistant";
import { LessonBlocks } from "@/components/LessonBlocks";
import { cn } from "@/lib/utils";
import {
  LESSON_BLOCK_LABELS,
  LESSON_BLOCK_TYPES,
  blockSummary,
  blocksToCodePadId,
  blocksToMarkdown,
  blocksToMeetingUrl,
  createId,
  createLessonBlock,
  parseLessonBlocks,
  type LessonBlock,
  type LessonBlockType,
} from "@/lib/lesson-blocks";

const BLOCK_ICONS: Record<LessonBlockType, LucideIcon> = {
  text: Type,
  video: Video,
  code: Code2,
  math: Sigma,
  image: ImageIcon,
  presentation: Presentation,
};

const BLOCK_HINTS: Record<LessonBlockType, string> = {
  text: "Rich text, headings and notes",
  video: "Upload a file or paste a link",
  code: "Launch a course coding pad",
  math: "Equations with live preview",
  image: "Gallery with captions",
  presentation: "Image and text slides",
};

const BLOCK_TONES: Record<LessonBlockType, string> = {
  text: "bg-brand-50 text-brand-600 ring-brand-100",
  video: "bg-rose-50 text-rose-600 ring-rose-100",
  code: "bg-sky-50 text-sky-600 ring-sky-100",
  math: "bg-violet-50 text-violet-600 ring-violet-100",
  image: "bg-amber-50 text-amber-600 ring-amber-100",
  presentation: "bg-emerald-50 text-emerald-600 ring-emerald-100",
};

type Dragging =
  | { kind: "palette"; type: LessonBlockType }
  | { kind: "block"; id: string };

type VideoBlock = Extract<LessonBlock, { type: "video" }>;
type ImageBlock = Extract<LessonBlock, { type: "image" }>;
type PresentationBlock = Extract<LessonBlock, { type: "presentation" }>;

function attachmentIdFromUrl(url: string) {
  return url.match(/\/api\/files\/([^?]+)/)?.[1] ?? "";
}

function cloneWithNewIds(block: LessonBlock): LessonBlock {
  const copy = JSON.parse(JSON.stringify(block)) as LessonBlock;
  copy.id = createId();
  if (copy.type === "image") {
    copy.images = copy.images.map((image) => ({ ...image, id: createId("i") }));
  }
  if (copy.type === "presentation") {
    copy.slides = copy.slides.map((slide) => ({ ...slide, id: createId("s") }));
  }
  return copy;
}

export function LessonBlockBuilder({
  content = "",
  contentBlocks,
  meetingUrl = "",
  codePadId = null,
  codePads = [],
  courseId,
  lessonId,
  attachments = [],
  providerOptions = [],
}: {
  content?: string;
  contentBlocks?: string | null;
  meetingUrl?: string | null;
  codePadId?: string | null;
  codePads?: { id: string; title: string; language: string; published: boolean }[];
  courseId: string;
  lessonId: string;
  attachments?: { id: string; name: string; kind: string }[];
  providerOptions?: { value: string; label: string; detail?: string }[];
}) {
  const [blocks, setBlocks] = useState<LessonBlock[]>(() =>
    parseLessonBlocks(contentBlocks, { content, meetingUrl, codePadId })
  );
  const [expandedId, setExpandedId] = useState<string | null>(() => blocks[0]?.id ?? null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [previewBlock, setPreviewBlock] = useState<LessonBlock | null>(null);

  const markdown = blocksToMarkdown(blocks);
  const legacyMeetingUrl = blocksToMeetingUrl(blocks) ?? "";
  const legacyCodePadId = blocksToCodePadId(blocks) ?? "";

  function updateBlock(id: string, updater: (block: LessonBlock) => LessonBlock) {
    setBlocks((current) => current.map((block) => (block.id === id ? updater(block) : block)));
  }

  function patchVideo(id: string, patch: Partial<VideoBlock>) {
    updateBlock(id, (block) => (block.type === "video" ? { ...block, ...patch } : block));
  }

  function patchImage(id: string, patch: Partial<ImageBlock>) {
    updateBlock(id, (block) => (block.type === "image" ? { ...block, ...patch } : block));
  }

  function patchPresentation(id: string, patch: Partial<PresentationBlock>) {
    updateBlock(id, (block) => (block.type === "presentation" ? { ...block, ...patch } : block));
  }

  function addBlock(type: LessonBlockType, index = blocks.length) {
    const block = createLessonBlock(type);
    setBlocks((current) => {
      const next = [...current];
      next.splice(Math.max(0, Math.min(index, next.length)), 0, block);
      return next;
    });
    setExpandedId(block.id);
  }

  function removeBlock(id: string) {
    setBlocks((current) => current.filter((block) => block.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function duplicateBlock(block: LessonBlock) {
    const copy = cloneWithNewIds(block);
    setBlocks((current) => {
      const index = current.findIndex((item) => item.id === block.id);
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setExpandedId(copy.id);
  }

  function moveBlock(id: string, toIndex: number) {
    setBlocks((current) => {
      const from = current.findIndex((block) => block.id === id);
      if (from < 0) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(from < toIndex ? toIndex - 1 : toIndex, 0, item);
      return next;
    });
  }

  function startDrag(event: DragEvent<HTMLElement>, next: Dragging) {
    event.dataTransfer.setData(
      "text/plain",
      next.kind === "palette" ? `type:${next.type}` : `id:${next.id}`
    );
    event.dataTransfer.effectAllowed = next.kind === "palette" ? "copy" : "move";
    setDragging(next);
  }

  function dropAt(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault();
    const data = event.dataTransfer.getData("text/plain");
    if (data.startsWith("type:")) {
      const type = data.slice(5) as LessonBlockType;
      if (LESSON_BLOCK_TYPES.includes(type)) addBlock(type, index);
    } else if (data.startsWith("id:")) {
      moveBlock(data.slice(3), index);
    }
    setDragging(null);
    setDropIndex(null);
  }

  function applyGlobalMarkdown(next: string) {
    setBlocks((current) => {
      const index = current.findIndex((block) => block.type === "text");
      if (index === -1) return [{ ...createLessonBlock("text"), content: next }, ...current];
      const copy = [...current];
      const textBlock = copy[index];
      copy[index] = textBlock.type === "text" ? { ...textBlock, content: next } : textBlock;
      return copy;
    });
  }

  function renderEditor(block: LessonBlock) {
    switch (block.type) {
      case "text":
        return (
          <div className="space-y-2">
            <div className="flex justify-end">
              <TextBlockAssistant
                fieldName={`block-${block.id}-text`}
                lessonId={lessonId}
                courseId={courseId}
                attachments={attachments}
                providerOptions={providerOptions}
              />
            </div>
            <RichTextEditor
              key={block.id}
              name={`block-${block.id}-text`}
              label=""
              rows={8}
              value={block.content}
              onChange={(next) =>
                updateBlock(block.id, (item) => (item.type === "text" ? { ...item, content: next } : item))
              }
              placeholder="Write this section. Use the toolbar for headings, lists, links and formatting."
            />
          </div>
        );

      case "video":
        return (
          <div className="space-y-3">
            <div>
              <span className="label">Section title</span>
              <input
                value={block.title}
                onChange={(event) => patchVideo(block.id, { title: event.target.value })}
                placeholder="e.g. Watch: modelling projectile motion"
                className="input"
              />
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              {(["link", "upload"] as const).map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => patchVideo(block.id, { source, url: "", attachmentId: "" })}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition",
                    block.source === source
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {source === "link" ? <Link2 className="size-3.5" /> : <Video className="size-3.5" />}
                  {source === "link" ? "Video link" : "Upload video"}
                </button>
              ))}
            </div>
            {block.source === "link" ? (
              <div>
                <span className="label">Video URL</span>
                <input
                  type="url"
                  value={block.url}
                  onChange={(event) => patchVideo(block.id, { url: event.target.value })}
                  placeholder="https://youtube.com/watch?v=… or any lesson link"
                  className="input"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  YouTube and Vimeo links play inline. Other links become a styled open button.
                </p>
              </div>
            ) : (
              <UploadField
                name={`video-${block.id}`}
                defaultUrl={block.url}
                accept="video/*"
                courseId={courseId}
                lessonId={lessonId}
                label="Video file"
                hint="MP4, WebM, MOV or other browser-playable video · 25 MB max"
                onUploaded={(file) =>
                  patchVideo(block.id, {
                    url: file.url,
                    attachmentId: file.id ?? attachmentIdFromUrl(file.url),
                  })
                }
              />
            )}
          </div>
        );

      case "code":
        return (
          <div className="space-y-3">
            <div>
              <span className="label">Section title</span>
              <input
                value={block.title}
                onChange={(event) =>
                  updateBlock(block.id, (item) =>
                    item.type === "code" ? { ...item, title: event.target.value } : item
                  )
                }
                className="input"
              />
            </div>
            <div>
              <span className="label">Coding pad</span>
              <select
                value={block.padId}
                onChange={(event) =>
                  updateBlock(block.id, (item) =>
                    item.type === "code" ? { ...item, padId: event.target.value } : item
                  )
                }
                className="select"
              >
                <option value="">Choose a coding pad…</option>
                {codePads.map((pad) => (
                  <option key={pad.id} value={pad.id}>
                    {pad.title} · {pad.language}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-400">
                Create pads in the course’s Coding pads tab, then link them here.
              </p>
            </div>
          </div>
        );

      case "math":
        return (
          <div className="space-y-3">
            <div>
              <span className="label">Section title</span>
              <input
                value={block.title}
                onChange={(event) =>
                  updateBlock(block.id, (item) =>
                    item.type === "math" ? { ...item, title: event.target.value } : item
                  )
                }
                className="input"
              />
            </div>
            <div>
              <span className="label">Equation or working (TeX)</span>
              <textarea
                value={block.content}
                onChange={(event) =>
                  updateBlock(block.id, (item) =>
                    item.type === "math" ? { ...item, content: event.target.value } : item
                  )
                }
                rows={4}
                placeholder="h(t) = at^2 + bt + c"
                className="input font-mono text-xs"
              />
            </div>
          </div>
        );

      case "image":
        return (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div>
                <span className="label">Gallery title</span>
                <input
                  value={block.title}
                  onChange={(event) => patchImage(block.id, { title: event.target.value })}
                  className="input"
                />
              </div>
              <div>
                <span className="label">Columns</span>
                <select
                  value={block.columns}
                  onChange={(event) =>
                    patchImage(block.id, { columns: Number(event.target.value) === 3 ? 3 : 2 })
                  }
                  className="select"
                >
                  <option value={2}>Two</option>
                  <option value={3}>Three</option>
                </select>
              </div>
            </div>
            <div className="space-y-3">
              {block.images.map((image, index) => (
                <div key={image.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Image {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        patchImage(block.id, {
                          images: block.images.filter((item) => item.id !== image.id),
                        })
                      }
                      className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Remove image"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <UploadField
                    name={`image-${image.id}`}
                    defaultUrl={image.url}
                    accept="image/*"
                    courseId={courseId}
                    lessonId={lessonId}
                    label="Image"
                    hint="PNG, JPG, GIF, WebP or SVG · 25 MB max"
                    onUploaded={(file) =>
                      patchImage(block.id, {
                        images: block.images.map((item) =>
                          item.id === image.id ? { ...item, url: file.url } : item
                        ),
                      })
                    }
                  />
                  <input
                    value={image.caption}
                    onChange={(event) =>
                      patchImage(block.id, {
                        images: block.images.map((item) =>
                          item.id === image.id ? { ...item, caption: event.target.value } : item
                        ),
                      })
                    }
                    placeholder="Caption (optional)"
                    className="input mt-2"
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                patchImage(block.id, {
                  images: [...block.images, { id: createId("i"), url: "", caption: "" }],
                })
              }
              className="btn-secondary btn-sm"
            >
              <Plus className="size-3.5" /> Add image
            </button>
          </div>
        );

      case "presentation":
        return (
          <div className="space-y-3">
            <div>
              <span className="label">Presentation title</span>
              <input
                value={block.title}
                onChange={(event) => patchPresentation(block.id, { title: event.target.value })}
                className="input"
              />
            </div>
            <div className="space-y-3">
              {block.slides.map((slide, index) => (
                <div key={slide.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Slide {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        patchPresentation(block.id, {
                          slides: block.slides.filter((item) => item.id !== slide.id),
                        })
                      }
                      className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Remove slide"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <input
                      value={slide.title}
                      onChange={(event) =>
                        patchPresentation(block.id, {
                          slides: block.slides.map((item) =>
                            item.id === slide.id ? { ...item, title: event.target.value } : item
                          ),
                        })
                      }
                      placeholder="Slide heading"
                      className="input"
                    />
                    <textarea
                      value={slide.text}
                      onChange={(event) =>
                        patchPresentation(block.id, {
                          slides: block.slides.map((item) =>
                            item.id === slide.id ? { ...item, text: event.target.value } : item
                          ),
                        })
                      }
                      rows={3}
                      placeholder="Short notes or caption (Markdown works)"
                      className="input"
                    />
                    <UploadField
                      name={`slide-${slide.id}`}
                      defaultUrl={slide.imageUrl}
                      accept="image/*"
                      courseId={courseId}
                      lessonId={lessonId}
                      label="Slide image (optional)"
                      hint="PNG, JPG, GIF, WebP or SVG · 25 MB max"
                      onUploaded={(file) =>
                        patchPresentation(block.id, {
                          slides: block.slides.map((item) =>
                            item.id === slide.id ? { ...item, imageUrl: file.url } : item
                          ),
                        })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                patchPresentation(block.id, {
                  slides: [
                    ...block.slides,
                    { id: createId("s"), title: "", text: "", imageUrl: "" },
                  ],
                })
              }
              className="btn-secondary btn-sm"
            >
              <Plus className="size-3.5" /> Add slide
            </button>
          </div>
        );
    }
  }

  function renderDropZone(index: number) {
    return (
      <div
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = dragging?.kind === "palette" ? "copy" : "move";
          setDropIndex(index);
        }}
        onDrop={(event) => dropAt(event, index)}
        className="relative h-2.5"
      >
        {dropIndex === index && dragging && (
          <span className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-brand-500 shadow-[0_0_0_2px_rgba(255,255,255,0.9)]" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <textarea
        name="content"
        value={markdown}
        onChange={(event) => applyGlobalMarkdown(event.target.value)}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      <input type="hidden" name="contentBlocks" value={JSON.stringify(blocks)} />
      <input type="hidden" name="meetingUrl" value={legacyMeetingUrl} />
      <input type="hidden" name="codePadId" value={legacyCodePadId} />

      <div>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <span className="label">Add a block</span>
            <p className="text-[10px] text-slate-400">
              Drag a card into the lesson, or click to add it at the end. Drag the handle on a block
              to reorder.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <details className="relative">
              <summary className="btn-ghost btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <LayoutGrid className="size-3.5" /> Quick add
              </summary>
              <div className="absolute right-0 z-30 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Add a block
                </p>
                {LESSON_BLOCK_TYPES.map((type) => {
                  const Icon = BLOCK_ICONS[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={(event) => {
                        addBlock(type);
                        event.currentTarget.closest("details")?.removeAttribute("open");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-700"
                    >
                      <Icon className="size-3.5 shrink-0 text-slate-400" />
                      <span className="flex-1">{LESSON_BLOCK_LABELS[type]}</span>
                      <span className="text-[9px] text-slate-300">+</span>
                    </button>
                  );
                })}
              </div>
            </details>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              {blocks.length} block{blocks.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {LESSON_BLOCK_TYPES.map((type) => {
            const Icon = BLOCK_ICONS[type];
            return (
              <button
                key={type}
                type="button"
                draggable
                onDragStart={(event) => startDrag(event, { kind: "palette", type })}
                onDragEnd={() => {
                  setDragging(null);
                  setDropIndex(null);
                }}
                onClick={() => addBlock(type)}
                className="group flex flex-col items-start gap-1 rounded-xl border border-dashed border-slate-200 bg-white p-2 text-left transition hover:border-brand-300 hover:bg-brand-50/50"
                title={`Drag or click to add ${LESSON_BLOCK_LABELS[type]}`}
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-lg ring-1 ring-inset",
                    BLOCK_TONES[type]
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="text-[11px] font-bold text-slate-700">{LESSON_BLOCK_LABELS[type]}</span>
                <span className="text-[9px] leading-3 text-slate-400">{BLOCK_HINTS[type]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2 sm:p-3">
        {renderDropZone(0)}
        {blocks.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
            <p className="text-sm font-semibold text-slate-700">No blocks yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Add a Text block to start, then drag in media as you build the lesson.
            </p>
          </div>
        )}
        {blocks.map((block, index) => {
          const Icon = BLOCK_ICONS[block.type];
          const expanded = expandedId === block.id;
          return (
            <div key={block.id}>
              {index > 0 && renderDropZone(index)}
              <section
                className={cn(
                  "overflow-hidden rounded-2xl border bg-white shadow-sm transition",
                  expanded ? "border-brand-200 shadow-md" : "border-slate-200",
                  dragging?.kind === "block" && dragging.id === block.id && "opacity-50"
                )}
              >
                <div className="flex items-center gap-2 px-2.5 py-2.5 sm:px-3">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => startDrag(event, { kind: "block", id: block.id })}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropIndex(null);
                    }}
                    className="cursor-grab rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
                    title="Drag to reorder"
                    aria-label={`Drag ${LESSON_BLOCK_LABELS[block.type]} block to reorder`}
                  >
                    <GripVertical className="size-4" />
                  </button>
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
                      BLOCK_TONES[block.type]
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : block.id)}
                    className="min-w-0 flex-1 text-left"
                    aria-expanded={expanded}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {LESSON_BLOCK_LABELS[block.type]}
                      </span>
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {blockSummary(block)}
                    </span>
                  </button>
                  <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
                    <button
                      type="button"
                      onClick={() => setPreviewBlock(block)}
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Preview block"
                      aria-label="Preview block"
                    >
                      <Eye className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBlock(block.id, index - 1)}
                      disabled={index === 0}
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      title="Move up"
                      aria-label="Move block up"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBlock(block.id, index + 2)}
                      disabled={index === blocks.length - 1}
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      title="Move down"
                      aria-label="Move block down"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateBlock(block)}
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Duplicate block"
                      aria-label="Duplicate block"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Delete block"
                      aria-label="Delete block"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : block.id)}
                    className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={expanded ? "Collapse block" : "Expand block"}
                  >
                    {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                </div>
                <div className="flex items-center gap-1 border-t border-slate-100 px-3 py-1.5 sm:hidden">
                  <button type="button" onClick={() => setPreviewBlock(block)} className="btn-ghost btn-sm">
                    <Eye className="size-3" /> Preview
                  </button>
                  <button type="button" onClick={() => moveBlock(block.id, index - 1)} disabled={index === 0} className="btn-ghost btn-sm">
                    <ArrowUp className="size-3" /> Up
                  </button>
                  <button type="button" onClick={() => moveBlock(block.id, index + 2)} disabled={index === blocks.length - 1} className="btn-ghost btn-sm">
                    <ArrowDown className="size-3" /> Down
                  </button>
                  <button type="button" onClick={() => duplicateBlock(block)} className="btn-ghost btn-sm">
                    <Copy className="size-3" /> Duplicate
                  </button>
                  <button type="button" onClick={() => removeBlock(block.id)} className="btn-ghost btn-sm text-rose-600">
                    <Trash2 className="size-3" /> Delete
                  </button>
                </div>
                {expanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">
                    {renderEditor(block)}
                  </div>
                )}
              </section>
            </div>
          );
        })}
        {renderDropZone(blocks.length)}
      </div>

      <OverlayModal
        open={Boolean(previewBlock)}
        onClose={() => setPreviewBlock(null)}
        title={
          previewBlock
            ? `${LESSON_BLOCK_LABELS[previewBlock.type]} block preview`
            : "Block preview"
        }
        subtitle="How this block appears to learners"
        size="lg"
      >
        <div className="mx-auto max-w-3xl">
          {previewBlock && (
            <LessonBlocks
              blocks={[previewBlock]}
              courseId={courseId}
              codePads={codePads}
              teacher
            />
          )}
        </div>
      </OverlayModal>
    </div>
  );
}
