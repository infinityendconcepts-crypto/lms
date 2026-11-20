"use client";

import { useRef, useState } from "react";
import {
  Bold,
  Code2,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Quote,
  Sigma,
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
  | "bold"
  | "italic"
  | "heading"
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

  function prefixLines(prefix: string): FormatResult {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = value.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const block = value.slice(lineStart, lineEnd);
    const prefixed = block
      .split("\n")
      .map((line) => prefix + line)
      .join("\n");
    return {
      next: value.slice(0, lineStart) + prefixed + value.slice(lineEnd),
      selectionStart: lineStart,
      selectionEnd: lineStart + prefixed.length,
    };
  }

  switch (action) {
    case "bold":
      return wrap("**", "**", "bold text");
    case "italic":
      return wrap("*", "*", "italic text");
    case "heading":
      return prefixLines("## ");
    case "bullet":
      return prefixLines("- ");
    case "number":
      return prefixLines("1. ");
    case "quote":
      return prefixLines("> ");
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
  { action: "heading", label: "Heading", title: "Heading (## text)", icon: Heading2 },
  { action: "bullet", label: "Bulleted list", title: "Bulleted list (- item)", icon: List },
  { action: "number", label: "Numbered list", title: "Numbered list (1. item)", icon: ListOrdered },
  { action: "quote", label: "Quote", title: "Quote (> text)", icon: Quote },
  { action: "link", label: "Link", title: "Link ([text](url))", icon: Link2 },
  { action: "code", label: "Inline code", title: "Inline code (`code`)", icon: Code2 },
  { action: "codeblock", label: "Code block", title: "Code block (```code```)", icon: Code2 },
];

export function TextFormatToolbar({
  onFormat,
  compact = false,
}: {
  onFormat: (action: FormatAction) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {FORMAT_BUTTONS.map(({ action, label, title, icon: Icon }) => (
        <button
          key={action}
          type="button"
          onClick={() => onFormat(action)}
          title={title}
          aria-label={label}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700",
            compact ? "size-6" : "size-7"
          )}
        >
          <Icon className={compact ? "size-3" : "size-3.5"} />
        </button>
      ))}
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
        "thin-scroll flex flex-nowrap items-center gap-1 overflow-x-auto pb-1",
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
  const [value, setValue] = useState(defaultValue);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [mathEnabled, setMathEnabled] = useState(false);

  function focusSelection(selectionStart: number, selectionEnd: number) {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function insertMath(snippet: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    setValue(next);
    focusSelection(start + snippet.length, start + snippet.length);
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

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <label className="label mb-0" htmlFor={name}>
          {label}
        </label>
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setMode("write")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 font-medium",
              mode === "write" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            )}
          >
            <Pencil className="size-3" /> Write
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 font-medium",
              mode === "preview" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            )}
          >
            <Eye className="size-3" /> Preview
          </button>
        </div>
      </div>

      {mode === "write" ? (
        <>
          <div className="mb-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Format
              </span>
              <TextFormatToolbar onFormat={applyFormat} compact />
              <span className="mx-0.5 hidden h-4 w-px bg-slate-200 sm:block" />
              <button
                type="button"
                onClick={() => setMathEnabled((enabled) => !enabled)}
                aria-pressed={mathEnabled}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition",
                  mathEnabled
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <Sigma className="size-3" /> Math
              </button>
            </div>
            {mathEnabled && (
              <div className="mt-1.5 border-t border-slate-200 pt-1.5">
                <MathToolbar onInsert={insertMath} compact />
                <p className="mt-1 text-[10px] text-slate-400">
                  Inline <code className="rounded bg-slate-100 px-1">$x^2$</code> · Display{" "}
                  <code className="rounded bg-slate-100 px-1">$$...$$</code>
                </p>
              </div>
            )}
          </div>
          <textarea
            ref={ref}
            id={name}
            name={name}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            required={required}
            className="textarea font-mono text-[13px]"
          />
        </>
      ) : (
        <>
          <input type="hidden" name={name} value={value} />
          <div className="min-h-24 rounded-xl border border-slate-200 bg-white p-4">
            {value.trim() ? (
              <MathText content={value} />
            ) : (
              <p className="text-sm text-slate-400">Nothing to preview yet.</p>
            )}
          </div>
        </>
      )}
      <p className="mt-1.5 text-[11px] text-slate-400">
        Markdown supported · turn on Math for LaTeX snippets
      </p>
    </div>
  );
}
