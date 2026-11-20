"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Save,
  Send,
  Sigma,
} from "lucide-react";
import { MathText } from "@/components/MathText";
import { autoSubmitAttemptAction, saveAnswerAction } from "@/lib/actions/attempt";
import {
  QUESTION_META,
  isEmptyResponse,
  parseData,
  type QuestionDataShape,
  type QuestionType,
  type SubQuestion,
} from "@/lib/questions";
import { cn, formatDuration } from "@/lib/utils";

type RunnerQuestion = {
  id: string;
  type: string;
  prompt: string;
  mediaUrl: string | null;
  points: number;
  data: string;
};

type Responses = Record<string, Record<string, unknown>>;

const MATH_SNIPPETS = [
  { label: "x²", value: "x^2" },
  { label: "√", value: "\\sqrt{x}" },
  { label: "a/b", value: "\\frac{a}{b}" },
  { label: "π", value: "\\pi" },
  { label: "≤", value: "\\le" },
  { label: "±", value: "\\pm" },
];

function answered(question: RunnerQuestion, response: Record<string, unknown> | undefined) {
  if (!response) return false;
  if (question.type === "CASE_STUDY") {
    const data = parseData<{ subQuestions?: SubQuestion[] }>(question.data);
    const sub = (response.sub as Record<string, Record<string, unknown>>) ?? {};
    return (data.subQuestions ?? []).some((sq) => {
      const r = sub[sq.id];
      if (!r) return false;
      if (sq.type === "SHORT_TEXT") return String(r.value ?? "").trim().length > 0;
      return !isEmptyResponse(sq.type, r);
    });
  }
  return !isEmptyResponse(question.type, response);
}

export function AttemptRunner({
  attemptId,
  assessmentTitle,
  courseTitle,
  instructions,
  questions,
  initialResponses,
  timeLimitMin,
  startedAt,
  passScore,
}: {
  attemptId: string;
  assessmentTitle: string;
  courseTitle: string;
  instructions: string;
  questions: RunnerQuestion[];
  initialResponses: Responses;
  timeLimitMin: number | null;
  startedAt: number;
  passScore: number;
}) {
  const router = useRouter();
  const [responses, setResponses] = useState<Responses>(initialResponses);
  const [now, setNow] = useState(() => Date.now());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [phase, setPhase] = useState<"active" | "submitting" | "error">("active");
  const [current, setCurrent] = useState(0);
  const [, setSubject] = useState("");
  const [pending] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const submittingRef = useRef(false);
  const submittedRef = useRef(false);

  const deadline = useMemo(
    () => (timeLimitMin ? startedAt + timeLimitMin * 60_000 : null),
    [timeLimitMin, startedAt]
  );
  const secondsLeft = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;

  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
  const answeredCount = questions.filter((q) => answered(q, responses[q.id])).length;
  const percent = totalPoints ? Math.round((answeredCount / questions.length) * 100) : 0;

  function persist(questionId: string, response: Record<string, unknown>) {
    if (timers.current[questionId]) clearTimeout(timers.current[questionId]);
    setSaveState("saving");
    timers.current[questionId] = setTimeout(async () => {
      const result = await saveAnswerAction({ attemptId, questionId, response });
      if (result.expired) {
        void submitAttempt(true);
        return;
      }
      if (!result.ok) {
        setSaveState("error");
        return;
      }
      setSaveState("saved");
      setLastSaved(new Date());
    }, 650);
  }

  function update(questionId: string, response: Record<string, unknown>) {
    setResponses((prev) => ({ ...prev, [questionId]: response }));
    persist(questionId, response);
  }

  async function submitAttempt(auto = false) {
    if (submittingRef.current) return;
    if (!auto) {
      const unanswered = questions.length - answeredCount;
      if (unanswered > 0) {
        const ok = window.confirm(
          `${unanswered} question${unanswered === 1 ? "" : "s"} still unanswered. Submit anyway?`
        );
        if (!ok) return;
      } else if (!window.confirm("Submit this attempt? You cannot change your answers afterwards.")) {
        return;
      }
    }
    submittingRef.current = true;
    setPhase("submitting");
    try {
      await Promise.all(
        Object.entries(responses).map(([questionId, response]) =>
          saveAnswerAction({ attemptId, questionId, response })
        )
      );
      const result = await autoSubmitAttemptAction(attemptId);
      if (!result.ok) {
        setPhase("error");
        submittingRef.current = false;
        return;
      }
      submittedRef.current = true;
      router.push(`/results/${attemptId}?submitted=1`);
    } catch {
      setPhase("error");
      submittingRef.current = false;
    }
  }

  useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 0 && !submittedRef.current) {
      void submitAttempt(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  const question = questions[current];
  const meta = question ? QUESTION_META[question.type as QuestionType] : null;
  const progressPercent = questions.length ? ((current + 1) / questions.length) * 100 : 0;

  if (phase === "error") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertTriangle className="size-6" />
        </span>
        <h1 className="mt-3 text-lg font-bold text-slate-900">We could not submit the attempt</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your answers are saved locally in this tab. Check your connection and try again.
        </p>
        <button onClick={() => void submitAttempt(false)} className="btn-primary mt-4">
          Retry submit
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {courseTitle}
            </p>
            <h1 className="truncate text-sm font-bold text-slate-900">{assessmentTitle}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                saveState === "error"
                  ? "bg-rose-50 text-rose-700"
                  : saveState === "saving"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700"
              )}
            >
              {saveState === "saving" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : saveState === "error" ? (
                <AlertTriangle className="size-3" />
              ) : (
                <Check className="size-3" />
              )}
              <span className="hidden sm:inline">
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "error"
                    ? "Not saved"
                    : lastSaved
                      ? "Saved"
                      : "Autosave on"}
              </span>
            </span>
            {secondsLeft !== null && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums",
                  secondsLeft <= 60
                    ? "bg-rose-600 text-white"
                    : secondsLeft <= 300
                      ? "bg-amber-50 text-amber-700"
                      : "bg-slate-100 text-slate-700"
                )}
              >
                <Clock className="size-3" /> {formatDuration(secondsLeft)}
              </span>
            )}
            <button
              onClick={() => void submitAttempt(false)}
              disabled={phase === "submitting" || pending}
              className="btn-primary btn-sm"
            >
              {phase === "submitting" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              {phase === "submitting" ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
        <div className="h-1 w-full bg-slate-100">
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_260px]">
        <main>
          {instructions && current === 0 && (
            <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50/70 px-4 py-3 text-xs leading-5 text-brand-900">
              <p className="font-bold uppercase tracking-wider">Instructions</p>
              <MathText content={instructions} className="mt-1 text-xs leading-5 text-brand-900" />
            </div>
          )}

          {question && (
            <article className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-white text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                    {current + 1}
                  </span>
                  {meta && <span className={`badge ${meta.badge}`}>{meta.label}</span>}
                  <span className="text-[10px] font-semibold text-slate-400">
                    {question.points} pt{question.points === 1 ? "" : "s"}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">
                  {answeredCount} of {questions.length} answered
                </span>
              </div>

              <div className="p-5 sm:p-6">
                {question.type === "CASE_STUDY" ? (
                  <CaseStudyQuestion
                    question={question}
                    response={responses[question.id] ?? {}}
                    onChange={(response) => update(question.id, response)}
                  />
                ) : (
                  <>
                    {question.prompt && <MathText content={question.prompt} />}
                    <MediaBlock url={question.mediaUrl} />
                    <div className="mt-4">
                      <AnswerInput
                        question={question}
                        response={responses[question.id] ?? {}}
                        onChange={(response) => update(question.id, response)}
                        onSubject={setSubject}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                  disabled={current === 0}
                  className="btn-ghost btn-sm"
                >
                  <ChevronLeft className="size-3.5" /> Previous
                </button>
                <button
                  type="button"
                  onClick={() => setSaveState("saved")}
                  className="hidden items-center gap-1 text-[10px] font-semibold text-slate-400 sm:flex"
                  title="Answers save automatically"
                >
                  <Save className="size-3" /> Autosaved
                </button>
                {current < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
                    className="btn-primary btn-sm"
                  >
                    Next <ChevronRight className="size-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void submitAttempt(false)}
                    className="btn-primary btn-sm"
                  >
                    <Send className="size-3.5" /> Submit attempt
                  </button>
                )}
              </div>
            </article>
          )}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-900">Question map</h2>
              <span className="text-[10px] text-slate-400">{answeredCount}/{questions.length}</span>
            </div>
            <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
              {questions.map((q, index) => {
                const isAnswered = answered(q, responses[q.id]);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrent(index)}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg text-[11px] font-bold transition",
                      index === current
                        ? "bg-brand-600 text-white ring-2 ring-brand-300"
                        : isAnswered
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    )}
                    title={isAnswered ? "Answered" : "Unanswered"}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-[9px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-400" /> answered
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-slate-300" /> blank
              </span>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400">
                {percent}% of questions answered · pass at {passScore}%
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] leading-5 text-slate-500">
            <p className="flex items-center gap-1 font-semibold text-slate-700">
              <CheckCircle2 className="size-3 text-emerald-500" /> Your work saves as you type
            </p>
            <p className="mt-1">
              {secondsLeft !== null
                ? "The timer submits automatically when it reaches zero."
                : "There is no time limit on this assessment."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Answer inputs ───────────────────────────────────────────────────────────

function AnswerInput({
  question,
  response,
  onChange,
  onSubject,
  sub = false,
}: {
  question: { type: string; data: string };
  response: Record<string, unknown>;
  onChange: (response: Record<string, unknown>) => void;
  onSubject?: (value: string) => void;
  sub?: boolean;
}) {
  const data = parseData<QuestionDataShape>(question.data);
  const type = question.type;

  switch (type) {
    case "MULTIPLE_CHOICE":
    case "IMAGE_BASED": {
      const options = (data.options ?? []) as { id: string; text: string; imageUrl?: string }[];
      const multiple = Boolean(data.multiple);
      const selected = (response.selected as string[]) ?? [];
      function toggle(id: string) {
        if (multiple) {
          onChange({
            selected: selected.includes(id)
              ? selected.filter((s) => s !== id)
              : [...selected, id],
          });
        } else {
          onChange({ selected: [id] });
        }
      }
      if (type === "IMAGE_BASED") {
        return (
          <div>
            {multiple && <p className="mb-2 text-[10px] font-semibold text-brand-600">Select all that apply</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {options.map((option, index) => {
                const picked = selected.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggle(option.id)}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border text-left transition",
                      picked
                        ? "border-brand-400 bg-brand-50/40 ring-2 ring-brand-500/20"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-2.5 top-2.5 z-10 flex size-6 items-center justify-center text-[10px] font-bold shadow-sm",
                        multiple ? "rounded-md" : "rounded-full",
                        picked ? "bg-brand-600 text-white" : "bg-white/90 text-slate-600 ring-1 ring-slate-200"
                      )}
                    >
                      {picked ? <Check className="size-3.5" /> : String.fromCharCode(65 + index)}
                    </span>
                    {option.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={option.imageUrl}
                        alt={option.text || `Option ${String.fromCharCode(65 + index)}`}
                        className="aspect-[4/3] w-full bg-slate-100 object-contain"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 px-4 text-center text-xs text-slate-400">
                        No image uploaded
                      </div>
                    )}
                    {option.text ? (
                      <span className="block border-t border-slate-100 px-3 py-2 text-sm text-slate-700">
                        <MathText content={option.text} inline />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }
      return (
        <div className="space-y-2">
          {multiple && <p className="text-[10px] font-semibold text-brand-600">Select all that apply</p>}
          {options.map((option, index) => {
            const picked = selected.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => toggle(option.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition",
                  picked
                    ? "border-brand-400 bg-brand-50/70 text-slate-900 ring-2 ring-brand-500/10"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center text-[10px] font-bold",
                    multiple ? "rounded-md" : "rounded-full",
                    picked ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
                  )}
                >
                  {picked ? <Check className="size-3" /> : String.fromCharCode(65 + index)}
                </span>
                <span className="min-w-0 flex-1">
                  {option.text ? <MathText content={option.text} inline /> : <em className="text-slate-400">Empty option</em>}
                  {option.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={option.imageUrl} alt="" className="mt-1.5 max-h-24 rounded-lg border border-slate-200" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      );
    }
    case "YES_NO": {
      const value = response.value;
      return (
        <div className="flex gap-2">
          {[true, false].map((option) => (
            <button
              key={String(option)}
              type="button"
              onClick={() => onChange({ value: option })}
              className={cn(
                "flex min-w-24 items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition",
                value === option
                  ? "border-brand-400 bg-brand-50 text-brand-800 ring-2 ring-brand-500/10"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              {value === option && <Check className="size-4" />}
              {option ? "Yes" : "No"}
            </button>
          ))}
        </div>
      );
    }
    case "NUMERIC": {
      return (
        <div>
          <input
            type="number"
            step="any"
            value={String(response.value ?? "")}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="Enter a number"
            className="input max-w-xs font-mono text-base"
          />
          {data.units && <p className="mt-1 text-[11px] text-slate-400">Units: {data.units}</p>}
        </div>
      );
    }
    case "FORMULA": {
      const value = String(response.value ?? "");
      return (
        <div>
          <div className="mb-2 flex flex-wrap gap-1">
            {MATH_SNIPPETS.map((snippet) => (
              <button
                key={snippet.label}
                type="button"
                onClick={() => onChange({ value: value + snippet.value })}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-600 hover:border-brand-300 hover:bg-brand-50"
              >
                {snippet.label}
              </button>
            ))}
          </div>
          <textarea
            value={value}
            onChange={(e) => onChange({ value: e.target.value })}
            rows={3}
            placeholder="Type LaTeX, e.g. \frac{-b \pm \sqrt{b^2-4ac}}{2a}"
            className="textarea font-mono text-[13px]"
          />
          <div className="mt-2 min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <Sigma className="size-3" /> Live preview
            </p>
            {value.trim() ? (
              <MathText content={`$$${value}$$`} />
            ) : (
              <p className="text-xs text-slate-400">Your formula will render here.</p>
            )}
          </div>
        </div>
      );
    }
    case "FILL_BLANK": {
      const blanks = (data.blanks ?? []) as { id: string; accepted: string[] }[];
      const values = (response.values as Record<string, string>) ?? {};
      return (
        <div className="space-y-2">
          {blanks.map((blank, index) => (
            <div key={blank.id} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-500">
                {index + 1}
              </span>
              <input
                value={values[blank.id] ?? ""}
                onChange={(e) => onChange({ values: { ...values, [blank.id]: e.target.value } })}
                placeholder={`Blank ${index + 1}`}
                className="input max-w-sm"
              />
            </div>
          ))}
        </div>
      );
    }
    case "MATCHING": {
      const left = (data.left ?? []) as { id: string; text: string }[];
      const right = (data.right ?? []) as { id: string; text: string }[];
      const pairs = (response.pairs as Record<string, string>) ?? {};
      return (
        <MatchingAnswer
          left={left}
          right={right}
          pairs={pairs}
          onChange={(next) => onChange({ pairs: next })}
        />
      );
    }
    case "OPEN_ENDED": {
      const text = String(response.text ?? "");
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      return (
        <div>
          <textarea
            value={text}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={sub ? 4 : 8}
            placeholder="Write your answer. Show your reasoning step by step."
            className="textarea"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>{words} words</span>
            <span className="flex items-center gap-1">
              <Sigma className="size-3" /> Math: $x^2$ inline, $$…$$ display
            </span>
          </div>
        </div>
      );
    }
    case "SHORT_TEXT": {
      return (
        <input
          value={String(response.value ?? "")}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="Type your answer"
          className="input max-w-sm"
          onFocus={() => onSubject?.("")}
        />
      );
    }
    default:
      return (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This question type is not supported by the runner yet.
        </p>
      );
  }
}


function MatchingAnswer({
  left,
  right,
  pairs,
  onChange,
}: {
  left: { id: string; text: string }[];
  right: { id: string; text: string }[];
  pairs: Record<string, string>;
  onChange: (pairs: Record<string, string>) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  function setPair(leftId: string, rightId: string) {
    if (!rightId) return;
    onChange({ ...pairs, [leftId]: rightId });
  }

  function clearPair(leftId: string) {
    const next = { ...pairs };
    delete next[leftId];
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold text-slate-500">
        Drag a match from the bank onto each item, or drop a different match to replace it.
      </p>
      <div className="space-y-2">
        {left.map((item) => {
          const matchedId = pairs[item.id];
          const matched = right.find((r) => r.id === matchedId);
          const active = over === item.id;
          return (
            <div key={item.id} className="grid items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                <MathText content={item.text} inline />
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (over !== item.id) setOver(item.id);
                }}
                onDragLeave={() => setOver((current) => (current === item.id ? null : current))}
                onDrop={(e) => {
                  e.preventDefault();
                  const rightId = e.dataTransfer.getData("text/plain");
                  setOver(null);
                  setDragging(null);
                  if (rightId) setPair(item.id, rightId);
                }}
                className={cn(
                  "flex min-h-[44px] items-center justify-between gap-2 rounded-xl border-2 border-dashed px-3 py-2 text-sm transition",
                  active
                    ? "border-brand-400 bg-brand-50/70"
                    : matched
                      ? "border-emerald-300 bg-emerald-50/50"
                      : "border-slate-200 bg-white"
                )}
              >
                {matched ? (
                  <>
                    <span className="min-w-0 flex-1 text-slate-800">
                      <MathText content={matched.text} inline />
                    </span>
                    <button
                      type="button"
                      onClick={() => clearPair(item.id)}
                      className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-slate-400 hover:bg-white hover:text-rose-600"
                      title="Remove match"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <span className="text-slate-400">Drop a match here…</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Match bank</p>
        <div className="flex flex-wrap gap-2">
          {right.map((option) => {
            const assignedTo = Object.entries(pairs).find(([, rid]) => rid === option.id)?.[0];
            const assignedLabel = assignedTo ? left.findIndex((l) => l.id === assignedTo) : -1;
            return (
              <div
                key={option.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", option.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDragging(option.id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                className={cn(
                  "cursor-grab select-none rounded-xl border px-3 py-2 text-sm shadow-sm transition active:cursor-grabbing",
                  dragging === option.id
                    ? "border-brand-400 bg-brand-50 opacity-60"
                    : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/40"
                )}
                title="Drag onto a matching item"
              >
                <MathText content={option.text} inline />
                {assignedLabel >= 0 && (
                  <span className="ml-2 inline-flex size-4 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700 align-middle">
                    {assignedLabel + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CaseStudyQuestion({
  question,
  response,
  onChange,
}: {
  question: RunnerQuestion;
  response: Record<string, unknown>;
  onChange: (response: Record<string, unknown>) => void;
}) {
  const data = parseData<{ passage?: string; subQuestions?: SubQuestion[] }>(question.data);
  const subs = data.subQuestions ?? [];
  const nested = (response.sub as Record<string, Record<string, unknown>>) ?? {};

  return (
    <div>
      {question.prompt && <MathText content={question.prompt} />}
      {data.passage && data.passage !== question.prompt && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm leading-6 text-slate-700">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-amber-700">Scenario</p>
          <MathText content={data.passage} />
        </div>
      )}
      <MediaBlock url={question.mediaUrl} />
      <div className="mt-4 space-y-4">
        {subs.map((sub, index) => (
          <div key={sub.id} className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Part {index + 1} · {sub.type.replaceAll("_", " ").toLowerCase()}
              </p>
              <span className="text-[10px] font-semibold text-slate-400">{sub.points} pt</span>
            </div>
            <div className="mb-3 text-sm">
              <MathText content={sub.prompt || "_No prompt_"} />
            </div>
            <AnswerInput
              sub
              question={{ type: sub.type, data: JSON.stringify(sub.data) }}
              response={nested[sub.id] ?? {}}
              onChange={(value) => onChange({ sub: { ...nested, [sub.id]: value } })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaBlock({ url }: { url: string | null }) {
  if (!url) return null;
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|&|$)/i.test(url)) {
    return <video src={url} controls className="mt-3 max-h-80 w-full rounded-xl border border-slate-200" />;
  }
  if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?|&|$)/i.test(url)) {
    return <audio src={url} controls className="mt-3 w-full" />;
  }
  if (/\.pdf(\?|&|$)/i.test(url)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm mt-3">
        Open attached PDF
      </a>
    );
  }
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?|&|$)/i.test(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="Question media" className="mt-3 max-h-80 rounded-xl border border-slate-200 object-contain" />
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm mt-3">
      Open attachment
    </a>
  );
}
