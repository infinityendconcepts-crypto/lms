"use client";

import { useRef, useState } from "react";
import {
  Bold,
  Code2,
  Eye,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Sigma,
  Strikethrough,
} from "lucide-react";
import { MathText } from "@/components/MathText";
import { cn } from "@/lib/utils";

const SNIPPETS: { label: string; value: string }[] = [
  { label: "x²", value: "x^2" },
  { label: "√", value: "\\sqrt{x}" },
  { label: "a/b", value: "\\frac{a}{b}" },
  { label: "π", value: "\\pi" },
  { label: "≤", value: "\\le" },
  { label: "≥", value: "\\ge" },
  { label: "±", value: "\\pm" },
  { label: "θ", value: "\\theta" },
  { label: "Σ", value: "\\sum_{i=1}^{n}" },
  { label: "∫", value: "\\int_{a}^{b}" },
  { label: "lim", value: "\\lim_{x \\to 0}" },
];

export type FormatAction =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bold"
  | "italic"
  | "strikethrough"
  | "bullet"
  | "number"
  | "quote"
  | "link"
  | "code"
  | "codeblock";

type FormatResult = {
  next: string;
  selectionStart: number;
  selectionEnd: number;
};

/**
 * Apply a Markdown formatting action to a textarea selection. Shared by the
 * lesson editor and the question builder so both write the same syntax.
 */
export function formatSelection(
  value: string,
  start: number,
  end: number,
  action: FormatAction
): FormatResult {
  const selected = value.slice(start, end);

  function wrap(before: string, after: string, fallback: string): FormatResult {
    const text = selected || fallback;
    return {
      next: value.slice(0, start) + before + text + after + value.slice(end),
      selectionStart: start + before.length,
      selectionEnd: start + before.length + text.length,
    };
  }

  function replaceLines(prefix: string): FormatResult {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = value.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const block = value.slice(lineStart, lineEnd);
    const marker = /^(?:#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+)/;
    const replaced = block
      .split("\n")
      .map((line) => prefix + line.replace(marker, ""))
      .join("\n");
    return {
      next: value.slice(0, lineStart) + replaced + value.slice(lineEnd),
      selectionStart: lineStart,
      selectionEnd: lineStart + replaced.length,
    };
  }

  switch (action) {
    case "paragraph":
      return replaceLines("");
    case "heading1":
      return replaceLines("# ");
    case "heading2":
      return replaceLines("## ");
    case "heading3":
      return replaceLines("### ");
    case "bold":
      return wrap("**", "**", "bold text");
    case "italic":
      return wrap("*", "*", "italic text");
    case "strikethrough":
      return wrap("~~", "~~", "struck out text");
    case "bullet":
      return replaceLines("- ");
    case "number":
      return replaceLines("1. ");
    case "quote":
      return replaceLines("> ");
    case "link": {
      const text = selected || "link text";
      const before = `[${text}](`;
      const after = ")";
      const urlStart = start + before.length;
      return {
        next: value.slice(0, start) + before + "https://" + after + value.slice(end),
        selectionStart: urlStart,
        selectionEnd: urlStart + "https://".length,
      };
    }
    case "code":
      return wrap("`", "`", "code");
    case "codeblock":
      return wrap("```\n", "\n```", "code");
  }
}

const FORMAT_BUTTONS: {
  action: FormatAction;
  label: string;
  title: string;
  icon: typeof Bold;
}[] = [
  { action: "bold", label: "Bold", title: "Bold (**text**)", icon: Bold },
  { action: "italic", label: "Italic", title: "Italic (*text*)", icon: Italic },
  {
    action: "strikethrough",
    label: "Strikethrough",
    title: "Strikethrough (~~text~~)",
    icon: Strikethrough,
  },
  { action: "bullet", label: "Bulleted list", title: "Bulleted list (- item)", icon: List },
  {
    action: "number",
    label: "Numbered list",
    title: "Numbered list (1. item)",
    icon: ListOrdered,
  },
  { action: "quote", label: "Quote", title: "Quote (> text)", icon: Quote },
  { action: "link", label: "Link", title: "Link ([text](url))", icon: Link2 },
  { action: "code", label: "Inline code", title: "Inline code (`code`)", icon: Code2 },
  {
    action: "codeblock",
    label: "Code block",
    title: "Code block (```code```)",
    icon: Code2,
  },
];

/**
 * Small WordPress-style toolbar: a Paragraph dropdown, compact icon buttons,
 * and optional math/preview controls. It writes Markdown, so the content stays
 * portable and renders through the app's existing MathText component.
 */
export function EditorToolbar({
  onFormat,
  onInsertImage,
  onPreview,
  mathEnabled,
  onMathToggle,
  compact = false,
}: {
  onFormat: (action: FormatAction) => void;
  onInsertImage?: () => void;
  onPreview?: () => void;
  mathEnabled?: boolean;
  onMathToggle?: () => void;
  compact?: boolean;
}) {
  const [blockStyle, setBlockStyle] = useState("");

  function applyBlock(value: string) {
    if (value) onFormat(value as FormatAction);
    setBlockStyle("");
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1",
        compact && "px-1 py-0.5"
      )}
    >
      <select
        aria-label="Text style"
        value={blockStyle}
        onChange={(e) => applyBlock(e.target.value)}
        className="h-7 w-[106px] rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none"
      >
        <option value="">Paragraph</option>
        <option value="heading1">Heading 1</option>
        <option value="heading2">Heading 2</option>
        <option value="heading3">Heading 3</option>
        <option value="quote">Blockquote</option>
      </select>
      <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
      {FORMAT_BUTTONS.map(({ action, label, title, icon: Icon }) => (
        <button
          key={action}
          type="button"
          onClick={() => onFormat(action)}
          title={title}
          aria-label={label}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded border border-transparent text-slate-600 transition hover:border-slate-200 hover:bg-white hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <Icon className="size-3.5" />
        </button>
      ))}
      {onInsertImage && (
        <>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
          <button
            type="button"
            onClick={onInsertImage}
            title="Add media"
            aria-label="Add media"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded border border-transparent text-slate-600 transition hover:border-slate-200 hover:bg-white hover:text-brand-700"
          >
            <ImagePlus className="size-3.5" />
          </button>
        </>
      )}
      {onMathToggle && (
        <button
          type="button"
          onClick={onMathToggle}
          aria-pressed={Boolean(mathEnabled)}
          title="Math snippets"
          aria-label="Math snippets"
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded border transition",
            mathEnabled
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-brand-700"
          )}
        >
          <Sigma className="size-3.5" />
        </button>
      )}
      {onPreview && (
        <button
          type="button"
          onClick={onPreview}
          title="Preview"
          aria-label="Preview"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded border border-transparent text-slate-600 transition hover:border-slate-200 hover:bg-white hover:text-brand-700"
        >
          <Eye className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function MathToolbar({
  onInsert,
  compact = false,
}: {
  onInsert: (snippet: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "thin-scroll flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-1.5 py-1",
        compact ? "text-[11px]" : "text-xs"
      )}
    >
      <span className="mr-1 inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-1 font-mono text-[10px] text-slate-500">
        <Sigma className="size-3" /> TeX
      </span>
      {SNIPPETS.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onInsert(s.value)}
          className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          title={`Insert ${s.value}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Set a form field's value from outside a controlled component (used by the AI
 * assist panel to fill the summary and content editors). Uses the native value
 * setter so React's change tracking picks it up.
 */
export function setFormFieldValue(name: string, value: string) {
  if (typeof document === "undefined") return false;
  const el = document.querySelector(`[name="${CSS.escape(name)}"]`) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null;
  if (!el) return false;
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export function RichTextEditor({
  name,
  defaultValue = "",
  placeholder = "Write your content with Markdown formatting.",
  rows = 8,
  required = false,
  label = "Content",
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [mode, setMode] = useState<"visual" | "code">("visual");
  const [preview, setPreview] = useState(false);
  const [mathEnabled, setMathEnabled] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  function focusSelection(selectionStart: number, selectionEnd: number) {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function insertText(text: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    setValue(next);
    focusSelection(start + text.length, start + text.length);
  }

  function insertMath(snippet: string) {
    insertText(snippet);
  }

  function applyFormat(action: FormatAction) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const result = formatSelection(value, start, end, action);
    setValue(result.next);
    focusSelection(result.selectionStart, result.selectionEnd);
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setUploadError("");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      const alt = file.name.replace(/\.[^.]+$/, "") || "image";
      setPreview(false);
      setMode("visual");
      insertText(`\n![${alt}](${json.url})\n`);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const showPreview = preview && mode === "visual";

  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 py-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-brand-700 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
            {uploading ? "Uploading…" : "Add media"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadImage(file);
            }}
          />
          <div className="flex items-center rounded-md border border-slate-200 bg-slate-100 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setMode("visual");
                setPreview(false);
              }}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition",
                mode === "visual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              Visual
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("code");
                setPreview(false);
              }}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition",
                mode === "code" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              Code
            </button>
          </div>
        </div>

        {mode === "visual" ? (
          <>
            <EditorToolbar
              onFormat={applyFormat}
              onInsertImage={() => fileRef.current?.click()}
              onPreview={() => setPreview((p) => !p)}
              mathEnabled={mathEnabled}
              onMathToggle={() => setMathEnabled((enabled) => !enabled)}
            />
            {mathEnabled && (
              <MathToolbar onInsert={insertMath} compact />
            )}
            {showPreview ? (
              <div className="min-h-48 bg-white p-4">
                {value.trim() ? (
                  <MathText content={value} />
                ) : (
                  <p className="text-sm text-slate-400">Nothing to preview yet.</p>
                )}
              </div>
            ) : (
              <textarea
                ref={ref}
                id={name}
                name={name}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                rows={rows}
                required={required}
                className="w-full resize-y border-0 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:ring-0 focus:outline-none"
              />
            )}
            {showPreview && <input type="hidden" name={name} value={value} />}
          </>
        ) : (
          <textarea
            ref={ref}
            id={name}
            name={name}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            required={required}
            className="w-full resize-y border-0 bg-white px-4 py-3 font-mono text-xs leading-relaxed text-slate-800 placeholder:text-slate-400 focus:ring-0 focus:outline-none"
          />
        )}
      </div>

      {uploadError && <p className="mt-1.5 text-xs font-medium text-rose-600">{uploadError}</p>}
      <p className="mt-1.5 text-[11px] text-slate-400">
        Visual mode writes Markdown · Code mode shows the raw source · Math is off until enabled
      </p>
    </div>
  );
}
