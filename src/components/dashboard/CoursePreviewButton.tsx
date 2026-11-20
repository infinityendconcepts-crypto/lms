"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink } from "lucide-react";
import { OverlayModal } from "@/components/OverlayModal";

export function CoursePreviewButton({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm">
        <BookOpen className="size-3.5" /> Learner preview
      </button>
      <OverlayModal
        open={open}
        onClose={() => setOpen(false)}
        title="Learner preview"
        subtitle="The course as an enrolled learner sees it"
        size="xl"
        footer={
          <div className="flex justify-end">
            <Link
              href={`/learn/${courseId}`}
              target="_blank"
              className="btn-ghost btn-sm"
              onClick={() => setOpen(false)}
            >
              <ExternalLink className="size-3.5" /> Open full page
            </Link>
          </div>
        }
      >
        <iframe
          src={`/learn/${courseId}`}
          title="Course learner preview"
          className="h-[min(70vh,720px)] w-full rounded-xl border border-slate-200 bg-white"
        />
      </OverlayModal>
    </>
  );
}
