"use client";

import { useEffect, useRef } from "react";
import { BarChart3, BookOpen, ClipboardCheck, Files, Layers, Users } from "lucide-react";

const FEATURES = [
  {
    icon: BookOpen,
    title: "Rich content authoring",
    body: "Build lessons and assessments with text, media, documents and structured content — including equations and LaTeX when you need them.",
  },
  {
    icon: Layers,
    title: "Nine question types",
    body: "Multiple choice, image-based, yes/no, case studies, open-ended with rubrics, numeric, formula, blanks and matching.",
  },
  {
    icon: Users,
    title: "Real multi-tenancy",
    body: "Every school, team and solo teacher gets an isolated workspace with its own members, roles, data and branding.",
  },
  {
    icon: ClipboardCheck,
    title: "Grading that keeps up",
    body: "Objective answers grade instantly. Case studies and long answers land in a focused manual grading queue with feedback.",
  },
  {
    icon: BarChart3,
    title: "Gradebook & analytics",
    body: "Per-student, per-assessment results, pass rates, insights and exports. See who needs help before it’s too late.",
  },
  {
    icon: Files,
    title: "Secure course materials",
    body: "Attach PDFs, slides, spreadsheets, images, audio and video to lessons. Private, access-controlled delivery for learners.",
  },
];

export function FeaturesCarousel() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const tweenRef = useRef<{ pause: () => void; resume: () => void; kill: () => void } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const { gsap } = await import("gsap");
      if (cancelled) return;

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        gsap.set(root, { opacity: 1, y: 0, clearProps: "visibility" });
        gsap.set(track, { xPercent: 0 });
        return;
      }

      const ctx = gsap.context(() => {
        gsap.fromTo(
          root,
          { autoAlpha: 0, y: 30 },
          { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", clearProps: "transform" }
        );

        // Continuous smooth slide to the right:
        // Two identical sets; animate from -50% (start of second set aligned) to 0%.
        gsap.set(track, { xPercent: -50 });
        const tween = gsap.to(track, {
          xPercent: 0,
          duration: 28,
          ease: "none",
          repeat: -1,
        });
        tweenRef.current = tween;
      }, root);

      cleanup = () => ctx.revert();
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  const items = [...FEATURES, ...FEATURES];

  return (
    <div
      ref={rootRef}
      className="mt-10 opacity-0"
      onMouseEnter={() => tweenRef.current?.pause()}
      onMouseLeave={() => tweenRef.current?.resume()}
      onFocusCapture={() => tweenRef.current?.pause()}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) tweenRef.current?.resume();
      }}
    >
      <div className="overflow-hidden">
        <div ref={trackRef} className="flex w-max will-change-transform">
          {items.map((f, i) => (
            <div
              key={`${f.title}-${i}`}
              className="w-[85vw] max-w-[340px] shrink-0 px-2 sm:w-[45vw] sm:max-w-none lg:w-[23vw] xl:w-[280px]"
            >
              <div className="card h-full p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-sm font-bold text-slate-900">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-slate-600">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
