import { Check, X } from "lucide-react";
import { MathText } from "@/components/MathText";
import {
  QUESTION_META,
  parseData,
  type Option,
  type QuestionDataShape,
  type QuestionType,
  type SubQuestion,
} from "@/lib/questions";
import { cn } from "@/lib/utils";

type ReviewQuestion = {
  type: string;
  prompt: string;
  mediaUrl?: string | null;
  points: number;
  data: string;
  explanation?: string | null;
};

function letter(index: number) {
  return String.fromCharCode(65 + index);
}

function ChoiceReview({
  data,
  selected,
  showKey,
}: {
  data: { options?: Option[]; correct?: string[]; multiple?: boolean };
  selected: string[];
  showKey: boolean;
}) {
  const options = data.options ?? [];
  const correct = data.correct ?? [];
  return (
    <ul className="mt-3 space-y-1.5">
      {options.map((option, index) => {
        const isSelected = selected.includes(option.id);
        const isCorrect = correct.includes(option.id);
        const tone = showKey
          ? isCorrect
            ? "border-emerald-300 bg-emerald-50"
            : isSelected
              ? "border-rose-300 bg-rose-50"
              : "border-slate-200 bg-white"
          : isSelected
            ? "border-brand-300 bg-brand-50"
            : "border-slate-200 bg-white";
        return (
          <li key={option.id} className={cn("rounded-xl border px-3 py-2 text-sm", tone)}>
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  isSelected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
                )}
              >
                {showKey && isCorrect ? <Check className="size-3" /> : showKey && isSelected ? <X className="size-3" /> : letter(index)}
              </span>
              <span className="min-w-0 flex-1 text-slate-700">
                {option.text ? <MathText content={option.text} inline /> : <em className="text-slate-400">Empty option</em>}
                {option.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={option.imageUrl} alt="" className="mt-1.5 max-h-28 rounded-lg border border-slate-200" />
                )}
              </span>
              {isSelected && <span className="text-[10px] font-semibold text-slate-400">chosen</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function QuestionReview({
  question,
  response,
  score,
  feedback,
  showKey = false,
  index,
  nested = false,
}: {
  question: ReviewQuestion;
  response: Record<string, unknown>;
  score?: number | null;
  feedback?: string | null;
  showKey?: boolean;
  index?: number;
  nested?: boolean;
}) {
  const type = question.type || "OPEN_ENDED";
  const meta = QUESTION_META[type as QuestionType] ?? QUESTION_META.OPEN_ENDED;
  const data = parseData<QuestionDataShape>(question.data);

  const body = (() => {
    switch (type) {
      case "MULTIPLE_CHOICE":
      case "IMAGE_BASED":
        return (
          <ChoiceReview
            data={data as { options?: Option[]; correct?: string[]; multiple?: boolean }}
            selected={(response.selected as string[]) ?? []}
            showKey={showKey}
          />
        );
      case "YES_NO": {
        const value = response.value;
        const correct = Boolean(data.correct);
        return (
          <div className="mt-3 flex gap-2">
            {[true, false].map((option) => {
              const isPicked = value === option;
              const isCorrect = correct === option;
              return (
                <span
                  key={String(option)}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-sm font-semibold",
                    showKey && isCorrect
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : isPicked
                        ? "border-brand-300 bg-brand-50 text-brand-800"
                        : "border-slate-200 bg-white text-slate-500"
                  )}
                >
                  {option ? "Yes" : "No"}
                  {isPicked && <span className="ml-1.5 text-[10px] font-normal opacity-70">chosen</span>}
                </span>
              );
            })}
          </div>
        );
      }
      case "SHORT_TEXT": {
        const value = String(response.value ?? "").trim();
        const accepted = (data.accepted ?? []) as string[];
        return (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-400">Answer: </span>
            <span className="font-mono font-semibold text-slate-900">{value || "—"}</span>
            {showKey && accepted.length > 0 && (
              <span className="ml-3 text-[11px] text-slate-400">
                accepted: {accepted.join(" / ")}
              </span>
            )}
          </div>
        );
      }
      case "NUMERIC": {
        const value = String(response.value ?? "").trim();
        const answer = data.answer;
        const tolerance = data.tolerance;
        return (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-400">Answer submitted: </span>
            <span className="font-mono font-semibold text-slate-900">{value || "—"}</span>
            {showKey && (
              <span className="ml-3 text-[11px] text-emerald-700">
                expected {answer}
                {tolerance ? ` ± ${tolerance}` : ""}
                {data.units ? ` ${data.units}` : ""}
              </span>
            )}
          </div>
        );
      }
      case "FORMULA": {
        const value = String(response.value ?? "").trim();
        return (
          <div className="mt-3 space-y-1.5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-400">Submitted: </span>
              {value ? <MathText content={`$$${value}$$`} /> : <span className="text-slate-400">—</span>}
            </div>
            {showKey && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Accepted: <MathText content={`$$${data.answer}$$`} inline />
                {((data.alternatives ?? []) as string[]).map((alt) => (
                  <span key={alt} className="ml-2">
                    <MathText content={`$$${alt}$$`} inline />
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      }
      case "FILL_BLANK": {
        const values = (response.values as Record<string, string>) ?? {};
        const blanks = (data.blanks ?? []) as { id: string; accepted: string[] }[];
        return (
          <div className="mt-3 space-y-1.5">
            {blanks.map((blank, i) => {
              const submitted = values[blank.id] ?? "";
              const ok = (blank.accepted ?? []).some(
                (a) => a.trim().toLowerCase() === submitted.trim().toLowerCase()
              );
              return (
                <div key={blank.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span className="text-[10px] font-bold text-slate-400">BLANK {i + 1}</span>
                  <span className={cn("font-mono font-semibold", ok ? "text-emerald-700" : "text-slate-900")}>
                    {submitted || "—"}
                  </span>
                  {showKey && (
                    <span className="text-[11px] text-slate-400">
                      accepted: {(blank.accepted ?? []).join(" / ")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      }
      case "MATCHING": {
        const left = (data.left ?? []) as Option[];
        const right = (data.right ?? []) as Option[];
        const pairs = (data.pairs ?? {}) as Record<string, string>;
        const submitted = (response.pairs as Record<string, string>) ?? {};
        return (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2">Left</th>
                  <th className="px-3 py-2">Your match</th>
                  {showKey && <th className="px-3 py-2">Key</th>}
                </tr>
              </thead>
              <tbody>
                {left.map((item) => {
                  const picked = submitted[item.id];
                  const correct = pairs[item.id];
                  const pickedText = right.find((r) => r.id === picked)?.text ?? "—";
                  const correctText = right.find((r) => r.id === correct)?.text ?? "—";
                  return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{item.text}</td>
                      <td className={cn("px-3 py-2 font-medium", picked === correct ? "text-emerald-700" : "text-slate-700")}>
                        {pickedText}
                      </td>
                      {showKey && <td className="px-3 py-2 text-slate-500">{correctText}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }
      case "OPEN_ENDED": {
        const text = String(response.text ?? "");
        const rubric = (data.rubric ?? []) as { id: string; criterion: string; points: number }[];
        return (
          <div className="mt-3 space-y-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 text-sm leading-6 text-slate-700 whitespace-pre-wrap">
              {text || <span className="text-slate-400">No answer submitted.</span>}
            </div>
            {rubric.length > 0 && (
              <div className="rounded-xl border border-slate-200 px-3.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rubric</p>
                <ul className="mt-1.5 space-y-1 text-[12px] text-slate-600">
                  {rubric.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2">
                      <span>{item.criterion}</span>
                      <span className="shrink-0 font-semibold text-slate-400">{item.points} pt</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {showKey && data.sampleAnswer && (
              <details className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5">
                <summary className="cursor-pointer text-[11px] font-semibold text-emerald-800">
                  Sample answer
                </summary>
                <div className="mt-2 text-xs text-emerald-900">
                  <MathText content={String(data.sampleAnswer)} />
                </div>
              </details>
            )}
          </div>
        );
      }
      case "CASE_STUDY": {
        const subs = (data.subQuestions ?? []) as SubQuestion[];
        const nestedResponses = (response.sub as Record<string, Record<string, unknown>>) ?? {};
        return (
          <div className="mt-3 space-y-3">
            {subs.map((sub, i) => (
              <div key={sub.id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Part {i + 1} · {sub.type.replaceAll("_", " ").toLowerCase()} · {sub.points} pt
                </p>
                <div className="text-sm text-slate-700">
                  <MathText content={sub.prompt || "_No prompt_"} />
                </div>
                <QuestionReview
                  nested
                  showKey={showKey}
                  question={{
                    type: sub.type,
                    prompt: "",
                    points: sub.points,
                    data: JSON.stringify(sub.data),
                  }}
                  response={nestedResponses[sub.id] ?? {}}
                />
              </div>
            ))}
          </div>
        );
      }
      default:
        return (
          <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[11px] text-slate-100">
            {JSON.stringify(response, null, 2)}
          </pre>
        );
    }
  })();

  if (nested) {
    return <div className="mt-1.5">{body}</div>;
  }

  return (
    <article className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {index !== undefined && (
            <span className="flex size-6 items-center justify-center rounded-lg bg-white text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
              {index + 1}
            </span>
          )}
          <span className={`badge ${meta.badge}`}>{meta.label}</span>
          <span className="text-[10px] font-semibold text-slate-400">
            {question.points} pt{question.points === 1 ? "" : "s"}
          </span>
          {score !== undefined && (
            <span
              className={cn(
                "badge",
                score === null
                  ? "bg-amber-50 text-amber-700"
                  : score >= question.points
                    ? "bg-emerald-50 text-emerald-700"
                    : score > 0
                      ? "bg-sky-50 text-sky-700"
                      : "bg-rose-50 text-rose-700"
              )}
            >
              {score === null ? "Needs grading" : `${Math.round(score * 100) / 100} / ${question.points}`}
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        {question.prompt && <MathText content={question.prompt} />}
        {question.mediaUrl && (
          <MediaBlock url={question.mediaUrl} />
        )}
        {body}
        {feedback && (
          <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/60 px-3.5 py-2.5 text-xs text-brand-800">
            <span className="font-bold uppercase">Feedback</span>
            <p className="mt-0.5 leading-5 whitespace-pre-wrap">{feedback}</p>
          </div>
        )}
        {showKey && question.explanation && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
            <span className="font-bold uppercase text-slate-400">Explanation</span>
            <div className="mt-0.5">
              <MathText content={question.explanation} />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function MediaBlock({ url }: { url: string }) {
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|&|$)/i.test(url)) {
    return <video src={url} controls className="mt-3 max-h-72 w-full rounded-xl border border-slate-200" />;
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
      <img src={url} alt="Question media" className="mt-3 max-h-72 rounded-xl border border-slate-200 object-contain" />
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm mt-3">
      Open attachment
    </a>
  );
}
