"use client";

import { useState } from "react";
import { BookOpen, Code2, Database, Palette, Sigma } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { LessonTypeToolkit } from "@/components/LessonTypeToolkit";
import {
  LESSON_TYPES,
  LESSON_TYPE_META,
  lessonTypeFrom,
  type LessonType,
} from "@/lib/lesson-types";
import { cn } from "@/lib/utils";

const TYPE_ICONS = {
  TEXT: BookOpen,
  CODE: Code2,
  MATH: Sigma,
  VISUAL: Palette,
  DATA_SCIENCE: Database,
} as const;

export function LessonTypeFields({
  initialType = "TEXT",
  compact = false,
  content = "",
  meetingUrl = "",
  codePadId = null,
  codePads = [],
}: {
  initialType?: string | null;
  compact?: boolean;
  content?: string;
  meetingUrl?: string | null;
  codePadId?: string | null;
  codePads?: { id: string; title: string; language: string }[];
}) {
  const [type, setType] = useState<LessonType>(lessonTypeFrom(initialType));
  const meta = LESSON_TYPE_META[type];

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="label">Lesson type</legend>
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          {LESSON_TYPES.map((option) => {
            const optionMeta = LESSON_TYPE_META[option];
            const Icon = TYPE_ICONS[option];
            const selected = option === type;
            return (
              <label
                key={option}
                className={cn(
                  "cursor-pointer rounded-xl border px-3 py-2.5 transition",
                  selected
                    ? "border-brand-300 bg-brand-50 text-brand-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <input
                  type="radio"
                  name="lessonType"
                  value={option}
                  checked={selected}
                  onChange={() => setType(option)}
                  className="sr-only"
                />
                <span className="flex items-start gap-2">
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      selected ? "text-brand-600" : "text-slate-400"
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">{optionMeta.label}</span>
                    <span className="block text-[9px] leading-3 text-slate-400">
                      {optionMeta.short}
                    </span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">{meta.description}</p>
        {compact && (
          <p className="mt-1 text-[9px] leading-3 text-slate-400">
            Tools: {meta.tools.map((tool) => tool.name).join(" · ")}
          </p>
        )}
      </fieldset>

      {!compact && (
        <>
          <LessonTypeToolkit type={type} />
          <RichTextEditor
            name="content"
            label={meta.editorLabel}
            defaultValue={content}
            placeholder={meta.placeholder}
            rows={16}
            toolbar={type === "MATH" || type === "TEXT" || type === "DATA_SCIENCE"}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="lesson-meeting">
                {meta.urlLabel}
              </label>
              <input
                id="lesson-meeting"
                name="meetingUrl"
                type="url"
                defaultValue={meetingUrl ?? ""}
                placeholder={
                  type === "DATA_SCIENCE"
                    ? "https://colab.research.google.com/…"
                    : type === "VISUAL"
                      ? "https://behance.net/gallery/…"
                      : type === "CODE"
                        ? "https://developer.mozilla.org/…"
                        : "https://youtube.com/watch?v=…"
                }
                className="input"
              />
              <p className="mt-1 text-[9px] leading-3 text-slate-400">{meta.urlHint}</p>
            </div>

            {type === "CODE" && (
              <div>
                <label className="label" htmlFor="lesson-code-pad">
                  Coding pad
                </label>
                <select
                  id="lesson-code-pad"
                  name="codePadId"
                  defaultValue={codePadId ?? ""}
                  className="select"
                >
                  <option value="">No coding pad linked</option>
                  {codePads.map((pad) => (
                    <option key={pad.id} value={pad.id}>
                      {pad.title} · {pad.language}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[9px] leading-3 text-slate-400">
                  Create pads in the course’s Coding pads tab, then link one here for learners to
                  submit code.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
