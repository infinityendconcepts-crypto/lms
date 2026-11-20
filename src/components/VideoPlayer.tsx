"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Download,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
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

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Custom controls for an uploaded video served through /api/files. */
export function UploadedVideoPlayer({
  src,
  title,
  poster,
}: {
  src: string;
  title?: string;
  poster?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
    video.playbackRate = speed;
  }, [volume, muted, speed]);

  useEffect(() => {
    function onChange() {
      setFullscreen(document.fullscreenElement === wrapperRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }

  function seek(next: number) {
    const video = videoRef.current;
    if (!video) return;
    const time = Math.min(Math.max(next, 0), duration || 0);
    video.currentTime = time;
    setCurrentTime(time);
  }

  function skip(seconds: number) {
    seek((videoRef.current?.currentTime ?? currentTime) + seconds);
  }

  function toggleMute() {
    if (muted || volume === 0) {
      setMuted(false);
      if (volume === 0) setVolume(0.75);
    } else {
      setMuted(true);
    }
  }

  function toggleFullscreen() {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (document.fullscreenElement === wrapper) {
      void document.exitFullscreen?.();
    } else {
      void wrapper.requestFullscreen?.();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === " " || event.key.toLowerCase() === "k") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      skip(5);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      skip(-5);
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={wrapperRef}
      role="group"
      aria-label={title || "Lesson video"}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="overflow-hidden rounded-2xl bg-slate-900 text-white shadow-lg ring-1 ring-slate-900/10 outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <div className="relative bg-black">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          preload="metadata"
          playsInline
          onClick={togglePlay}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
          className="aspect-video w-full cursor-pointer bg-black"
        >
          Your browser does not support embedded video.{" "}
          <a href={src} className="text-brand-300 underline">
            Download the video
          </a>
        </video>

        {!playing && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play video"
            className="absolute inset-0 flex items-center justify-center bg-slate-950/25 transition hover:bg-slate-950/35"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-xl">
              <Play className="ml-0.5 size-6 fill-current" />
            </span>
          </button>
        )}
      </div>

      <div className="space-y-2 px-3 py-3 sm:px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause video" : "Play video"}
            className="rounded-lg p-1.5 text-white transition hover:bg-white/10"
          >
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Seek video"
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-brand-400"
            style={{
              background: `linear-gradient(to right, rgb(129 140 248) ${progress}%, rgba(255,255,255,0.2) ${progress}%)`,
            }}
          />
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-300">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-slate-300">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted || volume === 0 ? "Unmute video" : "Mute video"}
            className="rounded-lg p-1.5 transition hover:bg-white/10 hover:text-white"
          >
            {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => {
              setVolume(Number(event.target.value));
              setMuted(false);
            }}
            aria-label="Video volume"
            className="h-1.5 w-20 cursor-pointer accent-white"
          />
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            aria-label="Playback speed"
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white outline-none transition hover:bg-white/10"
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value} className="text-slate-900">
                {value}×
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="rounded-lg p-1.5 transition hover:bg-white/10 hover:text-white"
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <a
            href={src}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <Download className="size-3.5" /> Download
          </a>
        </div>
      </div>
    </div>
  );
}
