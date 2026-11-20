"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Clipboard,
  CornerDownLeft,
  Send,
  Sparkles,
} from "lucide-react";
import { OverlayModal } from "@/components/OverlayModal";
import { setFormFieldValue } from "@/components/RichTextEditor";
import { generateContentDraftAction } from "@/lib/actions/ai-content";

type Attachment = { id: string; name: string; kind: string };
type ProviderOption = { value: string; label: string; detail?: string };

type Reply = {
  content: string;
  source: string;
  hasContent: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  reply?: Reply;
};

const QUICK_PROMPTS = [
  "Write a short introduction",
  "Add a worked example",
  "Summarise this section",
  "Suggest practice questions",
];

export function TextBlockAssistant({
  fieldName,
  lessonId,
  courseId,
  attachments = [],
  providerOptions = [],
}: {
  fieldName: string;
  lessonId: string;
  courseId: string;
  attachments?: Attachment[];
  providerOptions?: ProviderOption[];
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "assistant-intro",
      role: "assistant",
      text: "Tell me what this section needs. I can draft an introduction, an example, a summary, or practice questions from the lesson notes.",
    },
  ]);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState("");
  const [provider, setProvider] = useState("auto");
  const [error, setError] = useState("");
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  const readable = useMemo(
    () =>
      attachments.filter(
        (file) => file.kind === "document" || /\.(txt|md|csv|json|html?|svg|xml)$/i.test(file.name)
      ),
    [attachments]
  );

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open, pending]);

  function sendMessage(raw: string) {
    const text = raw.trim();
    if (!text || pending) return;

    const instruction = messages
      .filter((message) => message.role === "user")
      .slice(-3)
      .map((message) => message.text)
      .concat(text)
      .join("\n");

    setError("");
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text },
    ]);
    setInput("");

    startTransition(async () => {
      try {
        const result = await generateContentDraftAction({
          ...(attachment ? { attachmentId: attachment } : {}),
          lessonId,
          courseId,
          mode: "lesson",
          providerChoice: provider,
          instruction,
        });
        const content = result.draft.content.trim();
        const fallback =
          result.draft.keyPoints.map((point) => `- ${point}`).join("\n") ||
          result.draft.summary ||
          "I could not draft anything from the available lesson notes.";
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: content || fallback,
            reply: {
              content,
              source: result.source === "local" ? "Local model" : result.provider,
              hasContent: Boolean(content),
            },
          },
        ]);
        if (result.error) setError(result.error);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The assistant could not reply.");
      }
    });
  }

  function apply(message: ChatMessage, append: boolean) {
    if (!message.reply?.hasContent) return;
    const field = document.querySelector(`[name="${CSS.escape(fieldName)}"]`) as
      | HTMLTextAreaElement
      | HTMLInputElement
      | null;
    const existing = append ? field?.value ?? "" : "";
    setFormFieldValue(fieldName, [existing, message.reply.content].filter(Boolean).join("\n\n"));
    setAppliedId(message.id);
    setOpen(false);
  }

  async function copy(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.text);
      setAppliedId(message.id);
    } catch {
      setError("Clipboard is unavailable in this browser.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost btn-sm text-brand-600"
        title="Ask AI about this text block"
        aria-label="Open AI assistant for this text block"
      >
        <Sparkles className="size-3.5" /> Ask AI
      </button>

      <OverlayModal
        open={open}
        onClose={() => setOpen(false)}
        title="AI assistant"
        subtitle="Local-first · drafts only from your lesson notes"
        size="md"
        footer={
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(input);
                }
              }}
              rows={2}
              placeholder="Ask for a rewrite, example or summary…"
              className="input min-h-0 flex-1 resize-none text-xs"
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={pending || !input.trim()}
              className="btn-primary btn-sm h-10"
            >
              <Send className="size-3.5" /> Send
            </button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Source
          </label>
          <select
            value={attachment}
            onChange={(event) => setAttachment(event.target.value)}
            className="select min-w-0 flex-1 py-1 text-[11px]"
          >
            <option value="">Lesson notes</option>
            {readable.map((file) => (
              <option key={file.id} value={file.id}>
                {file.name}
              </option>
            ))}
          </select>
          <label className="ml-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Model
          </label>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="select w-32 py-1 text-[11px]"
          >
            <option value="auto">Auto</option>
            {providerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-5 shadow-sm ${
                  message.role === "user"
                    ? "rounded-br-sm bg-brand-600 text-white"
                    : "rounded-bl-sm border border-slate-200 bg-white text-slate-700"
                }`}
              >
                {message.reply && (
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[9px] font-semibold uppercase tracking-wider text-brand-600">
                    <Sparkles className="size-3" /> {message.reply.source}
                  </div>
                )}
                {message.reply?.hasContent ? (
                  <pre className="whitespace-pre-wrap font-sans">{message.text}</pre>
                ) : (
                  <p className="whitespace-pre-wrap">{message.text}</p>
                )}
                {message.reply?.hasContent && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                    <button
                      type="button"
                      onClick={() => apply(message, false)}
                      className="btn-secondary btn-sm"
                    >
                      {appliedId === message.id ? (
                        <Check className="size-3" />
                      ) : (
                        <CornerDownLeft className="size-3" />
                      )}
                      Apply to block
                    </button>
                    <button type="button" onClick={() => apply(message, true)} className="btn-ghost btn-sm">
                      Append
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(message)}
                      className="btn-ghost btn-sm"
                      aria-label="Copy reply"
                    >
                      <Clipboard className="size-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {pending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-500">
                Drafting a reply…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => sendMessage(prompt)}
              disabled={pending}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </OverlayModal>
    </>
  );
}
