"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { OverlayModal } from "@/components/OverlayModal";
import { LessonBlocks } from "@/components/LessonBlocks";
import type { LessonBlock } from "@/lib/lesson-blocks";

export function LessonPreviewButton({
  blocks,
  courseId,
  codePads,
}: {
  blocks: LessonBlock[];
  courseId: string;
  codePads: { id: string; title: string; language: string; published: boolean }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm">
        <Eye className="size-3.5" /> Preview lesson
      </button>
      <OverlayModal
        open={open}
        onClose={() => setOpen(false)}
        title="Lesson preview"
        subtitle="The block layout learners will see"
        size="lg"
      >
        <div className="mx-auto max-w-3xl space-y-4">
          <LessonBlocks blocks={blocks} courseId={courseId} codePads={codePads} teacher />
        </div>
      </OverlayModal>
    </>
  );
}
