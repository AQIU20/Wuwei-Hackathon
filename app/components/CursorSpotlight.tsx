"use client";

import { useEffect, useRef } from "react";

/**
 * Global cursor spotlight — fixed overlay that follows the mouse.
 * Uses requestAnimationFrame + CSS variables so we don't re-render React.
 */
export function CursorSpotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 3;

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          el.style.setProperty("--mx", `${tx}px`);
          el.style.setProperty("--my", `${ty}px`);
          raf = 0;
        });
      }
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[2] transition-opacity duration-500"
      style={{
        background:
          "radial-gradient(600px circle at var(--mx, 50%) var(--my, 30%), rgba(255, 108, 55, 0.07), transparent 60%)",
      }}
    />
  );
}
