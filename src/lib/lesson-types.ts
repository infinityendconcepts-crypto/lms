export const LESSON_TYPES = ["TEXT", "CODE", "MATH", "VISUAL"] as const;

export type LessonType = (typeof LESSON_TYPES)[number];

export type LessonTypeMeta = {
  label: string;
  short: string;
  description: string;
  editorLabel: string;
  placeholder: string;
  urlLabel: string;
  urlHint: string;
  tone: "slate" | "sky" | "brand" | "amber";
};

export const LESSON_TYPE_META: Record<LessonType, LessonTypeMeta> = {
  TEXT: {
    label: "Text based",
    short: "Reading & notes",
    description: "A guide, article or written walkthrough with Markdown formatting and attachments.",
    editorLabel: "Lesson content",
    placeholder: "# Learning objectives\n\nExplain the key idea in your own words, then add a short example.",
    urlLabel: "Optional video or meeting URL",
    urlHint: "YouTube and Vimeo links play inline; other links open as a join button.",
    tone: "slate",
  },
  CODE: {
    label: "Coding",
    short: "Practice & projects",
    description: "A programming task linked to a coding pad where learners can write and submit code.",
    editorLabel: "Coding brief",
    placeholder:
      "# Build the explorer\n\nDescribe the goal, the inputs and what a successful solution should do.\n\n## Checks\n- [ ] The page updates when a value changes\n- [ ] The result is labelled clearly",
    urlLabel: "Reference or starter project URL",
    urlHint: "Link to documentation, a starter repository or a short demo video.",
    tone: "sky",
  },
  MATH: {
    label: "Mathematics",
    short: "Equations & proofs",
    description: "A maths lesson with LaTeX equations, worked examples and a live rendered preview.",
    editorLabel: "Mathematics content",
    placeholder:
      "# Quadratic functions\n\nA quadratic has the form $f(x)=ax^2+bx+c$.\n\n## Worked example\n\n$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$",
    urlLabel: "Optional worked-solution video",
    urlHint: "Embed a YouTube or Vimeo walkthrough, or link to a live problem-solving session.",
    tone: "brand",
  },
  VISUAL: {
    label: "Visual / design",
    short: "Graphics & portfolios",
    description:
      "A visual brief for graphic design, diagrams or portfolios, with reference links and uploadable assets.",
    editorLabel: "Design brief",
    placeholder:
      "# Visual brief\n\nDescribe the outcome, audience and constraints. Ask learners to upload or link their finished work.\n\n## Deliverable\n- Format: poster / diagram / prototype\n- Include a short explanation of your choices",
    urlLabel: "Inspiration or reference URL",
    urlHint: "Link to a moodboard, example, design system or screen recording.",
    tone: "amber",
  },
};

export function isLessonType(value: unknown): value is LessonType {
  return typeof value === "string" && (LESSON_TYPES as readonly string[]).includes(value);
}

export function lessonTypeFrom(value?: string | null): LessonType {
  return isLessonType(value) ? value : "TEXT";
}

export function lessonTypeLabel(value?: string | null) {
  return LESSON_TYPE_META[lessonTypeFrom(value)].label;
}

export function lessonTypeShort(value?: string | null) {
  return LESSON_TYPE_META[lessonTypeFrom(value)].short;
}

export function lessonTypeTone(value?: string | null) {
  return LESSON_TYPE_META[lessonTypeFrom(value)].tone;
}
