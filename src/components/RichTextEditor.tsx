"use client";

import { useEffect, useRef, useState } from "react";
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function safeHref(value: string) {
  const href = value.trim();
  return /^(https?:\/\/|mailto:|\/|#)/i.test(href) ? href : "#";
}

function inlineToHtml(text: string) {
  const codeTokens: string[] = [];
  let html = escapeHtml(text);

  html = html.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeTokens.push(`<code>${code}</code>`);
    return `\u0000${codeTokens.length - 1}\u0000`;
  });

  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      return `<a href="${safeHref(href)}">${label}</a>`;
    });

  return html.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => codeTokens[Number(index)] ?? "");
}

function isBlockStart(line: string) {
  return (
    /^\s*```/.test(line) ||
    /^#{1,6}\s/.test(line) ||
    /^\s*(?:[-*+]|\d+\.)\s/.test(line) ||
    /^>\s?/.test(line)
  );
}

function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^\s*```/.test(line)) {
      i += 1;
      const code: string[] = [];
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      html += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      html += `<h${level}>${inlineToHtml(heading[2])}</h${level}>`;
      i += 1;
      continue;
    }

    const ordered = /^\s*\d+\.\s+/.test(line);
    if (ordered || /^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = ordered
          ? lines[i].match(/^\s*\d+\.\s+(.*)$/)
          : lines[i].match(/^\s*[-*+]\s+(.*)$/);
        if (!item) break;
        items.push(`<li>${inlineToHtml(item[1])}</li>`);
        i += 1;
      }
      html += ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(inlineToHtml(lines[i].replace(/^>\s?/, "")));
        i += 1;
      }
      html += `<blockquote>${quote.join("<br>")}</blockquote>`;
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    html += `<p>${paragraph.map(inlineToHtml).join("<br>")}</p>`;
  }

  return html;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").replace(/\u00a0/g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(serializeNode).join("");

  switch (tag) {
    case "br":
      return "\n";
    case "strong":
    case "b":
      return `**${children.trim()}**`;
    case "em":
    case "i":
      return `*${children.trim()}*`;
    case "s":
    case "strike":
    case "del":
      return `~~${children.trim()}~~`;
    case "code": {
      const text = children.trim() || el.textContent || "";
      const tick = text.includes("`") ? "``" : "`";
      return `${tick}${text}${tick}`;
    }
    case "pre": {
      const text = (el.innerText || el.textContent || "").replace(/\n$/, "");
      return `\n\`\`\`\n${text}\n\`\`\`\n`;
    }
    case "a":
      return `[${children.trim()}](${el.getAttribute("href") ?? ""})`;
    case "img":
      return `![${el.getAttribute("alt") ?? ""}](${el.getAttribute("src") ?? ""})`;
    case "p":
      return `${children.trim()}\n\n`;
    case "h1":
      return `# ${children.trim()}\n\n`;
    case "h2":
      return `## ${children.trim()}\n\n`;
    case "h3":
      return `### ${children.trim()}\n\n`;
    case "blockquote": {
      const lines = children
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `> ${line}`);
      return `${lines.join("\n")}\n\n`;
    }
    case "ul":
    case "ol": {
      const items = Array.from(el.children)
        .filter((child) => child.tagName.toLowerCase() === "li")
        .map((item, index) => {
          const text = Array.from(item.childNodes).map(serializeNode).join("").trim();
          return `${tag === "ol" ? `${index + 1}. ` : "- "}${text}`;
        });
      return `${items.join("\n")}\n\n`;
    }
    case "li":
      return `- ${children.trim()}\n`;
    case "span": {
      const style = el.getAttribute("style") ?? "";
      if (/font-weight:\s*(?:bold|[6-9]00)/i.test(style)) return `**${children.trim()}**`;
      if (/font-weight:\s*(?:normal|400)/i.test(style)) return children.trim();
      return children;
    }
    case "div":
      return `${children}\n`;
    default:
      return children;
  }
}

function htmlToMarkdown(html: string) {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return Array.from(holder.childNodes)
    .map(serializeNode)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Apply a Markdown formatting action to a textarea selection. Used by Code mode
 * and by the assessment editors, which still write Markdown directly.
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
  { action: "bold", label: "Bold", title: "Bold", icon: Bold },
  { action: "italic", label: "Italic", title: "Italic", icon: Italic },
  {
    action: "strikethrough",
    label: "Strikethrough",
    title: "Strikethrough",
    icon: Strikethrough,
  },
  { action: "bullet", label: "Bulleted list", title: "Bulleted list", icon: List },
  {
    action: "number",
    label: "Numbered list",
    title: "Numbered list",
    icon: ListOrdered,
  },
  { action: "quote", label: "Quote", title: "Blockquote", icon: Quote },
  { action: "link", label: "Link", title: "Insert link", icon: Link2 },
  { action: "code", label: "Inline code", title: "Inline code", icon: Code2 },
  {
    action: "codeblock",
    label: "Code block",
    title: "Code block",
    icon: Code2,
  },
];

/**
 * Compact WordPress-style toolbar. Buttons keep the current selection by
 * preventing mousedown, so they work in both the visual editor and textareas.
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

  const keepSelection = (event: React.MouseEvent) => event.preventDefault();

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
          onMouseDown={keepSelection}
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
            onMouseDown={keepSelection}
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
          onMouseDown={keepSelection}
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
          onMouseDown={keepSelection}
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
          onMouseDown={(event) => event.preventDefault()}
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
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const skipEditorSync = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);
  const [value, setValue] = useState(defaultValue);
  const [mode, setMode] = useState<"visual" | "code">("visual");
  const [preview, setPreview] = useState(false);
  const [mathEnabled, setMathEnabled] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");

  useEffect(() => {
    if (mode !== "visual" || preview) return;
    const el = editorRef.current;
    if (!el) return;
    if (skipEditorSync.current) {
      skipEditorSync.current = false;
      return;
    }
    if (document.activeElement === el) return;
    const html = markdownToHtml(value);
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [value, mode, preview]);

  function focusSelection(selectionStart: number, selectionEnd: number) {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function syncFromEditor() {
    const el = editorRef.current;
    if (!el) return;
    const next = htmlToMarkdown(el.innerHTML);
    if (next === value) return;
    skipEditorSync.current = true;
    setValue(next);
  }

  function insertText(text: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    setValue(next);
    focusSelection(start + text.length, start + text.length);
  }

  function insertVisualText(text: string) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("insertText", false, text);
    syncFromEditor();
  }

  function insertMath(snippet: string) {
    if (mode === "visual" && !preview) {
      insertVisualText(snippet);
      return;
    }
    insertText(snippet);
  }

  function applyVisualFormat(action: FormatAction) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("styleWithCSS", false, "false");
    const selected = window.getSelection()?.toString() ?? "";

    switch (action) {
      case "bold":
        document.execCommand("bold");
        break;
      case "italic":
        document.execCommand("italic");
        break;
      case "strikethrough":
        document.execCommand("strikeThrough");
        break;
      case "bullet":
        document.execCommand("insertUnorderedList");
        break;
      case "number":
        document.execCommand("insertOrderedList");
        break;
      case "quote":
        document.execCommand("formatBlock", false, "blockquote");
        break;
      case "link": {
        const selection = window.getSelection();
        savedRangeRef.current =
          selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
        setLinkUrl("https://");
        setLinkOpen(true);
        return;
      }
      case "code":
        document.execCommand("insertHTML", false, `<code>${escapeHtml(selected || "code")}</code>`);
        break;
      case "codeblock":
        document.execCommand("formatBlock", false, "pre");
        break;
      case "paragraph":
        document.execCommand("formatBlock", false, "p");
        break;
      case "heading1":
        document.execCommand("formatBlock", false, "h1");
        break;
      case "heading2":
        document.execCommand("formatBlock", false, "h2");
        break;
      case "heading3":
        document.execCommand("formatBlock", false, "h3");
        break;
    }
    syncFromEditor();
  }

  function applyFormat(action: FormatAction) {
    if (mode === "visual" && !preview && editorRef.current) {
      applyVisualFormat(action);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const result = formatSelection(value, start, end, action);
    setValue(result.next);
    focusSelection(result.selectionStart, result.selectionEnd);
  }

  function applyLink() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    if (savedRangeRef.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedRangeRef.current);
    }
    if (linkUrl.trim()) document.execCommand("createLink", false, safeHref(linkUrl));
    savedRangeRef.current = null;
    setLinkOpen(false);
    syncFromEditor();
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

      if (mode === "visual" && !preview && editorRef.current) {
        editorRef.current.focus();
        document.execCommand(
          "insertHTML",
          false,
          `<img src="${escapeAttr(json.url)}" alt="${escapeAttr(alt)}" />`
        );
        syncFromEditor();
      } else {
        insertText(`\n![${alt}](${json.url})\n`);
      }
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
                mode === "visual"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
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
                mode === "code"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
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
            {linkOpen && (
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-2 py-1.5">
                <input
                  autoFocus
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyLink();
                    if (e.key === "Escape") setLinkOpen(false);
                  }}
                  placeholder="https://example.com"
                  aria-label="Link URL"
                  className="input h-7 min-w-48 flex-1 py-1 text-xs"
                />
                <button type="button" onClick={applyLink} className="btn-secondary btn-sm">
                  Apply link
                </button>
                <button
                  type="button"
                  onClick={() => setLinkOpen(false)}
                  className="btn-ghost btn-sm"
                >
                  Cancel
                </button>
              </div>
            )}
            {mathEnabled && <MathToolbar onInsert={insertMath} compact />}
            <textarea
              name={name}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
            {showPreview ? (
              <div className="min-h-48 bg-white p-4">
                {value.trim() ? (
                  <MathText content={value} />
                ) : (
                  <p className="text-sm text-slate-400">Nothing to preview yet.</p>
                )}
              </div>
            ) : (
              <div
                ref={editorRef}
                role="textbox"
                aria-multiline="true"
                aria-label={`${label} editor`}
                contentEditable
                suppressContentEditableWarning
                spellCheck
                data-placeholder={placeholder}
                onInput={syncFromEditor}
                className="rich rich-editor min-h-48 bg-white px-4 py-3 focus:outline-none"
              />
            )}
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
        Visual mode shows formatted text while editing · Code mode shows the Markdown source · Math
        is off until enabled
      </p>
    </div>
  );
}
