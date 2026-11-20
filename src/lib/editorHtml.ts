/**
 * Shared, deliberately narrow invariants for the lesson editor's rich text.
 *
 * The editor stores Markdown, but a few advanced controls (colour, font size,
 * font family, alignment and indentation) need inline HTML. Only the exact
 * declaration shapes produced by the editor are allowed back through rendering
 * and serialization, which keeps pasted or hand-written content safe.
 */

const COLOR_VALUE_SOURCE =
  "(?:#[0-9a-fA-F]{6}|rgb\\(\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*\\))";

const DECLARATION_SOURCES: Record<string, string> = {
  color: COLOR_VALUE_SOURCE,
  "font-size": "\\d{1,2}(?:\\.\\d)?(?:px|rem|em)",
  "font-family": "(?:Arial|Georgia|Verdana|monospace|serif|sans-serif)",
  "text-align": "(?:left|center|right|justify)",
  "margin-left": "\\d{1,3}px",
  "padding-left": "\\d{1,3}px",
};

const DECLARATION_PATTERNS: Record<string, RegExp> = Object.fromEntries(
  Object.entries(DECLARATION_SOURCES).map(([property, source]) => [
    property,
    new RegExp(`^${source}$`, "i"),
  ])
);

const STYLE_ORDER = [
  "color",
  "font-size",
  "font-family",
  "text-align",
  "margin-left",
  "padding-left",
];

/** Matches the complete, canonical style strings this editor may emit. */
export const SAFE_STYLE_RE = new RegExp(
  `^(?:\\s*(?:${STYLE_ORDER.map(
    (property) => `${property}:\\s*${DECLARATION_SOURCES[property]}`
  ).join("|")})\\s*;?)+\\s*$`,
  "i"
);

export function normalizeStyleString(style: string | null | undefined): string {
  if (!style || !SAFE_STYLE_RE.test(style)) return "";

  const declarations = new Map<string, string>();
  for (const part of style.split(";")) {
    const separator = part.indexOf(":");
    if (separator < 1) continue;
    const property = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    const pattern = DECLARATION_PATTERNS[property];
    if (pattern?.test(value)) declarations.set(property, value);
  }

  return STYLE_ORDER.filter((property) => declarations.has(property))
    .map((property) => `${property}: ${declarations.get(property)}`)
    .join("; ");
}

export function styleObjectToString(declarations: Record<string, string>): string {
  const filtered: Record<string, string> = {};
  for (const [property, value] of Object.entries(declarations)) {
    const key = property.toLowerCase();
    if (DECLARATION_PATTERNS[key]?.test(value)) filtered[key] = value;
  }
  return STYLE_ORDER.filter((property) => filtered[property])
    .map((property) => `${property}: ${filtered[property]}`)
    .join("; ");
}

export function safeStyleAttribute(style: string | null | undefined): string {
  return normalizeStyleString(style);
}
