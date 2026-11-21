"use client";

import { useEffect, useRef } from "react";

type MarqueeProps = {
  items: string[];
  className?: string;
  speed?: number;
};

export function Marquee({ items, className = "", speed = 40 }: MarqueeProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const { gsap } = await import("gsap");
      if (cancelled || !trackRef.current) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(track, { clearProps: "all" });
        return;
      }

      const tween = gsap.to(track, {
        xPercent: -50,
        duration: speed,
        ease: "none",
        repeat: -1,
      });

      cleanup = () => tween.kill();
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [speed]);

  const renderContent = (hidden = false) => (
    <div className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={hidden || undefined}>
      {items.map((item, i) => (
        <span key={`${item}-${hidden ? "b" : "a"}-${i}`} className="inline-flex items-center gap-8 whitespace-nowrap">
          <span>{item}</span>
          <span aria-hidden className="text-brand-300">✦</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className={`overflow-hidden ${className}`} aria-label="Highlights">
      <div ref={trackRef} className="flex w-max will-change-transform">
        {renderContent(false)}
        {renderContent(true)}
      </div>
    </div>
  );
}
