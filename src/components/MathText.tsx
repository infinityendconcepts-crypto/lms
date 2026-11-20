import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";
import type { PluggableList } from "unified";
import { SAFE_STYLE_RE } from "@/lib/editorHtml";
import { cn } from "@/lib/utils";

/**
 * The lesson editor stores a small amount of inline HTML for advanced
 * formatting. Sanitize that HTML before KaTeX runs, and keep the classes that
 * remark-math needs so math remains opt-in and correctly rendered.
 */
type AttributeList = NonNullable<Schema["attributes"]>[string];

const sanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), ["style", SAFE_STYLE_RE]] as AttributeList,
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ["className", "math", "math-display"],
    ] as AttributeList,
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["className", "math", "math-inline", "math-display"],
    ] as AttributeList,
    font: ["color", "face", "size"] as AttributeList,
  },
  tagNames: [...(defaultSchema.tagNames ?? []), "font", "u"],
};

const rehypePlugins: PluggableList = [
  rehypeRaw,
  [rehypeSanitize, sanitizeSchema],
  rehypeKatex,
];

/**
 * Math-aware markdown. Inline math uses $...$, display math uses $$...$$.
 * Raw HTML is limited to the sanitized subset emitted by the lesson editor.
 */
export function MathText({
  content,
  className,
  inline = false,
}: {
  content: string;
  className?: string;
  inline?: boolean;
}) {
  if (!content) return null;
  if (inline) {
    return (
      <span className={cn("rich inline [&>p]:inline", className)}>
        <ReactMarkdown
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={rehypePlugins}
          components={{ p: ({ children }) => <>{children}</> }}
        >
          {content}
        </ReactMarkdown>
      </span>
    );
  }
  return (
    <div className={cn("rich", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
