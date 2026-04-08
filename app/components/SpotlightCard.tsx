"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  children: ReactNode;
  className?: string;
};

/** Glass card with a pointer-tracked radial spotlight and a subtle border glow. */
export function SpotlightCard({ children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--px", `${e.clientX - rect.left}px`);
    el.style.setProperty("--py", `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-black/10 bg-black/[0.03] p-6 transition-colors duration-500 hover:border-black/25",
        "before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-500 before:content-[''] hover:before:opacity-100",
        className
      )}
      style={{
        backgroundImage:
          "radial-gradient(350px circle at var(--px, -100px) var(--py, -100px), rgba(255, 108, 55, 0.12), transparent 45%)",
      }}
    >
      <div className="pointer-events-none absolute inset-px rounded-[15px] bg-gradient-to-b from-black/5 to-transparent opacity-60" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
