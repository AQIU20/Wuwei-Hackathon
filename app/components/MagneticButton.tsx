"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { ComponentProps, ReactNode } from "react";
import { useRef } from "react";
import { cn } from "@/lib/cn";

type Props = {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "ghost";
} & Omit<ComponentProps<typeof motion.button>, "children" | "ref">;

export function MagneticButton({
  children,
  className,
  variant = "primary",
  ...props
}: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  const glowX = useTransform(springX, (v) => `${50 + v * 1.8}%`);
  const glowY = useTransform(springY, (v) => `${50 + v * 1.8}%`);

  function handleMove(e: React.MouseEvent<HTMLButtonElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = e.clientX - rect.left - rect.width / 2;
    const relY = e.clientY - rect.top - rect.height / 2;
    x.set(relX * 0.25);
    y.set(relY * 0.25);
  }

  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ x: springX, y: springY }}
      whileTap={{ scale: 0.96 }}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 font-display text-sm font-medium tracking-wide transition-colors duration-300",
        variant === "primary"
          ? "text-black"
          : "text-white/90 hover:text-white",
        className
      )}
      {...props}
    >
      {variant === "primary" ? (
        <>
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(120% 120% at ${glowX.get()} ${glowY.get()}, #ffffff 0%, #ffd4bd 40%, #ff6c37 90%)`,
            }}
          />
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-80"
            style={{
              background:
                "linear-gradient(135deg, #ff6c37 0%, #ff9a6c 50%, #ff6c37 100%)",
            }}
          />
        </>
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border border-white/15 bg-white/[0.03] backdrop-blur-md transition-all duration-300 group-hover:border-white/30 group-hover:bg-white/[0.06]"
        />
      )}
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </motion.button>
  );
}
