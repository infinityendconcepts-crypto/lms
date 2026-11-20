"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Eye,
  ImagePlus,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Outdent,
  Palette,
  Quote,
  Redo2,
  Sigma,
  Smile,
  Strikethrough,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { MathText } from "@/components/MathText";
import { cn } from "@/lib/utils";
import { normalizeStyleString, styleObjectToString } from "@/lib/editorHtml";

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

const SPECIAL_CHARACTERS = [
  "©",
  "®",
  "™",
  "€",
  "£",
  "¥",
  "°",
  "±",
  "×",
  "÷",
  "−",
  "—",
  "…",
  "“",
  "”",
  "‘",
  "’",
  "→",
  "←",
  "↔",
  "α",
  "β",
  "π",
  "Σ",
];

const FONT_FAMILIES = ["Arial", "Georgia", "Verdana", "monospace", "serif", "sans-serif"];
const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "32px"];

export type FormatAction =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bold"
  | "italic"
  | "strikethrough"
  | "underline"
  | "bullet"
  | "number"
  | "quote"
  | "link"
  | "code"
  | "codeblock"
  | "horizontalRule"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignJustify"
  | "indent"
  | "outdent";

export type StyleAction =
  | { type: "color"; value: string }
  | { type: "fontSize"; value: string }
  | { type: "fontFamily"; value: string };

type EditorAction = FormatAction | StyleAction;
type HistoryAction = "undo" | "redo";

type FormatResult = {
  next: string;
  selectionStart: number;
  selectionEnd: number;
};

const ALLOWED_EDITOR_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "font",
  "h1",
  "h2",
  "h3",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strike",
  "strong",
  "u",
  "ul",
]);

const DROPPED_EDITOR_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
]);

const RAW_TAG_PATTERN = /<\/?(?:span|div|p|u|font|hr)\b[^>]*>/gi;

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

function safeImageSrc(value: string) {
  const src = value.trim();
  return /^(https?:\/\/|\/)/i.test(src) ? src : "";
}

function parseStyleDeclarations(style: string | null | undefined) {
  const declarations: Record<string, string> = {};
  for (const part of normalizeStyleString(style).split(";").filter(Boolean)) {
    const separator = part.indexOf(":");
    if (separator < 1) continue;
    declarations[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return declarations;
}

function styleActionToDeclaration(action: StyleAction): Record<string, string> {
  if (action.type === "color") return { color: action.value };
  if (action.type === "fontSize") return { "font-size": action.value };
  return { "font-family": action.value };
}

function styledTag(tag: string, style: string, content: string) {
  const safeStyle = normalizeStyleString(style);
  return safeStyle
    ? `<${tag} style="${escapeAttr(safeStyle)}">${content}</${tag}>`
    : `<${tag}>${content}</${tag}>`;
}

/** Sanitize the small HTML subset produced by the advanced editor controls. */
function sanitizeEditorHtml(html: string) {
  if (typeof document === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = html;

  function clean(parent: Node) {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (DROPPED_EDITOR_TAGS.has(tag)) {
        child.remove();
        continue;
      }

      clean(el);

      if (!ALLOWED_EDITOR_TAGS.has(tag)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }

      for (const attribute of Array.from(el.attributes)) {
        const name = attribute.name.toLowerCase();
        if (name === "style") {
          const safe = normalizeStyleString(attribute.value);
          if (safe) el.setAttribute("style", safe);
          else el.removeAttribute("style");
        } else if (tag === "a" && name === "href") {
          el.setAttribute("href", safeHref(attribute.value));
        } else if (tag === "img" && name === "src") {
          const src = safeImageSrc(attribute.value);
          if (src) el.setAttribute("src", src);
          else el.removeAttribute("src");
        } else if (tag === "img" && name === "alt") {
          el.setAttribute("alt", attribute.value);
        } else if (tag === "font" && name === "color") {
          const safe = normalizeStyleString(`color: ${attribute.value}`);
          if (safe) el.setAttribute("color", safe.replace("color: ", ""));
          else el.removeAttribute("color");
        } else if (tag === "font" && name === "face") {
          const face = attribute.value.trim();
          if (FONT_FAMILIES.includes(face)) el.setAttribute("face", face);
          else el.removeAttribute("face");
        } else if (tag === "font" && name === "size") {
          if (/^[1-7]$/.test(attribute.value.trim())) {
            el.setAttribute("size", attribute.value.trim());
          } else {
            el.removeAttribute("size");
          }
        } else {
          el.removeAttribute(name);
        }
      }
    }
  }

  clean(template.content);
  return template.innerHTML;
}

function flattenSpans(root: ParentNode) {
  for (const span of Array.from(root.querySelectorAll("span"))) {
    while (span.firstChild) span.parentNode?.insertBefore(span.firstChild, span);
    span.remove();
  }
}

function setBlockIndentation(block: HTMLElement | null, direction: number) {
  if (!block) return;
  const current = Number.parseInt(block.style.marginLeft || "0", 10) || 0;
  const next = Math.max(0, Math.min(240, current + direction * 24));
  if (next === 0) block.style.removeProperty("margin-left");
  else block.style.marginLeft = `${next}px`;
}

function protectRawTags(text: string, tokens: string[]) {
  return text.replace(RAW_TAG_PATTERN, (tag) => {
    tokens.push(tag);
    return `\u0001${tokens.length - 1}\u0001`;
  });
}

function inlineToHtml(text: string) {
  const codeTokens: string[] = [];
  const rawTags: string[] = [];

  let prepared = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codeTokens.length - 1}\u0000`;
  });
  prepared = protectRawTags(prepared, rawTags);

  let html = escapeHtml(prepared)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      return `<a href="${escapeAttr(safeHref(href))}">${label}</a>`;
    });

  html = html
    .replace(/\u0001(\d+)\u0001/g, (_match, index: string) => rawTags[Number(index)] ?? "")
    .replace(/\u0000(\d+)\u0000/g, (_match, index: string) => codeTokens[Number(index)] ?? "");

  return html;
}

function isBlockStart(line: string) {
  return (
    /^\s*```/.test(line) ||
    /^#{1,6}\s/.test(line) ||
    /^\s*(?:[-*+]|\d+\.)\s/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line) ||
    /^\s*<(?:div|p|hr)\b/i.test(line)
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

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line) || /^\s*<hr\b/i.test(line)) {
      html += "<hr>";
      i += 1;
      continue;
    }

    if (/^\s*<(?:div|p)\b/i.test(line)) {
      const raw = [line];
      while (i + 1 < lines.length && !/<\/(?:div|p)>\s*$/i.test(raw[raw.length - 1])) {
        i += 1;
        raw.push(lines[i]);
      }
      html += inlineToHtml(raw.join("\n"));
      i += 1;
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

  return sanitizeEditorHtml(html);
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").replace(/\u00a0/g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(serializeNode).join("");
  const style = normalizeStyleString(el.getAttribute("style"));
  const inner = children.trim();

  switch (tag) {
    case "br":
      return "\n";
    case "strong":
    case "b":
      return `**${inner}**`;
    case "em":
    case "i":
      return `*${inner}*`;
    case "s":
    case "strike":
    case "del":
      return `~~${inner}~~`;
    case "u":
      return `<u>${inner}</u>`;
    case "code": {
      const text = el.textContent || "";
      const tick = text.includes("`") ? "``" : "`";
      return `${tick}${text}${tick}`;
    }
    case "pre": {
      const text = (el.innerText || el.textContent || "").replace(/\n$/, "");
      return `\n\`\`\`\n${text}\n\`\`\`\n`;
    }
    case "hr":
      return "\n\n---\n\n";
    case "a":
      return `[${inner}](${escapeAttr(el.getAttribute("href") ?? "")})`;
    case "img":
      return `![${escapeAttr(el.getAttribute("alt") ?? "")}](${escapeAttr(
        el.getAttribute("src") ?? ""
      )})`;
    case "p":
      return style
        ? `${styledTag("p", style, inner)}\n\n`
        : `${inner}\n\n`;
    case "h1":
      return style ? `${styledTag("h1", style, `# ${inner}`)}\n\n` : `# ${inner}\n\n`;
    case "h2":
      return style ? `${styledTag("h2", style, `## ${inner}`)}\n\n` : `## ${inner}\n\n`;
    case "h3":
      return style ? `${styledTag("h3", style, `### ${inner}`)}\n\n` : `### ${inner}\n\n`;
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
      return `- ${inner}\n`;
    case "span": {
      const rawStyle = el.getAttribute("style") ?? "";
      if (/font-weight:\s*(?:bold|[6-9]00)/i.test(rawStyle)) return `**${inner}**`;
      if (/font-weight:\s*(?:normal|400)/i.test(rawStyle)) return inner;
      return style ? `<span style="${escapeAttr(style)}">${inner}</span>` : inner;
    }
    case "font": {
      const declarations: Record<string, string> = {};
      const color = normalizeStyleString(`color: ${el.getAttribute("color") ?? ""}`);
      if (color) declarations.color = color.replace("color: ", "");
      const face = (el.getAttribute("face") ?? "").trim();
      if (FONT_FAMILIES.includes(face)) declarations["font-family"] = face;
      const css = styleObjectToString(declarations);
      return css ? `<span style="${escapeAttr(css)}">${inner}</span>` : inner;
    }
    case "div":
      return style ? `${styledTag("div", style, inner)}\n\n` : `${inner}\n\n`;
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
 * Apply a formatting action to a textarea selection. Used by Code mode and by
 * the assessment editors, which still write Markdown directly.
 */
export function formatSelection(
  value: string,
  start: number,
  end: number,
  action: EditorAction
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

  function wrapLines(before: string, after: string): FormatResult {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = value.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const block = value.slice(lineStart, lineEnd);
    return {
      next: value.slice(0, lineStart) + before + block + after + value.slice(lineEnd),
      selectionStart: lineStart + before.length,
      selectionEnd: lineStart + before.length + block.length,
    };
  }

  if (typeof action === "object") {
    const css = styleObjectToString(styleActionToDeclaration(action));
    return wrap(`<span style="${escapeAttr(css)}">`, "</span>", selected || "text");
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
    case "underline":
      return wrap("<u>", "</u>", "underlined text");
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
    case "horizontalRule":
      return {
        next: `${value.slice(0, start)}\n\n---\n\n${value.slice(end)}`,
        selectionStart: start + 6,
        selectionEnd: start + 6,
      };
    case "alignLeft":
      return wrapLines('<div style="text-align: left;">', "</div>");
    case "alignCenter":
      return wrapLines('<div style="text-align: center;">', "</div>");
    case "alignRight":
      return wrapLines('<div style="text-align: right;">', "</div>");
    case "alignJustify":
      return wrapLines('<div style="text-align: justify;">', "</div>");
    case "indent":
      return wrapLines('<div style="margin-left: 24px;">', "</div>");
    case "outdent":
      return wrapLines("", "");
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
    action: "underline",
    label: "Underline",
    title: "Underline",
    icon: Underline,
  },
  { action: "bullet", label: "Bulleted list", title: "Bulleted list", icon: List },
  {
    action: "number",
    label: "Numbered list",
    title: "Numbered list",
    icon: ListOrdered,
  },
  { action: "quote", label: "Quote", title: "Blockquote", icon: Quote },
  { action: "link", label: "Link", title: "Insert or edit link", icon: Link2 },
  { action: "code", label: "Inline code", title: "Toggle inline code", icon: Code2 },
  {
    action: "codeblock",
    label: "Code block",
    title: "Toggle code block",
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
  advancedOpen,
  onAdvancedToggle,
  compact = false,
}: {
  onFormat: (action: FormatAction) => void;
  onInsertImage?: () => void;
  onPreview?: () => void;
  mathEnabled?: boolean;
  onMathToggle?: () => void;
  advancedOpen?: boolean;
  onAdvancedToggle?: () => void;
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
      {onAdvancedToggle && (
        <button
          type="button"
          onMouseDown={keepSelection}
          onClick={onAdvancedToggle}
          aria-expanded={Boolean(advancedOpen)}
          title="More formatting"
          aria-label="More formatting"
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded border transition",
            advancedOpen
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-brand-700"
          )}
        >
          <Palette className="size-3.5" />
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

/** Formatting controls shown only when the editor is expanded. */
function AdvancedToolbar({
  onAction,
  onStyle,
  onSpecialCharacter,
  onHistory,
}: {
  onAction: (action: FormatAction) => void;
  onStyle: (action: StyleAction) => void;
  onSpecialCharacter: (character: string) => void;
  onHistory: (action: HistoryAction) => void;
}) {
  const [color, setColor] = useState("#2563eb");
  const keepSelection = (event: React.MouseEvent) => event.preventDefault();

  const iconButton =
    "inline-flex size-7 shrink-0 items-center justify-center rounded border border-transparent text-slate-600 transition hover:border-slate-200 hover:bg-white hover:text-brand-700";

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5">
      <label className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-600">
        <Palette className="size-3.5 text-slate-500" />
        Color
        <input
          type="color"
          value={color}
          aria-label="Text color"
          onChange={(e) => {
            setColor(e.target.value);
            onStyle({ type: "color", value: e.target.value });
          }}
          className="size-5 cursor-pointer border-0 bg-transparent p-0"
        />
      </label>

      <label className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-600">
        <Type className="size-3.5 text-slate-500" />
        Size
        <select
          aria-label="Font size"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onStyle({ type: "fontSize", value: e.target.value });
            e.target.value = "";
          }}
          className="h-5 border-0 bg-transparent pr-1 text-[11px] text-slate-700 focus:ring-0"
        >
          <option value="">—</option>
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <label className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-600">
        Font
        <select
          aria-label="Font family"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onStyle({ type: "fontFamily", value: e.target.value });
            e.target.value = "";
          }}
          className="h-5 max-w-24 border-0 bg-transparent pr-1 text-[11px] text-slate-700 focus:ring-0"
        >
          <option value="">—</option>
          {FONT_FAMILIES.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>

      <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />

      <button type="button" onMouseDown={keepSelection} onClick={() => onAction("strikethrough")} title="Strikethrough" aria-label="Strikethrough" className={iconButton}>
        <Strikethrough className="size-3.5" />
      </button>
      <button type="button" onMouseDown={keepSelection} onClick={() => onAction("alignLeft")} title="Align left" aria-label="Align left" className={iconButton}>
        <AlignLeft className="size-3.5" />
      </button>
      <button type="button" onMouseDown={keepSelection} onClick={() => onAction("alignCenter")} title="Align center" aria-label="Align center" className={iconButton}>
        <AlignCenter className="size-3.5" />
      </button>
      <button type="button" onMouseDown={keepSelection} onClick={() => onAction("alignRight")} title="Align right" aria-label="Align right" className={iconButton}>
        <AlignRight className="size-3.5" />
      </button>
      <button type="button" onMouseDown={keepSelection} onClick={() => onAction("alignJustify")} title="Justify" aria-label="Justify" className={iconButton}>
        <AlignJustify className="size-3.5" />
      </button>
      <button type="button" onMouseDown={keepSelection} onClick={() => onAction("outdent")} title="Decrease indent" aria-label="Decrease indent" className={iconButton}>
        <Outdent className="size-3.5" />
      </button>
      <button type="button" onMouseDown={keepSelection} onClick={() => onAction("indent")} title="Increase indent" aria-label="Increase indent" className={iconButton}>
        <Indent className="size-3.5" />
      </button>
      <button type="button" onMouseDown={keepSelection} onClick={() => onAction("horizontalRule")} title="Horizontal line" aria-label="Horizontal line" className={iconButton}>
        <Minus className="size-3.5" />
      </button>

      <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />

      <label className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-600">
        <Smile className="size-3.5 text-slate-500" />
        Symbol
        <select
          aria-label="Special character"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onSpecialCharacter(e.target.value);
            e.target.value = "";
          }}
          className="h-5 max-w-20 border-0 bg-transparent pr-1 text-[11px] text-slate-700 focus:ring-0"
        >
          <option value="">—</option>
          {SPECIAL_CHARACTERS.map((character) => (
            <option key={character} value={character}>
              {character}
            </option>
          ))}
        </select>
      </label>

      <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />

      <button type="button" onMouseDown={keepSelection} onClick={() => onHistory("undo")} title="Undo" aria-label="Undo" className={iconButton}>
        <Undo2 className="size-3.5" />
      </button>
      <button type="button" onMouseDown={keepSelection} onClick={() => onHistory("redo")} title="Redo" aria-label="Redo" className={iconButton}>
        <Redo2 className="size-3.5" />
      </button>
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
  const lastRenderedValueRef = useRef(defaultValue);
  const savedRangeRef = useRef<Range | null>(null);
  const toolbarInteractionRef = useRef(false);
  const linkAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const [value, setValue] = useState(defaultValue);
  const [mode, setMode] = useState<"visual" | "code">("visual");
  const [preview, setPreview] = useState(false);
  const [mathEnabled, setMathEnabled] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkEditing, setLinkEditing] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");

  useEffect(() => {
    if (mode !== "visual" || preview) return;
    const el = editorRef.current;
    if (!el) return;
    if (skipEditorSync.current) {
      skipEditorSync.current = false;
      lastRenderedValueRef.current = value;
      return;
    }
    if (lastRenderedValueRef.current === value && el.innerHTML.trim()) return;
    lastRenderedValueRef.current = value;
    const html = markdownToHtml(value);
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [value, mode, preview]);

  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (linkOpen) {
        setLinkOpen(false);
        return;
      }
      setFullscreen(false);
      setAdvancedOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreen, linkOpen]);

  function isSelectionInsideEditor() {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection || !editor || selection.rangeCount === 0) return false;
    const node = selection.anchorNode;
    return Boolean(node && (node === editor || editor.contains(node)));
  }

  function saveEditorSelection() {
    if (linkOpen || toolbarInteractionRef.current) return;
    const selection = window.getSelection();
    if (isSelectionInsideEditor() && selection?.rangeCount) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
  }

  function restoreEditorSelection() {
    const selection = window.getSelection();
    const range = savedRangeRef.current;
    const editor = editorRef.current;
    if (!selection || !range || !editor || !editor.contains(range.startContainer)) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function prepareVisualEdit() {
    const el = editorRef.current;
    if (!el) return false;
    el.focus();
    restoreEditorSelection();
    return isSelectionInsideEditor();
  }

  function closestWithin(node: Node | null, selector: string) {
    const editor = editorRef.current;
    if (!editor) return null;
    const element =
      node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
    const match = element?.closest(selector) as HTMLElement | null;
    return match && editor.contains(match) ? match : null;
  }

  function unwrapElement(el: Element) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
  }

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
    lastRenderedValueRef.current = next;
    setValue(next);
    saveEditorSelection();
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
    if (!prepareVisualEdit()) return;
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

  function removeInlineCode() {
    const selection = window.getSelection();
    const code = closestWithin(selection?.anchorNode ?? null, "code");
    if (!code || code.closest("pre")) return false;
    const textNode = code.firstChild;
    unwrapElement(code);
    if (textNode?.nodeType === Node.TEXT_NODE && selection) {
      const range = document.createRange();
      range.selectNodeContents(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return true;
  }

  function removeCodeBlock() {
    const selection = window.getSelection();
    const pre = closestWithin(selection?.anchorNode ?? null, "pre");
    if (!pre) return false;
    const paragraph = document.createElement("p");
    const lines = (pre.innerText || pre.textContent || "").split("\n");
    lines.forEach((line, index) => {
      if (index > 0) paragraph.appendChild(document.createElement("br"));
      paragraph.appendChild(document.createTextNode(line));
    });
    pre.replaceWith(paragraph);
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return true;
  }

  function adjustIndentation(direction: number) {
    const selection = window.getSelection();
    const block = closestWithin(
      selection?.anchorNode ?? null,
      "p,div,h1,h2,h3,li,blockquote"
    ) ?? editorRef.current;
    setBlockIndentation(block, direction);
  }

  function openLinkEditor() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    const anchor = closestWithin(selection.anchorNode, "a") as HTMLAnchorElement | null;
    linkAnchorRef.current = anchor;
    setLinkEditing(Boolean(anchor));
    setLinkUrl(anchor?.getAttribute("href") ?? "https://");
    setLinkOpen(true);
  }

  function applyVisualFormat(action: FormatAction) {
    if (!prepareVisualEdit()) return;
    const isAlignment = action.startsWith("align");
    document.execCommand("styleWithCSS", false, isAlignment ? "true" : "false");
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
      case "underline":
        document.execCommand("underline");
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
      case "link":
        openLinkEditor();
        return;
      case "code":
        if (!removeInlineCode()) {
          document.execCommand(
            "insertHTML",
            false,
            `<code>${escapeHtml(selected || "code")}</code>`
          );
        }
        break;
      case "codeblock":
        if (!removeCodeBlock()) document.execCommand("formatBlock", false, "pre");
        break;
      case "horizontalRule":
        document.execCommand("insertHTML", false, "<hr><p><br></p>");
        break;
      case "alignLeft":
        document.execCommand("justifyLeft");
        break;
      case "alignCenter":
        document.execCommand("justifyCenter");
        break;
      case "alignRight":
        document.execCommand("justifyRight");
        break;
      case "alignJustify":
        document.execCommand("justifyFull");
        break;
      case "indent":
        adjustIndentation(1);
        break;
      case "outdent":
        adjustIndentation(-1);
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

  function applyVisualStyle(action: StyleAction) {
    if (!prepareVisualEdit()) return;
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0).cloneRange();

    const spans: HTMLSpanElement[] = [];
    let node: Node | null = selection.anchorNode;
    while (node && node !== editor) {
      const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      if (!element || !editor.contains(element)) break;
      if (element.tagName.toLowerCase() === "span") spans.push(element as HTMLSpanElement);
      node = element.parentElement;
    }

    const declarations: Record<string, string> = {};
    for (const span of spans.reverse()) {
      Object.assign(declarations, parseStyleDeclarations(span.getAttribute("style")));
    }

    const property =
      action.type === "color"
        ? "color"
        : action.type === "fontSize"
          ? "font-size"
          : "font-family";
    const isSame = declarations[property]?.toLowerCase() === action.value.toLowerCase();
    if (isSame) delete declarations[property];
    else declarations[property] = action.value;

    const css = styleObjectToString(declarations);
    const outerSpan = spans[0] ?? null;

    if (outerSpan) {
      const targetRange = document.createRange();
      targetRange.selectNodeContents(outerSpan);
      const contents = targetRange.extractContents();
      flattenSpans(contents);

      if (!css) {
        outerSpan.replaceWith(contents);
      } else {
        const nextSpan = document.createElement("span");
        nextSpan.setAttribute("style", css);
        nextSpan.appendChild(contents);
        outerSpan.replaceWith(nextSpan);
        const nextRange = document.createRange();
        nextRange.selectNodeContents(nextSpan);
        selection.removeAllRanges();
        selection.addRange(nextRange);
      }
    } else if (!range.collapsed && css) {
      const nextSpan = document.createElement("span");
      nextSpan.setAttribute("style", css);
      nextSpan.appendChild(range.extractContents());
      range.insertNode(nextSpan);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(nextSpan);
      selection.removeAllRanges();
      selection.addRange(nextRange);
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

  function applyStyle(action: StyleAction) {
    if (mode === "visual" && !preview && editorRef.current) {
      applyVisualStyle(action);
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

  function applyHistory(action: HistoryAction) {
    if (mode === "visual" && !preview && editorRef.current) {
      if (!prepareVisualEdit()) return;
      document.execCommand(action);
      syncFromEditor();
      return;
    }
    const el = ref.current;
    if (!el) return;
    el.focus();
    document.execCommand(action);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function insertSpecialCharacter(character: string) {
    if (mode === "visual" && !preview) insertVisualText(character);
    else insertText(character);
  }

  function applyLink() {
    if (!prepareVisualEdit()) return;
    const href = safeHref(linkUrl);
    if (linkEditing && linkAnchorRef.current && editorRef.current?.contains(linkAnchorRef.current)) {
      if (linkUrl.trim()) linkAnchorRef.current.setAttribute("href", href);
      else unwrapElement(linkAnchorRef.current);
    } else if (linkUrl.trim()) {
      document.execCommand("createLink", false, href);
    }
    savedRangeRef.current = null;
    linkAnchorRef.current = null;
    setLinkOpen(false);
    setLinkEditing(false);
    syncFromEditor();
  }

  function removeLink() {
    if (!prepareVisualEdit()) return;
    if (linkAnchorRef.current && editorRef.current?.contains(linkAnchorRef.current)) {
      unwrapElement(linkAnchorRef.current);
    } else {
      document.execCommand("unlink");
    }
    savedRangeRef.current = null;
    linkAnchorRef.current = null;
    setLinkOpen(false);
    setLinkEditing(false);
    syncFromEditor();
  }

  function toggleFullscreen() {
    const next = !fullscreen;
    setFullscreen(next);
    setAdvancedOpen(next);
    setPreview(false);
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

      if (mode === "visual" && !preview && prepareVisualEdit()) {
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

      <div
        className={cn(
          "flex flex-col overflow-hidden bg-white",
          fullscreen
            ? "fixed inset-0 z-50 rounded-none border-0 shadow-2xl"
            : "rounded-xl border border-slate-200"
        )}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 py-1.5"
          onMouseDown={saveEditorSelection}
        >
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
          <div className="flex items-center gap-1">
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
            <button
              type="button"
              onClick={toggleFullscreen}
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              className="inline-flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          </div>
        </div>

        {mode === "visual" ? (
          <>
            <div
              onMouseDown={() => {
                saveEditorSelection();
                toolbarInteractionRef.current = true;
              }}
              onMouseUp={() => {
                toolbarInteractionRef.current = false;
              }}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  toolbarInteractionRef.current = false;
                }
              }}
            >
              <EditorToolbar
                onFormat={applyFormat}
                onInsertImage={() => fileRef.current?.click()}
                onPreview={() => setPreview((p) => !p)}
                mathEnabled={mathEnabled}
                onMathToggle={() => setMathEnabled((enabled) => !enabled)}
                advancedOpen={advancedOpen}
                onAdvancedToggle={() => {
                  setPreview(false);
                  setAdvancedOpen((open) => !open);
                }}
              />
              {advancedOpen && (
                <AdvancedToolbar
                  onAction={applyFormat}
                  onStyle={applyStyle}
                  onSpecialCharacter={insertSpecialCharacter}
                  onHistory={applyHistory}
                />
              )}
            </div>
            {linkOpen && (
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-2 py-1.5">
                <span className="text-[11px] font-semibold text-slate-500">
                  {linkEditing ? "Edit link" : "Add link"}
                </span>
                <input
                  autoFocus
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyLink();
                    if (e.key === "Escape") {
                      setLinkOpen(false);
                      linkAnchorRef.current = null;
                    }
                  }}
                  placeholder="https://example.com"
                  aria-label="Link URL"
                  className="input h-7 min-w-48 flex-1 py-1 text-xs"
                />
                <button type="button" onClick={applyLink} className="btn-secondary btn-sm">
                  {linkEditing ? "Update link" : "Add link"}
                </button>
                {linkEditing && (
                  <button type="button" onClick={removeLink} className="btn-secondary btn-sm text-rose-600">
                    Remove link
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setLinkOpen(false);
                    linkAnchorRef.current = null;
                  }}
                  className="btn-ghost btn-sm"
                >
                  Cancel
                </button>
              </div>
            )}
            {mathEnabled && <MathToolbar onInsert={insertMath} compact />}
            <textarea
              id={name}
              name={name}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
            {showPreview ? (
              <div className={cn("min-h-48 bg-white p-4", fullscreen ? "flex-1 overflow-y-auto" : "max-h-[420px] overflow-y-auto")}>
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
                onKeyUp={saveEditorSelection}
                onMouseUp={saveEditorSelection}
                onBlur={saveEditorSelection}
                className={cn(
                  "rich rich-editor bg-white px-4 py-3 focus:outline-none",
                  fullscreen
                    ? "min-h-0 flex-1 overflow-y-auto"
                    : "max-h-[420px] min-h-48 overflow-y-auto"
                )}
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
            className={cn(
              "w-full border-0 bg-white px-4 py-3 font-mono text-xs leading-relaxed text-slate-800 placeholder:text-slate-400 focus:ring-0 focus:outline-none",
              fullscreen ? "min-h-0 flex-1 resize-none overflow-auto" : "resize-y"
            )}
          />
        )}
      </div>

      {uploadError && <p className="mt-1.5 text-xs font-medium text-rose-600">{uploadError}</p>}
      <p className="mt-1.5 text-[11px] text-slate-400">
        Visual mode shows formatted text while editing · Code mode shows the Markdown source · Use
        More formatting or Fullscreen for advanced controls · Math is off until enabled
      </p>
    </div>
  );
}
