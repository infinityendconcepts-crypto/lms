"use client";

import { useEffect } from "react";

export function HeroEntrance() {
  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    const revealFallback = () => {
      document.querySelectorAll<HTMLElement>("[data-hero]").forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
    };
    const fallbackTimer = window.setTimeout(revealFallback, 1500);

    (async () => {
      try {
        const { gsap } = await import("gsap");
        if (cancelled) return;

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          window.clearTimeout(fallbackTimer);
          gsap.set("[data-hero]", { opacity: 1, y: 0, scale: 1, clearProps: "transform" });
          return;
        }

        const ctx = gsap.context(() => {
          const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
          tl.fromTo("[data-hero='badge']", { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.7 })
            .fromTo("[data-hero='title']", { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.8 }, 0.1)
            .fromTo("[data-hero='copy']", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.75 }, 0.2)
            .fromTo("[data-hero='cta']", { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.3)
            .fromTo("[data-hero='trust']", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.65 }, 0.4)
            .fromTo(
              "[data-hero='visual']",
              { autoAlpha: 0, y: 24, scale: 0.985 },
              { autoAlpha: 1, y: 0, scale: 1, duration: 0.9, clearProps: "transform" },
              0.2
            );
        });

        window.clearTimeout(fallbackTimer);
        cleanup = () => ctx.revert();
      } catch {
        revealFallback();
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      cleanup();
    };
  }, []);

  return null;
}
