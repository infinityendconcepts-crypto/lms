"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Uploaded = { id?: string; url: string; name: string; kind: string; size: number };

export function UploadField({
  name = "url",
  defaultUrl = "",
  label = "Attachment",
  accept,
  courseId,
  lessonId,
  onUploaded,
  compact = false,
  hint,
  refreshOnUpload = false,
}: {
  name?: string;
  defaultUrl?: string;
  label?: string;
  accept?: string;
  courseId?: string;
  lessonId?: string;
  onUploaded?: (file: Uploaded) => void;
  compact?: boolean;
  hint?: string;
  refreshOnUpload?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [url, setUrl] = useState(defaultUrl);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      if (courseId) body.set("courseId", courseId);
      if (lessonId) body.set("lessonId", lessonId);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setUrl(json.url);
      setFileName(json.name);
      onUploaded?.(json);
      if (refreshOnUpload) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const isImage = /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?|&|$)/i.test(url);

  return (
    <div>
      <span className="label">{label}</span>
      <input type="hidden" name={name} value={url} />
      <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5")}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn("btn-secondary btn-sm", busy && "opacity-70")}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : isImage ? (
            <ImagePlus className="size-3.5" />
          ) : (
            <Paperclip className="size-3.5" />
          )}
          {busy ? "Uploading…" : url ? "Replace file" : "Upload file"}
        </button>
        {url && (
          <>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 max-w-full truncate text-xs font-medium text-brand-600 hover:underline sm:max-w-[220px]"
            >
              {fileName || url.split("/").pop()}
            </a>
            <button
              type="button"
              onClick={() => {
                setUrl("");
                setFileName("");
                onUploaded?.({ url: "", name: "", kind: "", size: 0 });
              }}
              className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              title="Remove file"
            >
              <X className="size-3.5" />
            </button>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      {isImage && url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Preview"
          className="mt-2 max-h-40 max-w-full rounded-xl border border-slate-200 object-contain"
        />
      )}
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
      <p className="mt-1.5 text-[11px] text-slate-400">
        {hint ?? "PDF, Word, PowerPoint, Excel, images, audio, video, CSV, ZIP · up to 25 MB"}
      </p>
    </div>
  );
}
