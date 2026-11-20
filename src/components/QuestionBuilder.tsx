"use client";

import { useRef, useState } from "react";
import { Eye, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { saveQuestionAction } from "@/lib/actions/assessment";
import {
  emptyData,
  parseData,
  uid,
  QUESTION_META,
  QUESTION_TYPE_LIST,
  type Option,
  type QuestionDataShape,
  type QuestionType,
  type SubQuestion,
} from "@/lib/questions";
import { MathText } from "@/components/MathText";
import { UploadField } from "@/components/UploadField";
import { SubmitButton } from "@/components/SubmitButton";
import {
  EditorToolbar,
  MathToolbar,
  formatSelection,
  type FormatAction,
} from "@/components/RichTextEditor";
import { cn } from "@/lib/utils";

type Dict = QuestionDataShape;

export type BuilderQuestion = {
  id: string;
  type: string;
  prompt: string;
  mediaUrl: string | null;
  points: number;
  difficulty: string;
  tags: string;
  data: string;
  explanation: string | null;
};

function ControlledMathEditor({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  hint?: string;
}) {
  const [preview, setPreview] = useState(false);
  const [mathEnabled, setMathEnabled] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  function focusSelection(selectionStart: number, selectionEnd: number) {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function applyFormat(action: FormatAction) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const result = formatSelection(value, start, end, action);
    onChange(result.next);
    focusSelection(result.selectionStart, result.selectionEnd);
  }

  function insert(snippet: string) {
    const el = ref.current;
    if (!el) {
      onChange(value + snippet);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + snippet.length;
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="label mb-0">{label}</span>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
        >
          {preview ? <Pencil className="size-3" /> : <Eye className="size-3" />}
          {preview ? "Edit" : "Preview"}
        </button>
      </div>
      {preview ? (
        <div className="min-h-16 rounded-xl border border-slate-200 bg-white p-3">
          {value.trim() ? (
            <MathText content={value} />
          ) : (
            <p className="text-xs text-slate-400">Nothing to preview.</p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-1.5 overflow-hidden rounded-lg border border-slate-200">
            <EditorToolbar
              onFormat={applyFormat}
              mathEnabled={mathEnabled}
              onMathToggle={() => setMathEnabled((enabled) => !enabled)}
              compact
            />
            {mathEnabled && <MathToolbar onInsert={insert} compact />}
          </div>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            className="textarea text-sm"
          />
        </>
      )}
      {hint && <p className="mt-1 text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

function OptionRow({
  option,
  index,
  checked,
  multiple,
  onText,
  onToggle,
  onRemove,
}: {
  option: Option;
  index: number;
  checked: boolean;
  multiple: boolean;
  onText: (v: string) => void;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-2.5 py-2",
        checked ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center border text-[9px] font-bold",
          multiple ? "rounded-[4px]" : "rounded-full",
          checked
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-slate-300 bg-white text-transparent"
        )}
        title={checked ? "Correct answer" : "Mark correct"}
      >
        ✓
      </button>
      <span className="text-[10px] font-bold text-slate-400">{String.fromCharCode(65 + index)}</span>
      <input
        value={option.text}
        onChange={(e) => onText(e.target.value)}
        placeholder="Option text, LaTeX allowed"
        className="flex-1 border-0 bg-transparent p-0 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
      />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </div>
  );
}

function makeSub(type: SubQuestion["type"]): SubQuestion {
  const base: SubQuestion = {
    id: uid(),
    type,
    prompt: "",
    points: 1,
    data: {},
  };
  if (type === "MULTIPLE_CHOICE") {
    base.data = {
      multiple: false,
      options: [
        { id: uid(), text: "" },
        { id: uid(), text: "" },
      ],
      correct: [],
    };
  } else if (type === "YES_NO") {
    base.data = { correct: true };
  } else if (type === "NUMERIC") {
    base.data = { answer: 0, tolerance: 0.001 };
  } else if (type === "SHORT_TEXT") {
    base.data = { accepted: [] };
  }
  return base;
}

export function QuestionBuilder({
  assessmentId,
  courseId,
  initial,
  mode = "assessment",
  allowOpenEnded = true,
}: {
  assessmentId?: string | null;
  courseId?: string;
  initial?: BuilderQuestion;
  mode?: "assessment" | "bank";
  /** Quizzes are closed-response only, so hide and reject open-ended types. */
  allowOpenEnded?: boolean;
}) {
  const allowedTypes = allowOpenEnded
    ? QUESTION_TYPE_LIST
    : QUESTION_TYPE_LIST.filter((t) => t !== "OPEN_ENDED");
  const initialType = (allowedTypes.includes(initial?.type as QuestionType)
    ? initial?.type
    : "MULTIPLE_CHOICE") as QuestionType;
  const base = emptyData(initialType) as Dict;
  const merged = { ...base, ...(parseData<Dict>(initial?.data ?? null) as Dict) };

  const [type, setType] = useState<QuestionType>(initialType);
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [mediaUrl, setMediaUrl] = useState(initial?.mediaUrl ?? "");
  const [points, setPoints] = useState(initial?.points ?? 1);
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? "MEDIUM");
  const [tags, setTags] = useState(initial?.tags ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [data, setData] = useState<Dict>(merged);

  const d = data as Dict;
  const options = (d.options ?? []) as Option[];
  const correct = (d.correct ?? []) as string[];
  const multiple = Boolean(d.multiple);

  function patch(updates: Dict) {
    setData((prev) => ({ ...prev, ...updates }));
  }

  function changeType(next: QuestionType) {
    if (next === type) return;
    setType(next);
    setData(emptyData(next) as Dict);
  }

  function toggleCorrect(id: string) {
    if (multiple) {
      patch({ correct: correct.includes(id) ? correct.filter((c) => c !== id) : [...correct, id] });
    } else {
      patch({ correct: [id] });
    }
  }

  function addOption() {
    patch({ options: [...options, { id: uid(), text: "" }] });
  }

  function updateOption(id: string, text: string) {
    patch({ options: options.map((o) => (o.id === id ? { ...o, text } : o)) });
  }

  function removeOption(id: string) {
    patch({
      options: options.filter((o) => o.id !== id),
      correct: correct.filter((c) => c !== id),
    });
  }

  // Case-study points are derived from sub-questions so totals stay honest.
  const subQuestions = (d.subQuestions ?? []) as SubQuestion[];
  const effectivePoints =
    type === "CASE_STUDY"
      ? Math.max(0.5, subQuestions.reduce((sum, s) => sum + (Number(s.points) || 0), 0))
      : points;

  const meta = QUESTION_META[type];

  return (
    <form action={saveQuestionAction} className="space-y-4">
      <input type="hidden" name="questionId" value={initial?.id ?? ""} />
      <input type="hidden" name="assessmentId" value={assessmentId ?? ""} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="prompt" value={prompt} />
      <input type="hidden" name="data" value={JSON.stringify(data)} />
      <input type="hidden" name="explanation" value={explanation} />
      <input type="hidden" name="points" value={effectivePoints} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="label">Question type</span>
          <select
            value={type}
            onChange={(e) => changeType(e.target.value as QuestionType)}
            className="select"
          >
            {allowedTypes.map((t) => (
              <option key={t} value={t}>
                {QUESTION_META[t].label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500">
            <span className={cn("badge", meta.badge)}>{meta.auto ? "Auto-graded" : "Manual"}</span>
            {meta.description}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label">Points</span>
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={effectivePoints}
              disabled={type === "CASE_STUDY"}
              onChange={(e) => setPoints(Math.max(0.25, Number(e.target.value) || 0.25))}
              className="input disabled:bg-slate-50 disabled:text-slate-500"
            />
            {type === "CASE_STUDY" && (
              <p className="mt-1 text-[10px] text-slate-400">Sum of sub-questions</p>
            )}
          </div>
          <div>
            <span className="label">Difficulty</span>
            <select
              name="difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="select"
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>
        </div>
      </div>

      <ControlledMathEditor
        label={type === "CASE_STUDY" ? "Case prompt" : "Question"}
        value={prompt}
        onChange={setPrompt}
        rows={type === "CASE_STUDY" ? 3 : 4}
        placeholder={
          type === "CASE_STUDY"
            ? "A short prompt introducing the scenario…"
            : "Ask your question. Inline math: $x^2$ · display: $$\\int_0^1 x dx$$"
        }
      />

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <UploadField
          name="mediaUrl"
          label={type === "IMAGE_BASED" ? "Image (required)" : "Stimulus media (optional)"}
          defaultUrl={mediaUrl}
          accept="image/*,video/*,audio/*,application/pdf"
          courseId={courseId}
          onUploaded={(f) => setMediaUrl(f.url)}
          compact
          hint="PNG, JPG, SVG, PDF or short video · 25 MB max"
        />
        <div className="sm:pt-6">
          <span className="label">Tags</span>
          <input
            name="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="quadratics, unit-2"
            className="input sm:w-44"
          />
        </div>
      </div>

      {/* ── Type-specific editor ─────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
        {(type === "MULTIPLE_CHOICE" || type === "IMAGE_BASED") && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-slate-600">
                Options · click the circle/square to mark correct
              </p>
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={multiple}
                  onChange={(e) =>
                    patch({
                      multiple: e.target.checked,
                      correct: e.target.checked ? correct : correct.slice(0, 1),
                    })
                  }
                />
                Multiple answers
              </label>
            </div>
            <div className="space-y-1.5">
              {options.map((o, i) => (
                <OptionRow
                  key={o.id}
                  option={o}
                  index={i}
                  checked={correct.includes(o.id)}
                  multiple={multiple}
                  onText={(v) => updateOption(o.id, v)}
                  onToggle={() => toggleCorrect(o.id)}
                  onRemove={options.length > 2 ? () => removeOption(o.id) : undefined}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" onClick={addOption} className="btn-secondary btn-sm">
                <Plus className="size-3" /> Add option
              </button>
              {multiple && (
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={Boolean(d.partialCredit)}
                    onChange={(e) => patch({ partialCredit: e.target.checked })}
                  />
                  Partial credit for partial answers
                </label>
              )}
              {correct.length === 0 && (
                <span className="text-[10px] font-semibold text-amber-600">
                  ⚠ Mark at least one correct option
                </span>
              )}
            </div>
          </div>
        )}

        {type === "YES_NO" && (
          <div>
            <span className="label">Correct answer</span>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => patch({ correct: v })}
                  className={cn(
                    "flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition",
                    d.correct === v
                      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  )}
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
        )}

        {type === "NUMERIC" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <span className="label">Correct value</span>
              <input
                type="number"
                step="any"
                value={d.answer ?? 0}
                onChange={(e) => patch({ answer: Number(e.target.value) })}
                className="input"
              />
            </div>
            <div>
              <span className="label">Tolerance ±</span>
              <input
                type="number"
                step="any"
                min={0}
                value={d.tolerance ?? 0.001}
                onChange={(e) => patch({ tolerance: Math.abs(Number(e.target.value)) })}
                className="input"
              />
            </div>
            <div>
              <span className="label">Units (optional)</span>
              <input
                value={d.units ?? ""}
                onChange={(e) => patch({ units: e.target.value })}
                placeholder="cm, m/s, °"
                className="input"
              />
            </div>
          </div>
        )}

        {type === "FORMULA" && (
          <div className="space-y-3">
            <div>
              <span className="label">Accepted formula (LaTeX)</span>
              <input
                value={d.answer ?? ""}
                onChange={(e) => patch({ answer: e.target.value })}
                placeholder="\frac{-b \pm \sqrt{b^2-4ac}}{2a}"
                className="input font-mono text-xs"
              />
              {String(d.answer ?? "").trim() && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <MathText content={`$$${d.answer}$$`} />
                </div>
              )}
            </div>
            <div>
              <span className="label">Also accept (one per line)</span>
              <textarea
                value={(d.alternatives ?? []).join("\n")}
                onChange={(e) =>
                  patch({
                    alternatives: e.target.value
                      .split("\n")
                      .map((s: string) => s.trim())
                      .filter(Boolean),
                  })
                }
                rows={3}
                placeholder={"\\frac{1}{2}\n0.5"}
                className="textarea font-mono text-xs"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Whitespace, \left/\right and \dfrac are normalised automatically.
              </p>
            </div>
          </div>
        )}

        {type === "FILL_BLANK" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="label mb-0">Blanks & accepted answers</span>
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
                <input
                  type="checkbox"
                  checked={Boolean(d.caseSensitive)}
                  onChange={(e) => patch({ caseSensitive: e.target.checked })}
                />
                Case sensitive
              </label>
            </div>
            {((d.blanks ?? []) as { id: string; accepted: string[] }[]).map((blank, i) => (
              <div key={blank.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                  {i + 1}
                </span>
                <input
                  value={(blank.accepted ?? []).join(", ")}
                  onChange={(e) =>
                    patch({
                      blanks: (d.blanks as { id: string; accepted: string[] }[]).map((b) =>
                        b.id === blank.id
                          ? {
                              ...b,
                              accepted: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            }
                          : b
                      ),
                    })
                  }
                  placeholder="Accepted answers, comma separated"
                  className="flex-1 border-0 bg-transparent p-0 text-xs focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    patch({ blanks: (d.blanks ?? []).filter((b) => b.id !== blank.id) })
                  }
                  className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                patch({
                  blanks: [...(d.blanks ?? []), { id: uid(), accepted: [] }],
                })
              }
              className="btn-secondary btn-sm"
            >
              <Plus className="size-3" /> Add blank
            </button>
            <p className="text-[10px] text-slate-400">
              The learner sees one input per blank, in order.
            </p>
          </div>
        )}

        {type === "MATCHING" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="label">Left column</span>
              <div className="space-y-1.5">
                {((d.left ?? []) as Option[]).map((o) => (
                  <div key={o.id} className="flex items-center gap-1.5">
                    <input
                      value={o.text}
                      onChange={(e) =>
                        patch({
                          left: (d.left as Option[]).map((x) =>
                            x.id === o.id ? { ...x, text: e.target.value } : x
                          ),
                        })
                      }
                      placeholder="Item"
                      className="input py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const pairs = { ...(d.pairs ?? {}) };
                        delete pairs[o.id];
                        patch({ left: (d.left as Option[]).filter((x) => x.id !== o.id), pairs });
                      }}
                      className="rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => patch({ left: [...((d.left ?? []) as Option[]), { id: uid(), text: "" }] })}
                className="btn-secondary btn-sm mt-2"
              >
                <Plus className="size-3" /> Left item
              </button>
            </div>
            <div>
              <span className="label">Right column</span>
              <div className="space-y-1.5">
                {((d.right ?? []) as Option[]).map((o) => (
                  <div key={o.id} className="flex items-center gap-1.5">
                    <input
                      value={o.text}
                      onChange={(e) =>
                        patch({
                          right: (d.right as Option[]).map((x) =>
                            x.id === o.id ? { ...x, text: e.target.value } : x
                          ),
                        })
                      }
                      placeholder="Match"
                      className="input py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        patch({ right: (d.right as Option[]).filter((x) => x.id !== o.id) })
                      }
                      className="rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  patch({ right: [...((d.right ?? []) as Option[]), { id: uid(), text: "" }] })
                }
                className="btn-secondary btn-sm mt-2"
              >
                <Plus className="size-3" /> Right item
              </button>
            </div>
            {((d.left ?? []) as Option[]).length > 0 && (
              <div className="sm:col-span-2">
                <span className="label">Connections</span>
                <div className="space-y-1.5">
                  {((d.left ?? []) as Option[]).map((l) => (
                    <div key={l.id} className="flex items-center gap-2">
                      <span className="w-1/3 truncate text-xs font-medium text-slate-700">
                        {l.text || "Left item"}
                      </span>
                      <span className="text-slate-300">→</span>
                      <select
                        value={(d.pairs ?? {})[l.id] ?? ""}
                        onChange={(e) => patch({ pairs: { ...(d.pairs ?? {}), [l.id]: e.target.value } })}
                        className="select flex-1 py-1.5 text-xs"
                      >
                        <option value="">Choose match…</option>
                        {((d.right ?? []) as Option[]).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.text || "(empty)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {type === "OPEN_ENDED" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:w-1/2">
              <div>
                <span className="label">Min words</span>
                <input
                  type="number"
                  min={0}
                  value={d.minWords ?? ""}
                  onChange={(e) => patch({ minWords: e.target.value ? Number(e.target.value) : undefined })}
                  className="input"
                />
              </div>
              <div>
                <span className="label">Max words</span>
                <input
                  type="number"
                  min={0}
                  value={d.maxWords ?? ""}
                  onChange={(e) => patch({ maxWords: e.target.value ? Number(e.target.value) : undefined })}
                  className="input"
                />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label mb-0">Rubric criteria</span>
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      rubric: [
                        ...((d.rubric ?? []) as { id: string; criterion: string; points: number }[]),
                        { id: uid(), criterion: "", points: 1 },
                      ],
                    })
                  }
                  className="text-[10px] font-semibold text-brand-600 hover:underline"
                >
                  + Add criterion
                </button>
              </div>
              <div className="space-y-1.5">
                {((d.rubric ?? []) as { id: string; criterion: string; points: number }[]).map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <input
                      value={r.criterion}
                      onChange={(e) =>
                        patch({
                          rubric: (d.rubric ?? []).map((x) =>
                            x.id === r.id ? { ...x, criterion: e.target.value } : x
                          ),
                        })
                      }
                      placeholder="Clear reasoning"
                      className="input py-2 text-xs"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={r.points}
                      onChange={(e) =>
                        patch({
                          rubric: (d.rubric ?? []).map((x) =>
                            x.id === r.id ? { ...x, points: Number(e.target.value) } : x
                          ),
                        })
                      }
                      className="input w-16 py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        patch({ rubric: (d.rubric ?? []).filter((x) => x.id !== r.id) })
                      }
                      className="rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Sample answer (optional, shown after grading)</span>
              <textarea
                value={d.sampleAnswer ?? ""}
                onChange={(e) => patch({ sampleAnswer: e.target.value })}
                rows={2}
                className="textarea text-xs"
              />
            </div>
            <p className="text-[10px] text-slate-400">
              Open answers go to the manual grading queue. Rubric points are guidance for the grader.
            </p>
          </div>
        )}

        {type === "CASE_STUDY" && (
          <div className="space-y-3">
            <ControlledMathEditor
              label="Scenario / passage"
              value={d.passage ?? ""}
              onChange={(v) => patch({ passage: v })}
              rows={6}
              placeholder="Write the case study context. Tables, lists and LaTeX are supported."
            />
            <div>
              <div className="mb-1.5 flex items-end justify-between">
                <div>
                  <span className="label mb-0">Sub-questions</span>
                  <p className="text-[10px] text-slate-400">
                    {subQuestions.length} nested · {effectivePoints} points total
                  </p>
                </div>
                <details className="relative">
                  <summary className="btn-secondary btn-sm cursor-pointer list-none">
                    <Plus className="size-3" /> Add sub-question
                  </summary>
                  <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    {(
                      [
                        ["MULTIPLE_CHOICE", "Multiple choice"],
                        ["YES_NO", "Yes / No"],
                        ["OPEN_ENDED", "Open ended"],
                        ["NUMERIC", "Numeric"],
                        ["SHORT_TEXT", "Short text"],
                      ] as [SubQuestion["type"], string][]
                    )
                      .filter(([t]) => allowOpenEnded || t !== "OPEN_ENDED")
                      .map(([t, label]) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => patch({ subQuestions: [...subQuestions, makeSub(t)] })}
                        className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-100"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </details>
              </div>

              <div className="space-y-2.5">
                {subQuestions.map((sub, index) => (
                  <div key={sub.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded bg-slate-100 text-[9px] font-bold text-slate-500">
                        {index + 1}
                      </span>
                      <select
                        value={sub.type}
                        onChange={(e) =>
                          patch({
                            subQuestions: subQuestions.map((x) =>
                              x.id === sub.id ? { ...makeSub(e.target.value as SubQuestion["type"]), id: sub.id, prompt: sub.prompt, points: sub.points } : x
                            ),
                          })
                        }
                        className="select w-36 py-1 text-[11px]"
                      >
                        <option value="MULTIPLE_CHOICE">Multiple choice</option>
                        <option value="YES_NO">Yes / No</option>
                        {allowOpenEnded && <option value="OPEN_ENDED">Open ended</option>}
                        <option value="NUMERIC">Numeric</option>
                        <option value="SHORT_TEXT">Short text</option>
                      </select>
                      <input
                        type="number"
                        min={0.25}
                        step={0.25}
                        value={sub.points}
                        onChange={(e) =>
                          patch({
                            subQuestions: subQuestions.map((x) =>
                              x.id === sub.id ? { ...x, points: Number(e.target.value) } : x
                            ),
                          })
                        }
                        className="input w-16 py-1 text-[11px]"
                      />
                      <span className="text-[9px] text-slate-400">pts</span>
                      <button
                        type="button"
                        onClick={() =>
                          patch({ subQuestions: subQuestions.filter((x) => x.id !== sub.id) })
                        }
                        className="ml-auto rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                    <textarea
                      value={sub.prompt}
                      onChange={(e) =>
                        patch({
                          subQuestions: subQuestions.map((x) =>
                            x.id === sub.id ? { ...x, prompt: e.target.value } : x
                          ),
                        })
                      }
                      rows={2}
                      placeholder="Sub-question prompt (LaTeX supported)"
                      className="textarea mb-2 text-xs"
                    />
                    <SubQuestionData
                      sub={sub}
                      onChange={(next) =>
                        patch({
                          subQuestions: subQuestions.map((x) => (x.id === sub.id ? next : x)),
                        })
                      }
                    />
                  </div>
                ))}
                {subQuestions.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-[11px] text-slate-400">
                    Add at least one sub-question to the case study.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ControlledMathEditor
        label="Explanation / worked solution (optional)"
        value={explanation}
        onChange={setExplanation}
        rows={3}
        placeholder="Shown to learners after grading. LaTeX supported."
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <SubmitButton pendingText="Saving…">
          <Sparkles className="size-3.5" /> {initial ? "Update question" : "Add question"}
        </SubmitButton>
        <span className="text-[10px] text-slate-400">
          {mode === "bank" ? "Saved to the shared question bank." : "Saved to this assessment."}
        </span>
      </div>
    </form>
  );
}

function SubQuestionData({
  sub,
  onChange,
}: {
  sub: SubQuestion;
  onChange: (next: SubQuestion) => void;
}) {
  const data = sub.data as Dict;
  const patch = (updates: Dict) => onChange({ ...sub, data: { ...data, ...updates } });

  if (sub.type === "MULTIPLE_CHOICE") {
    const options = (data.options ?? []) as Option[];
    const correct = (data.correct ?? []) as string[];
    return (
      <div className="space-y-1.5">
        {options.map((o, i) => (
          <OptionRow
            key={o.id}
            option={o}
            index={i}
            checked={correct.includes(o.id)}
            multiple={false}
            onText={(v) =>
              patch({ options: options.map((x) => (x.id === o.id ? { ...x, text: v } : x)) })
            }
            onToggle={() => patch({ correct: [o.id] })}
            onRemove={options.length > 2 ? () => patch({ options: options.filter((x) => x.id !== o.id), correct: correct.filter((c) => c !== o.id) }) : undefined}
          />
        ))}
        <button
          type="button"
          onClick={() => patch({ options: [...options, { id: uid(), text: "" }] })}
          className="text-[10px] font-semibold text-brand-600 hover:underline"
        >
          + Add option
        </button>
      </div>
    );
  }

  if (sub.type === "YES_NO") {
    return (
      <div className="flex gap-2">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => patch({ correct: v })}
            className={cn(
              "rounded-lg border px-3 py-1 text-[11px] font-semibold",
              data.correct === v
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-500"
            )}
          >
            {v ? "Yes" : "No"}
          </button>
        ))}
      </div>
    );
  }

  if (sub.type === "NUMERIC") {
    return (
      <div className="flex gap-2">
        <input
          type="number"
          step="any"
          value={data.answer ?? 0}
          onChange={(e) => patch({ answer: Number(e.target.value) })}
          className="input w-28 py-1.5 text-xs"
          placeholder="Answer"
        />
        <input
          type="number"
          step="any"
          min={0}
          value={data.tolerance ?? 0.001}
          onChange={(e) => patch({ tolerance: Math.abs(Number(e.target.value)) })}
          className="input w-24 py-1.5 text-xs"
          placeholder="± tolerance"
        />
      </div>
    );
  }

  if (sub.type === "SHORT_TEXT") {
    return (
      <input
        value={(data.accepted ?? []).join(", ")}
        onChange={(e) =>
          patch({
            accepted: e.target.value
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean),
          })
        }
        placeholder="Accepted answers, comma separated"
        className="input py-1.5 text-xs"
      />
    );
  }

  return (
    <p className="text-[10px] text-slate-400">
      Graded manually in the grading queue.
    </p>
  );
}
