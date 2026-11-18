"use client";

import { useRef, useState } from "react";
import { Eye, Pencil, Sigma } from "lucide-react";
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

export function MathToolbar({
  onInsert,
  compact = false,
}: {
  onInsert: (snippet: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", compact ? "text-[11px]" : "text-xs")}>
      <span className="mr-1 inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-1 font-mono text-[10px] text-slate-500">
        <Sigma className="size-3" /> TeX
      </span>
      {SNIPPETS.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onInsert(s.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
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
  placeholder = "Write your content. Use $...$ for inline math and $$...$$ for display math.",
  rows = 8,
  required = false,
  label = "Content",
  toolbar = true,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  label?: string;
  toolbar?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [mode, setMode] = useState<"write" | "preview">("write");

  function insert(snippet: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const wrapped = snippet.includes("{") && /[a-z]/i.test(snippet) ? snippet : snippet;
    const next = value.slice(0, start) + wrapped + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + wrapped.length;
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
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
          {toolbar && (
            <div className="mb-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-1.5">
              <MathToolbar onInsert={insert} compact />
            </div>
          )}
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
        Markdown supported · <code className="rounded bg-slate-100 px-1">$x^2$</code> inline ·{" "}
        <code className="rounded bg-slate-100 px-1">$$∫$$</code> display
      </p>
    </div>
  );
}
