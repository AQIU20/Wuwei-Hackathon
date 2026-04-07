"use client";

import { motion } from "framer-motion";

type Cube = {
  x: string;
  y: string;
  size: number;
  color: string;
  delay: number;
  duration: number;
  rotateStart: number;
};

const cubes: Cube[] = [
  { x: "12%", y: "18%", size: 48, color: "#ff6c37", delay: 0, duration: 6, rotateStart: 15 },
  { x: "78%", y: "12%", size: 36, color: "#ffffff", delay: 0.8, duration: 7, rotateStart: -20 },
  { x: "25%", y: "65%", size: 56, color: "#ff9a6c", delay: 1.2, duration: 8, rotateStart: 30 },
  { x: "70%", y: "55%", size: 40, color: "#ffffff", delay: 0.4, duration: 5.5, rotateStart: -10 },
  { x: "50%", y: "8%", size: 32, color: "#ff6c37", delay: 1.6, duration: 9, rotateStart: 45 },
  { x: "8%", y: "42%", size: 44, color: "#d4d4d8", delay: 0.6, duration: 6.5, rotateStart: -35 },
  { x: "88%", y: "38%", size: 28, color: "#ff6c37", delay: 1, duration: 7.5, rotateStart: 25 },
  { x: "40%", y: "78%", size: 52, color: "#d4d4d8", delay: 1.4, duration: 8.5, rotateStart: -15 },
];

function CSSCube({ cube }: { cube: Cube }) {
  const half = cube.size / 2;

  const faces = [
    { transform: `translateZ(${half}px)` },
    { transform: `rotateY(180deg) translateZ(${half}px)` },
    { transform: `rotateY(90deg) translateZ(${half}px)` },
    { transform: `rotateY(-90deg) translateZ(${half}px)` },
    { transform: `rotateX(90deg) translateZ(${half}px)` },
    { transform: `rotateX(-90deg) translateZ(${half}px)` },
  ];

  return (
    <motion.div
      className="absolute"
      style={{ left: cube.x, top: cube.y, perspective: 600 }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: cube.delay, duration: 0.8, ease: "easeOut" }}
    >
      <motion.div
        style={{
          width: cube.size,
          height: cube.size,
          transformStyle: "preserve-3d",
        }}
        animate={{
          rotateX: [cube.rotateStart, cube.rotateStart + 360],
          rotateY: [cube.rotateStart, cube.rotateStart + 360],
          y: [0, -18, 0],
        }}
        transition={{
          rotateX: { duration: cube.duration * 2, repeat: Infinity, ease: "linear" },
          rotateY: { duration: cube.duration, repeat: Infinity, ease: "linear" },
          y: { duration: cube.duration, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        {faces.map((f, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-sm border border-white/10"
            style={{
              transform: f.transform,
              backfaceVisibility: "visible",
              background: `color-mix(in srgb, ${cube.color} 25%, transparent)`,
              boxShadow: `inset 0 0 20px color-mix(in srgb, ${cube.color} 15%, transparent)`,
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}

export function FloatingBlocks() {
  return (
    <div className="pointer-events-none absolute inset-0 h-[900px] overflow-hidden" aria-hidden>
      {cubes.map((c, i) => (
        <CSSCube key={i} cube={c} />
      ))}
    </div>
  );
}
