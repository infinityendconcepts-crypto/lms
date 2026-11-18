import { Video } from "lucide-react";
import { parseVideoEmbed } from "@/lib/video-link";

/**
 * Responsive, sandboxed player for a lesson URL. Returns null for links that
 * are not on the YouTube/Vimeo allowlist so callers can fall back to a link.
 */
export function LessonVideoEmbed({ url }: { url: string | null | undefined }) {
  const embed = parseVideoEmbed(url);
  if (!embed) return null;

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm">
      <div className="relative aspect-video w-full">
        <iframe
          src={embed.embedUrl}
          title={embed.label}
          className="absolute inset-0 size-full"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
    </div>
  );
}

/** Native player for an uploaded video attachment served through /api/files. */
export function UploadedVideoPlayer({
  attachmentId,
  name,
}: {
  attachmentId: string;
  name: string;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm">
      <video
        className="aspect-video w-full bg-black"
        controls
        preload="metadata"
        playsInline
        poster={undefined}
        src={`/api/files/${attachmentId}`}
      >
        <track kind="captions" />
        Your browser does not support embedded video.{" "}
        <a href={`/api/files/${attachmentId}`} className="text-brand-300 underline">
          Download {name}
        </a>
      </video>
      <div className="flex items-center gap-2 px-4 py-2 text-[11px] text-slate-300">
        <Video className="size-3.5" /> {name}
      </div>
    </div>
  );
}
