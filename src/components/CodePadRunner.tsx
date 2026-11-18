"use client";

import { useMemo, useState } from "react";
import { Code2, Eye, Play, Save, Send, Terminal } from "lucide-react";
import { saveCodePadAction } from "@/lib/actions/codepad";
import { SubmitButton } from "@/components/SubmitButton";
import { cn } from "@/lib/utils";

export type CodePadStatus = "DRAFT" | "SUBMITTED" | "REVIEWED";

function buildPreview(language: string, code: string) {
  const base = (head: string, body: string, script = "") =>
    `<!doctype html><html><head><meta charset="utf-8"/><style>
      body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;margin:16px;color:#0f172a;background:#fff}
      .axiom-console{margin-top:16px;border:1px solid #e2e8f0;border-radius:10px;background:#0f172a;color:#e2e8f0;padding:10px;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;min-height:56px}
      .axiom-preview{border:1px dashed #cbd5e1;border-radius:10px;padding:16px}
      h1{font-size:20px;margin:0 0 8px}p{color:#475569}button{padding:8px 14px;border-radius:8px;border:0;background:#4f46e5;color:#fff;font-weight:600}
    </style>${head}</head><body>${body}${script}</body></html>`;

  if (language === "html") {
    if (/<html[\s>]/i.test(code)) return code;
    return base("", code);
  }

  if (language === "css") {
    return base(
      `<style>${code}</style>`,
      `<div class="axiom-preview"><h1>Preview</h1><p>Your CSS is applied to this sample content.</p><button>Sample button</button></div>`
    );
  }

  if (language === "javascript" || language === "typescript") {
    // TypeScript runs as plain JavaScript in the preview; annotations will
    // surface as syntax errors, which is a useful teaching signal.
    const runner = `<pre id="__axiom_out" class="axiom-console"></pre>
<script>
  const __out = document.getElementById('__axiom_out');
  const __log = (...args) => {
    __out.textContent += args.map((v) => {
      try { return typeof v === 'object' ? JSON.stringify(v) : String(v); }
      catch { return String(v); }
    }).join(' ') + '\\n';
  };
  console.log = __log; console.info = __log; console.warn = __log; console.error = __log;
  window.onerror = (message) => { __log('Error: ' + message); };
  try {
    ${code}
  } catch (error) {
    __log('Error: ' + (error && error.message ? error.message : error));
  }
</script>`;
    return base("", `<div class="axiom-preview"><h1>JavaScript preview</h1><p>Output appears below. You can also edit the page with <code>document</code>.</p></div>${runner}`);
  }

  return base(
    "",
    `<div class="axiom-preview"><h1>Saved for review</h1><p>${language} runs outside the browser preview. Your teacher will review this submission.</p></div>`
  );
}

export function CodePadRunner({
  padId,
  language,
  starterCode,
  initialCode,
  status,
  score,
  feedback,
  disabled = false,
}: {
  padId: string;
  language: string;
  starterCode: string;
  initialCode: string;
  status: CodePadStatus;
  score: number | null;
  feedback: string | null;
  disabled?: boolean;
}) {
  const [code, setCode] = useState(initialCode || starterCode);
  const [tab, setTab] = useState<"code" | "preview">("code");
  const [previewKey, setPreviewKey] = useState(0);
  const [previewCode, setPreviewCode] = useState(initialCode || starterCode);

  const srcDoc = useMemo(() => buildPreview(language, previewCode), [language, previewCode]);
  const reviewed = status === "REVIEWED";

  function run() {
    setPreviewCode(code);
    setPreviewKey((key) => key + 1);
    setTab("preview");
  }

  return (
    <div className="space-y-3">
      {(score !== null || feedback) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          <p className="font-bold">
            Teacher review{score !== null ? ` · ${Math.round(score)}/100` : ""}
          </p>
          {feedback && <p className="mt-1 whitespace-pre-wrap leading-5">{feedback}</p>}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab("code")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold",
                tab === "code" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Code2 className="size-3.5" /> Code
            </button>
            <button
              type="button"
              onClick={() => setTab("preview")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold",
                tab === "preview" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Eye className="size-3.5" /> Preview
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
              {language}
            </span>
            <button type="button" onClick={run} className="btn-secondary btn-sm">
              <Play className="size-3.5" /> Run
            </button>
          </div>
        </div>

        {tab === "code" ? (
          <textarea
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
            rows={18}
            className="block w-full resize-y border-0 bg-slate-950 p-4 font-mono text-[12px] leading-6 text-slate-100 outline-none"
            placeholder="Write your code here…"
          />
        ) : (
          <iframe
            key={previewKey}
            title="Code preview"
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            className="h-[360px] w-full bg-white"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={saveCodePadAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="padId" value={padId} />
          <input type="hidden" name="code" value={code} />
          <SubmitButton name="intent" value="save" variant="secondary" pendingText="Saving…" disabled={disabled}>
            <Save className="size-3.5" /> Save draft
          </SubmitButton>
          <SubmitButton
            name="intent"
            value="submit"
            pendingText="Submitting…"
            disabled={disabled || reviewed}
            confirm={reviewed ? "This work has already been reviewed." : "Submit this code for teacher review?"}
          >
            <Send className="size-3.5" /> {reviewed ? "Reviewed" : status === "SUBMITTED" ? "Resubmit" : "Submit for review"}
          </SubmitButton>
        </form>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <Terminal className="size-3" /> Preview runs sandboxed in your browser. Other languages are saved for teacher review.
        </span>
      </div>
    </div>
  );
}
