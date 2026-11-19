export const LESSON_TYPES = ["TEXT", "CODE", "MATH", "VISUAL", "DATA_SCIENCE"] as const;

export type LessonType = (typeof LESSON_TYPES)[number];

export type LessonTool = {
  name: string;
  description: string;
  url: string;
};

export type LessonTypeMeta = {
  label: string;
  short: string;
  description: string;
  editorLabel: string;
  placeholder: string;
  urlLabel: string;
  urlHint: string;
  tone: "slate" | "sky" | "brand" | "amber" | "green";
  toolkitHint: string;
  tools: LessonTool[];
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
    toolkitHint: "Draft cleanly, structure the reading and polish the final copy.",
    tools: [
      {
        name: "Markdown Guide",
        description: "Write clean headings, lists and links.",
        url: "https://www.markdownguide.org/basic-syntax/",
      },
      {
        name: "Notion",
        description: "Outline objectives and draft notes.",
        url: "https://www.notion.so/",
      },
      {
        name: "Grammarly",
        description: "Check clarity and tone before publishing.",
        url: "https://www.grammarly.com/",
      },
    ],
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
    toolkitHint: "Use references and sandboxes alongside the built-in pad to turn a brief into working code.",
    tools: [
      {
        name: "MDN Web Docs",
        description: "Reliable language and browser reference.",
        url: "https://developer.mozilla.org/",
      },
      {
        name: "Replit",
        description: "Browser workspace for quick prototypes.",
        url: "https://replit.com/",
      },
      {
        name: "StackBlitz",
        description: "Instant web project previews.",
        url: "https://stackblitz.com/",
      },
    ],
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
    toolkitHint: "Render notation, graph relationships and verify symbolic steps.",
    tools: [
      {
        name: "KaTeX",
        description: "Fast LaTeX rendering used in lessons.",
        url: "https://katex.org/",
      },
      {
        name: "Desmos",
        description: "Graph functions and check transformations.",
        url: "https://www.desmos.com/calculator",
      },
      {
        name: "Wolfram Alpha",
        description: "Verify algebra and symbolic results.",
        url: "https://www.wolframalpha.com/",
      },
    ],
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
    toolkitHint: "Collect inspiration, build layouts and export polished design assets.",
    tools: [
      {
        name: "Figma",
        description: "Collaborative interface and layout design.",
        url: "https://www.figma.com/",
      },
      {
        name: "Canva",
        description: "Posters, slides and social graphics.",
        url: "https://www.canva.com/",
      },
      {
        name: "Behance",
        description: "Reference work and visual inspiration.",
        url: "https://www.behance.net/",
      },
    ],
  },
  DATA_SCIENCE: {
    label: "Data science",
    short: "Notebooks & models",
    description:
      "A notebook-driven lesson with datasets, exploratory analysis, visualisations and a short written conclusion.",
    editorLabel: "Data science brief",
    placeholder:
      "# Data investigation\n\nLoad the dataset, clean the columns and answer the guiding question.\n\n## Deliverable\n- One chart with a clear caption\n- The model or summary statistic you calculated\n- A short conclusion with one limitation",
    urlLabel: "Notebook or dataset URL",
    urlHint: "Link to Google Colab, Jupyter, Kaggle or the dataset learners should analyse.",
    tone: "green",
    toolkitHint: "Run notebooks, find datasets and turn analysis into clear visual evidence.",
    tools: [
      {
        name: "Google Colab",
        description: "Browser notebooks with Python and GPUs.",
        url: "https://colab.research.google.com/",
      },
      {
        name: "JupyterLab",
        description: "Local notebook workspace for analysis.",
        url: "https://jupyter.org/",
      },
      {
        name: "Kaggle Datasets",
        description: "Find datasets and example notebooks.",
        url: "https://www.kaggle.com/datasets",
      },
    ],
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
