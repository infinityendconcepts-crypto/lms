"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Clipboard,
  FileText,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { generateContentDraftAction } from "@/lib/actions/ai-content";
import { setFormFieldValue } from "@/components/RichTextEditor";

type Draft = Awaited<ReturnType<typeof generateContentDraftAction>>;

type Attachment = { id: string; name: string; kind: string };
type Option = { value: string; label: string; detail?: string };

const MODES = [
  { value: "all", label: "Everything" },
  { value: "lesson", label: "Lesson text" },
  { value: "summary", label: "Summary" },
  { value: "questions", label: "Quiz questions" },
] as const;

export function AiContentAssist({
  lessonId,
  courseId,
  attachments,
  providerOptions,
  summaryField = "summary",
  contentField = "content",
}: {
  lessonId?: string;
  courseId?: string;
  attachments: Attachment[];
  providerOptions: Option[];
  summaryField?: string;
  contentField?: string;
}) {
  const readable = useMemo(
    () =>
      attachments.filter(
        (file) => file.kind === "document" || /\.(txt|md|csv|json|html?|svg|xml)$/i.test(file.name)
      ),
    [attachments]
  );

  const [attachment, setAttachment] = useState(readable[0]?.id ?? "");
  const [provider, setProvider] = useState("auto");
  const [mode, setMode] = useState<(typeof MODES)[number]["value"]>("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError("");
    setDraft(null);
    startTransition(async () => {
      try {
        const result = await generateContentDraftAction({
          ...(attachment ? { attachmentId: attachment } : {}),
          ...(lessonId ? { lessonId } : {}),
          ...(courseId ? { courseId } : {}),
          mode,
          providerChoice: provider,
        });
        setDraft(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not generate a draft.");
      }
    });
  }

  function apply(field: string, value: string) {
    setFormFieldValue(field, value);
  }

  async function copyQuestions() {
    if (!draft?.draft.questions.length) return;
    const text = draft.draft.questions
      .map((q, i) => `${i + 1}. [${q.type.replaceAll("_", " ")} · ${q.points} pt] ${q.prompt}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard is unavailable in this browser.");
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-brand-50/50 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Sparkles className="size-4 text-brand-600" /> AI content assist
        </h2>
        <span className="text-[10px] text-slate-400">Local-first · no key required</span>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ai-source">Source file</label>
            <select
              id="ai-source"
              value={attachment}
              onChange={(e) => setAttachment(e.target.value)}
              className="select"
            >
              <option value="">Lesson title &amp; summary</option>
              {readable.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.name}
                </option>
              ))}
            </select>
            {readable.length === 0 && (
              <p className="mt-1 text-[10px] text-slate-400">
                Attach a TXT, MD, CSV, JSON or HTML file to draft from your own content.
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="ai-provider">Model</label>
            <select
              id="ai-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="select"
            >
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="label mb-1.5">What should it draft?</p>
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setMode(item.value)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                  mode === item.value
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="btn-primary w-full"
        >
          <WandSparkles className="size-4" />
          {pending ? "Drafting…" : "Generate draft"}
        </button>

        {(error || draft?.error) && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {error || draft?.error} A local draft is shown below instead.
            </span>
          </div>
        )}

        {draft && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Draft · {draft.source === "local" ? "Local model" : draft.provider}
                {draft.usedAttachment ? ` · ${draft.attachmentName}` : ""}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {draft.draft.summary && (
                  <button
                    type="button"
                    onClick={() => apply(summaryField, draft.draft.summary)}
                    className="btn-secondary btn-sm"
                  >
                    <Check className="size-3" /> Apply summary
                  </button>
                )}
                {draft.draft.content && (
                  <button
                    type="button"
                    onClick={() => apply(contentField, draft.draft.content)}
                    className="btn-secondary btn-sm"
                  >
                    <FileText className="size-3" /> Apply lesson text
                  </button>
                )}
              </div>
            </div>

            {draft.draft.summary && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Summary</p>
                <p className="mt-1 text-xs leading-5 text-slate-700">{draft.draft.summary}</p>
              </div>
            )}

            {draft.draft.keyPoints.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Key points</p>
                <ul className="mt-1 space-y-1 text-xs text-slate-700">
                  {draft.draft.keyPoints.map((point, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-brand-500">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {draft.draft.content && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lesson text</p>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-sans text-[11px] leading-5 text-slate-600">
                  {draft.draft.content}
                </pre>
              </div>
            )}

            {draft.draft.questions.length > 0 && (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Suggested questions
                  </p>
                  <button
                    type="button"
                    onClick={copyQuestions}
                    className="btn-ghost btn-sm"
                  >
                    {copied ? <Check className="size-3" /> : <Clipboard className="size-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <ol className="mt-1 space-y-1.5 text-xs text-slate-700">
                  {draft.draft.questions.map((question, i) => (
                    <li key={i} className="rounded-lg bg-white px-3 py-2">
                      <span className="mr-1 font-bold text-slate-400">{i + 1}.</span>
                      {question.prompt}
                      <span className="ml-1.5 text-[10px] text-slate-400">
                        {question.type.replaceAll("_", " ")} · {question.points} pt
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-1.5 text-[10px] text-slate-400">
                  Copy these into the question bank or an assessment.
                </p>
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] leading-4 text-slate-400">
          The local model drafts from headings and sentences on your machine. Choosing a hosted
          provider sends only the extracted file text — never the whole workspace.
        </p>
      </div>
    </section>
  );
}
