import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Code2,
  Image as ImageIcon,
  Presentation,
  Sigma,
  Type,
  Video,
  type LucideIcon,
} from "lucide-react";
import { MathText } from "@/components/MathText";
import { parseVideoEmbed } from "@/lib/video-link";
import { cn } from "@/lib/utils";
import { LESSON_BLOCK_LABELS, type LessonBlock } from "@/lib/lesson-blocks";

const ICONS: Record<LessonBlock["type"], LucideIcon> = {
  text: Type,
  video: Video,
  code: Code2,
  math: Sigma,
  image: ImageIcon,
  presentation: Presentation,
};

const ACCENTS: Record<LessonBlock["type"], string> = {
  text: "from-brand-500 via-sky-400 to-violet-400",
  video: "from-rose-500 via-orange-400 to-amber-300",
  code: "from-sky-600 via-cyan-400 to-teal-300",
  math: "from-violet-600 via-fuchsia-400 to-pink-300",
  image: "from-amber-500 via-orange-400 to-rose-300",
  presentation: "from-emerald-600 via-teal-400 to-cyan-300",
};

function BlockShell({
  block,
  index,
  children,
}: {
  block: LessonBlock;
  index: number;
  children: ReactNode;
}) {
  const Icon = ICONS[block.type];
  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)]">
      <div className={cn("h-1 w-full bg-gradient-to-r", ACCENTS[block.type])} />
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 sm:px-7">
        <span className="flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon className="size-3.5" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {LESSON_BLOCK_LABELS[block.type]}
        </span>
        <span className="ml-auto text-[10px] font-bold tabular-nums text-slate-300">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <div className="px-5 py-5 sm:px-7 sm:py-6">{children}</div>
    </section>
  );
}

function VideoBody({ block }: { block: Extract<LessonBlock, { type: "video" }> }) {
  const embed = block.source === "link" ? parseVideoEmbed(block.url) : null;

  return (
    <div className="space-y-4">
      {block.title && (
        <h3 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{block.title}</h3>
      )}
      {embed ? (
        <div className="overflow-hidden rounded-2xl bg-slate-900 shadow-lg ring-1 ring-slate-900/10">
          <div className="relative aspect-video w-full">
            <iframe
              src={embed.embedUrl}
              title={block.title || embed.label}
              className="absolute inset-0 size-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            />
          </div>
        </div>
      ) : block.source === "upload" && block.url ? (
        <div className="overflow-hidden rounded-2xl bg-slate-900 shadow-lg ring-1 ring-slate-900/10">
          <video
            src={block.url}
            controls
            preload="metadata"
            playsInline
            className="aspect-video w-full bg-black"
          >
            Your browser does not support embedded video.
            <a href={block.url} className="text-brand-300 underline">
              Download the video
            </a>
          </video>
        </div>
      ) : block.url ? (
        <a
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col gap-4 rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-5 transition hover:border-rose-200 hover:shadow-md sm:flex-row sm:items-center"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-rose-600 shadow-sm ring-1 ring-rose-100">
            <Video className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900">
              {block.title || "Open the video resource"}
            </span>
            <span className="block truncate text-xs text-slate-500">{block.url}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-rose-700">
            Open <ArrowUpRight className="size-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </a>
      ) : (
        <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-xs text-slate-400">
          No video has been added yet.
        </p>
      )}
    </div>
  );
}

export function LessonBlocks({
  blocks,
  courseId,
  codePads = [],
  teacher = false,
}: {
  blocks: LessonBlock[];
  courseId: string;
  codePads?: { id: string; title: string; language: string; published: boolean }[];
  teacher?: boolean;
}) {
  if (!blocks.length) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-400">
        No lesson blocks yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return (
            <BlockShell key={block.id} block={block} index={index}>
              {block.content.trim() ? (
                <MathText content={block.content} className="text-[15px] leading-7 text-slate-700" />
              ) : (
                <p className="text-sm italic text-slate-400">This text section is empty.</p>
              )}
            </BlockShell>
          );
        }

        if (block.type === "video") {
          return (
            <BlockShell key={block.id} block={block} index={index}>
              <VideoBody block={block} />
            </BlockShell>
          );
        }

        if (block.type === "code") {
          const pad = codePads.find((item) => item.id === block.padId);
          const available = pad && (teacher || pad.published);
          return (
            <BlockShell key={block.id} block={block} index={index}>
              <div className="flex flex-col gap-4 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-teal-50 p-5 sm:flex-row sm:items-center">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-sm ring-1 ring-sky-100">
                  <Code2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    {block.title || "Coding practice"}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {pad ? `${pad.title} · ${pad.language}` : "This coding pad is no longer available."}
                  </p>
                </div>
                {available ? (
                  <Link
                    href={`/learn/${courseId}/pads/${pad.id}`}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700"
                  >
                    Open pad <ArrowUpRight className="size-3.5" />
                  </Link>
                ) : (
                  <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-400">
                    Unavailable
                  </span>
                )}
              </div>
            </BlockShell>
          );
        }

        if (block.type === "math") {
          return (
            <BlockShell key={block.id} block={block} index={index}>
              <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-pink-50 p-5">
                {block.title && (
                  <h3 className="mb-3 text-sm font-bold text-slate-900">{block.title}</h3>
                )}
                {block.content.trim() ? (
                  <MathText content={`$$\n${block.content}\n$$`} className="text-slate-800" />
                ) : (
                  <p className="text-xs italic text-slate-400">No equation added yet.</p>
                )}
              </div>
            </BlockShell>
          );
        }

        if (block.type === "image") {
          return (
            <BlockShell key={block.id} block={block} index={index}>
              <h3 className="mb-4 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                {block.title}
              </h3>
              <div
                className={cn(
                  "grid gap-3",
                  block.columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"
                )}
              >
                {block.images.map((image) => (
                  <figure
                    key={image.id}
                    className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt={image.caption || "Lesson image"}
                        className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                    {image.caption && (
                      <figcaption className="px-3 py-2.5 text-[11px] leading-4 text-slate-500">
                        {image.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </BlockShell>
          );
        }

        return (
          <BlockShell key={block.id} block={block} index={index}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                {block.title}
              </h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                Scroll through slides →
              </span>
            </div>
            <div className="thin-scroll -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-3">
              {block.slides.map((slide, slideIndex) => (
                <article
                  key={slide.id}
                  className="w-[85%] shrink-0 snap-center overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-emerald-50/50 shadow-sm sm:w-[60%] lg:w-[48%]"
                >
                  {slide.imageUrl && (
                    <div className="aspect-video overflow-hidden bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={slide.imageUrl}
                        alt={slide.title || `Slide ${slideIndex + 1}`}
                        className="size-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                      Slide {slideIndex + 1}
                    </span>
                    {slide.title && (
                      <h4 className="mt-1 text-base font-bold text-slate-900">{slide.title}</h4>
                    )}
                    {slide.text && (
                      <MathText content={slide.text} className="mt-2 text-sm leading-6 text-slate-600" />
                    )}
                  </div>
                </article>
              ))}
            </div>
          </BlockShell>
        );
      })}
    </div>
  );
}
