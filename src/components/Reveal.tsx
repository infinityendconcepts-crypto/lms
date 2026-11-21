"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "fade-up" | "fade-down" | "fade-left" | "fade-right" | "scale" | "blur-up" | "tilt-up";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "article" | "ul";
  variant?: Variant;
  stagger?: number;
  childSelector?: string;
  duration?: number;
  once?: boolean;
};

function fromVars(variant: Variant) {
  switch (variant) {
    case "fade-down":
      return { autoAlpha: 0, y: -28 };
    case "fade-left":
      return { autoAlpha: 0, x: 40 };
    case "fade-right":
      return { autoAlpha: 0, x: -40 };
    case "scale":
      return { autoAlpha: 0, scale: 0.92, y: 16 };
    case "blur-up":
      return { autoAlpha: 0, y: 24, filter: "blur(10px)" };
    case "tilt-up":
      return { autoAlpha: 0, y: 32, rotateX: 8, transformPerspective: 900 };
    case "fade-up":
    default:
      return { autoAlpha: 0, y: 28 };
  }
}

function toVars(variant: Variant) {
  const base = { autoAlpha: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)", rotateX: 0, clearProps: "transform,filter" };
  if (variant === "blur-up") return { ...base, filter: "blur(0px)" };
  return base;
}

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
  variant = "fade-up",
  stagger = 0,
  childSelector,
  duration = 0.85,
  once = true,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const gsapMod = await import("gsap");
      const stMod = await import("gsap/ScrollTrigger");
      if (cancelled || !ref.current) return;
      const gsap = gsapMod.gsap;
      const ScrollTrigger = stMod.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const targets = childSelector ? Array.from(el.querySelectorAll(childSelector)) : [el];
      if (targets.length === 0) return;

      if (reduced) {
        gsap.set(targets, { autoAlpha: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)", rotateX: 0, clearProps: "transform,filter" });
        el.classList.add("is-visible");
        return;
      }

      const from = fromVars(variant);
      const to = toVars(variant);

      const ctx = gsap.context(() => {
        if (childSelector) {
          gsap.set(el, { autoAlpha: 1, y: 0, x: 0, scale: 1, clearProps: "transform,filter" });
        }
        gsap.fromTo(targets, from, {
          ...to,
          duration,
          delay: delay / 1000,
          stagger: stagger > 0 ? stagger : undefined,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 88%",
            once,
          },
        });
      }, el);

      cleanup = () => ctx.revert();
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [delay, variant, stagger, childSelector, duration, once]);

  return (
    <Tag ref={ref as never} className={cn("reveal", className)}>
      {children}
    </Tag>
  );
}
