"use client";

import { useEffect, useRef } from "react";

const SLIDES = [
  "/hero-background.jpg",
  "/hero-slide-2.jpg",
  "/hero-slide-3.jpg",
];

export function HeroSlideshow() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const slides = Array.from(root.querySelectorAll<HTMLElement>("[data-slide]"));
    if (slides.length === 0) return;

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const { gsap } = await import("gsap");
      if (cancelled || !rootRef.current) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(slides, { opacity: 0 });
        gsap.set(slides[0], { opacity: 1 });
        return;
      }

      gsap.set(slides, { opacity: 0, scale: 1.04 });
      gsap.set(slides[0], { opacity: 1, scale: 1 });

      const tl = gsap.timeline({ repeat: -1 });
      slides.forEach((slide, i) => {
        const next = slides[(i + 1) % slides.length];
        const start = i * 5;
        tl.to(slide, { scale: 1.04, duration: 5, ease: "none" }, start)
          .to(next, { opacity: 1, scale: 1, duration: 1.2, ease: "power2.inOut" }, start + 3.8)
          .to(slide, { opacity: 0, duration: 1.2, ease: "power2.inOut" }, start + 3.8)
          .set(slide, { scale: 1.04 }, start + 5);
      });

      cleanup = () => tl.kill();
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
      {SLIDES.map((src, i) => (
        <div
          key={src}
          data-slide
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${src}')`, opacity: i === 0 ? 1 : 0 }}
        />
      ))}
    </div>
  );
}
