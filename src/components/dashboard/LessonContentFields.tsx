"use client";

import { LessonBlockBuilder } from "@/components/dashboard/LessonBlockBuilder";

export function LessonContentFields({
  content = "",
  contentBlocks,
  meetingUrl = "",
  codePadId = null,
  codePads = [],
  courseId,
  lessonId,
  attachments = [],
  providerOptions = [],
}: {
  content?: string;
  contentBlocks?: string | null;
  meetingUrl?: string | null;
  codePadId?: string | null;
  codePads?: { id: string; title: string; language: string; published: boolean }[];
  courseId: string;
  lessonId: string;
  attachments?: { id: string; name: string; kind: string }[];
  providerOptions?: { value: string; label: string; detail?: string }[];
}) {
  return (
    <LessonBlockBuilder
      content={content}
      contentBlocks={contentBlocks}
      meetingUrl={meetingUrl}
      codePadId={codePadId}
      codePads={codePads}
      courseId={courseId}
      lessonId={lessonId}
      attachments={attachments}
      providerOptions={providerOptions}
    />
  );
}
