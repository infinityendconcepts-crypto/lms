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
}: {
  content?: string;
  contentBlocks?: string | null;
  meetingUrl?: string | null;
  codePadId?: string | null;
  codePads?: { id: string; title: string; language: string }[];
  courseId: string;
  lessonId: string;
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
    />
  );
}
