/**
 * Question engine — types, factories and pure grading logic.
 * This module is imported by both server and client code.
 */

export type QuestionType =
  | "MULTIPLE_CHOICE"
  | "IMAGE_BASED"
  | "YES_NO"
  | "CASE_STUDY"
  | "OPEN_ENDED"
  | "NUMERIC"
  | "FORMULA"
  | "FILL_BLANK"
  | "MATCHING";

export type Option = { id: string; text: string; imageUrl?: string };

export type QuestionData =
  | { multiple: boolean; partialCredit?: boolean; options: Option[]; correct: string[] }
  | { correct: boolean }
  | { passage: string; mediaUrl?: string; subQuestions: SubQuestion[] }
  | { rubric: RubricItem[]; minWords?: number; maxWords?: number; sampleAnswer?: string }
  | { answer: number; tolerance?: number; units?: string }
  | { answer: string; alternatives?: string[] }
  | { blanks: { id: string; accepted: string[] }[]; caseSensitive?: boolean }
  | { left: Option[]; right: Option[]; pairs: Record<string, string> }
  | Record<string, unknown>;

/**
 * Flat, optional view of every field used by question editors and renderers.
 * Payloads vary by type, so callers switch on `type` and read only the keys
 * that apply. The index signature also lets builders patch arbitrary keys.
 */
export type QuestionDataShape = {
  multiple?: boolean;
  partialCredit?: boolean;
  options?: Option[];
  correct?: string[] | boolean;
  answer?: number | string;
  tolerance?: number;
  units?: string;
  alternatives?: string[];
  accepted?: string[];
  blanks?: { id: string; accepted: string[] }[];
  caseSensitive?: boolean;
  left?: Option[];
  right?: Option[];
  pairs?: Record<string, string>;
  passage?: string;
  mediaUrl?: string;
  subQuestions?: SubQuestion[];
  rubric?: RubricItem[];
  minWords?: number;
  maxWords?: number;
  sampleAnswer?: string;
  [key: string]: unknown;
};

export type RubricItem = { id: string; criterion: string; points: number };

export type SubQuestion = {
  id: string;
  type: "MULTIPLE_CHOICE" | "YES_NO" | "OPEN_ENDED" | "SHORT_TEXT" | "NUMERIC";
  prompt: string;
  points: number;
  data: QuestionData;
  explanation?: string;
};

export type AssessmentQuestion = {
  id: string;
  type: string;
  prompt: string;
  mediaUrl: string | null;
  points: number;
  data: string;
  explanation?: string | null;
};

export const QUESTION_META: Record<
  QuestionType,
  { label: string; short: string; description: string; auto: boolean; badge: string }
> = {
  MULTIPLE_CHOICE: {
    label: "Multiple choice",
    short: "MCQ",
    description: "One or many correct options, optional partial credit.",
    auto: true,
    badge: "bg-indigo-50 text-indigo-700",
  },
  IMAGE_BASED: {
    label: "Image based",
    short: "Image",
    description: "Attach a diagram or photo and ask a question about it.",
    auto: true,
    badge: "bg-sky-50 text-sky-700",
  },
  YES_NO: {
    label: "Yes / No",
    short: "Y/N",
    description: "A single true/false style decision.",
    auto: true,
    badge: "bg-emerald-50 text-emerald-700",
  },
  CASE_STUDY: {
    label: "Case study",
    short: "Case",
    description: "A rich scenario with nested sub-questions of mixed types.",
    auto: false,
    badge: "bg-amber-50 text-amber-700",
  },
  OPEN_ENDED: {
    label: "Open ended",
    short: "Open",
    description: "Long-form answer graded with a rubric or manually.",
    auto: false,
    badge: "bg-rose-50 text-rose-700",
  },
  NUMERIC: {
    label: "Numeric",
    short: "Number",
    description: "Auto-graded number with tolerance and units.",
    auto: true,
    badge: "bg-violet-50 text-violet-700",
  },
  FORMULA: {
    label: "Formula (LaTeX)",
    short: "LaTeX",
    description: "Student enters math; accepted expressions graded automatically.",
    auto: true,
    badge: "bg-fuchsia-50 text-fuchsia-700",
  },
  FILL_BLANK: {
    label: "Fill in the blanks",
    short: "Blanks",
    description: "Several inline blanks with multiple accepted answers.",
    auto: true,
    badge: "bg-cyan-50 text-cyan-700",
  },
  MATCHING: {
    label: "Matching",
    short: "Match",
    description: "Connect items from two columns.",
    auto: true,
    badge: "bg-teal-50 text-teal-700",
  },
};

export const QUESTION_TYPE_LIST = Object.keys(QUESTION_META) as QuestionType[];

export const uid = () => Math.random().toString(36).slice(2, 10);

export function emptyData(type: QuestionType, prompt = ""): QuestionData {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return {
        multiple: false,
        partialCredit: false,
        options: [
          { id: uid(), text: "" },
          { id: uid(), text: "" },
          { id: uid(), text: "" },
          { id: uid(), text: "" },
        ],
        correct: [],
      };
    case "IMAGE_BASED":
      return {
        multiple: false,
        options: [
          { id: uid(), text: "" },
          { id: uid(), text: "" },
          { id: uid(), text: "" },
        ],
        correct: [],
      };
    case "YES_NO":
      return { correct: true };
    case "CASE_STUDY":
      return {
        passage: prompt,
        subQuestions: [
          {
            id: uid(),
            type: "MULTIPLE_CHOICE",
            prompt: "Sub-question 1",
            points: 1,
            data: {
              multiple: false,
              options: [
                { id: uid(), text: "" },
                { id: uid(), text: "" },
              ],
              correct: [],
            },
          },
        ],
      };
    case "OPEN_ENDED":
      return { rubric: [{ id: uid(), criterion: "Clear reasoning", points: 2 }] };
    case "NUMERIC":
      return { answer: 0, tolerance: 0.001 };
    case "FORMULA":
      return { answer: "", alternatives: [] };
    case "FILL_BLANK":
      return {
        blanks: [
          { id: uid(), accepted: [""] },
          { id: uid(), accepted: [""] },
        ],
      };
    case "MATCHING":
      return { left: [], right: [], pairs: {} };
    default:
      return {};
  }
}

/** Parse stored JSON defensively, always returning an object. */
export function parseData<T = QuestionData>(raw: string | null | undefined): T {
  if (!raw) return {} as T;
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object" ? parsed : {}) as T;
  } catch {
    return {} as T;
  }
}

// ── Grading ────────────────────────────────────────────────────────────────

export function normalizeLatex(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\\left|\\right/g, "")
    .replace(/\\dfrac|\\tfrac/g, "\\frac")
    .replace(/\\cdot|\\times/g, "*")
    .replace(/\\pi/g, "pi")
    .replace(/\\,|\\;|\\!|\\ /g, "")
    .replace(/[{}()\s]/g, "")
    .replace(/^\+/, "");
}

export type GradeResult = {
  score: number | null;
  max: number;
  needsManual: boolean;
  correct?: boolean;
};

const ZERO = (max: number): GradeResult => ({ score: 0, max, needsManual: false, correct: false });

export function isEmptyResponse(type: string, response: Record<string, unknown>): boolean {
  switch (type) {
    case "MULTIPLE_CHOICE":
    case "IMAGE_BASED":
      return !Array.isArray(response.selected) || response.selected.length === 0;
    case "YES_NO":
      return typeof response.value !== "boolean";
    case "OPEN_ENDED":
      return typeof response.text !== "string" || response.text.trim() === "";
    case "NUMERIC":
    case "FORMULA":
      return response.value === undefined || String(response.value).trim() === "";
    case "FILL_BLANK": {
      const values = response.values as Record<string, string> | undefined;
      return !values || Object.values(values).every((v) => !String(v ?? "").trim());
    }
    case "MATCHING": {
      const pairs = response.pairs as Record<string, string> | undefined;
      return !pairs || Object.keys(pairs).length === 0;
    }
    case "CASE_STUDY": {
      const sub = response.sub as Record<string, unknown> | undefined;
      return !sub || Object.keys(sub).length === 0;
    }
    default:
      return Object.keys(response).length === 0;
  }
}

export function gradeQuestion(
  question: Pick<AssessmentQuestion, "type" | "points" | "data">,
  response: Record<string, unknown>
): GradeResult {
  const max = question.points;
  if (isEmptyResponse(question.type, response)) return ZERO(max);

  switch (question.type) {
    case "MULTIPLE_CHOICE":
    case "IMAGE_BASED": {
      const data = parseData<{
        options: Option[];
        correct: string[];
        multiple?: boolean;
        partialCredit?: boolean;
      }>(question.data);
      const selected = (response.selected as string[]) ?? [];
      const correct = data.correct ?? [];
      if (correct.length === 0) return { score: 0, max, needsManual: false, correct: false };
      const hits = selected.filter((s) => correct.includes(s)).length;
      const misses = selected.filter((s) => !correct.includes(s)).length;
      if (!data.multiple) {
        const isCorrect = selected.length === 1 && correct.includes(selected[0]);
        return { score: isCorrect ? max : 0, max, needsManual: false, correct: isCorrect };
      }
      if (data.partialCredit) {
        const ratio = Math.max(0, (hits - misses) / correct.length);
        return {
          score: Math.round(ratio * max * 100) / 100,
          max,
          needsManual: false,
          correct: hits === correct.length && misses === 0,
        };
      }
      const isCorrect = hits === correct.length && misses === 0;
      return { score: isCorrect ? max : 0, max, needsManual: false, correct: isCorrect };
    }

    case "YES_NO": {
      const data = parseData<{ correct: boolean }>(question.data);
      const isCorrect = response.value === data.correct;
      return { score: isCorrect ? max : 0, max, needsManual: false, correct: isCorrect };
    }

    case "NUMERIC": {
      const data = parseData<{ answer: number; tolerance?: number }>(question.data);
      const value = Number(response.value);
      if (!Number.isFinite(value)) return ZERO(max);
      const tolerance = Math.abs(data.tolerance ?? 0.001);
      const isCorrect = Math.abs(value - data.answer) <= tolerance + 1e-9;
      return { score: isCorrect ? max : 0, max, needsManual: false, correct: isCorrect };
    }

    case "FORMULA": {
      const data = parseData<{ answer: string; alternatives?: string[] }>(question.data);
      const accepted = [data.answer, ...(data.alternatives ?? [])]
        .filter(Boolean)
        .map(normalizeLatex);
      const submitted = normalizeLatex(String(response.value ?? ""));
      const isCorrect = submitted.length > 0 && accepted.includes(submitted);
      return { score: isCorrect ? max : 0, max, needsManual: false, correct: isCorrect };
    }

    case "FILL_BLANK": {
      const data = parseData<{
        blanks: { id: string; accepted: string[] }[];
        caseSensitive?: boolean;
      }>(question.data);
      const values = (response.values as Record<string, string>) ?? {};
      const blanks = data.blanks ?? [];
      if (blanks.length === 0) return { score: 0, max, needsManual: false, correct: false };
      let hits = 0;
      for (const blank of blanks) {
        const submitted = String(values[blank.id] ?? "").trim();
        const accepted = (blank.accepted ?? []).map((a) =>
          data.caseSensitive ? a.trim() : a.trim().toLowerCase()
        );
        if (submitted && accepted.includes(data.caseSensitive ? submitted : submitted.toLowerCase()))
          hits++;
      }
      const ratio = hits / blanks.length;
      return {
        score: Math.round(ratio * max * 100) / 100,
        max,
        needsManual: false,
        correct: hits === blanks.length,
      };
    }

    case "MATCHING": {
      const data = parseData<{ left: Option[]; right: Option[]; pairs: Record<string, string> }>(
        question.data
      );
      const submitted = (response.pairs as Record<string, string>) ?? {};
      const total = Object.keys(data.pairs ?? {}).length;
      if (total === 0) return { score: 0, max, needsManual: false, correct: false };
      const hits = Object.entries(data.pairs).filter(([l, r]) => submitted[l] === r).length;
      return {
        score: Math.round((hits / total) * max * 100) / 100,
        max,
        needsManual: false,
        correct: hits === total,
      };
    }

    case "OPEN_ENDED":
      return { score: null, max, needsManual: true };

    case "CASE_STUDY": {
      const data = parseData<{ subQuestions: SubQuestion[] }>(question.data);
      const sub = (response.sub as Record<string, unknown>) ?? {};
      const subs = data.subQuestions ?? [];
      if (subs.length === 0) return { score: 0, max, needsManual: false, correct: false };
      let total = 0;
      let manual = false;
      for (const sq of subs) {
        const r = (sub[sq.id] as Record<string, unknown>) ?? {};
        const g = gradeSubQuestion(sq, r);
        if (g.needsManual) manual = true;
        total += g.score ?? 0;
      }
      return { score: manual ? null : Math.round(total * 100) / 100, max, needsManual: manual };
    }

    default:
      return { score: null, max, needsManual: true };
  }
}

export function gradeSubQuestion(sub: SubQuestion, response: Record<string, unknown>): GradeResult {
  if (sub.type === "SHORT_TEXT") {
    const data = sub.data as { accepted?: string[]; caseSensitive?: boolean };
    const value = String(response.value ?? "").trim();
    if (!value) return { score: 0, max: sub.points, needsManual: false, correct: false };
    const accepted = (data.accepted ?? []).map((a) =>
      data.caseSensitive ? a.trim() : a.trim().toLowerCase()
    );
    const ok = accepted.includes(data.caseSensitive ? value : value.toLowerCase());
    return { score: ok ? sub.points : 0, max: sub.points, needsManual: false, correct: ok };
  }
  return gradeQuestion(
    {
      type: sub.type,
      points: sub.points,
      data: JSON.stringify(sub.data),
    },
    response
  );
}

/** Human-readable rendered answer for review screens. */
export function formatAnswerText(type: string, response: Record<string, unknown>): string {
  switch (type) {
    case "MULTIPLE_CHOICE":
    case "IMAGE_BASED": {
      const selected = (response.selected as string[]) ?? [];
      return selected.length ? `${selected.length} option(s) selected` : "No answer";
    }
    case "YES_NO":
      return response.value === true ? "Yes" : response.value === false ? "No" : "No answer";
    case "OPEN_ENDED":
      return String(response.text ?? "") || "No answer";
    case "NUMERIC":
      return String(response.value ?? "") || "No answer";
    case "FORMULA":
      return String(response.value ?? "") || "No answer";
    default:
      return Object.keys(response).length ? "Answered" : "No answer";
  }
}
