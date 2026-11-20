"use client";

import { RichTextEditor } from "@/components/RichTextEditor";

export function LessonContentFields({
  content = "",
  meetingUrl = "",
  codePadId = null,
  codePads = [],
}: {
  content?: string;
  meetingUrl?: string | null;
  codePadId?: string | null;
  codePads?: { id: string; title: string; language: string }[];
}) {
  return (
    <div className="space-y-4">
      <RichTextEditor
        name="content"
        label="Lesson content"
        defaultValue={content}
        placeholder="# Learning objectives\n\nExplain the key idea, add a worked example and finish with a short practice task."
        rows={16}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="lesson-link">
            Optional video or lesson link
          </label>
          <input
            id="lesson-link"
            name="meetingUrl"
            type="url"
            defaultValue={meetingUrl ?? ""}
            placeholder="https://youtube.com/watch?v=…"
            className="input"
          />
          <p className="mt-1 text-[9px] leading-3 text-slate-400">
            YouTube and Vimeo links play inline; other links open as a join button.
          </p>
        </div>

        {(codePads.length > 0 || codePadId) && (
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
              Link a pad from the course’s Coding pads tab so learners can submit code.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
