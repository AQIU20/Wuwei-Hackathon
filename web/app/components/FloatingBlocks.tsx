"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useState } from "react";

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
  { x: "78%", y: "12%", size: 36, color: "#ffd4bd", delay: 0.8, duration: 7, rotateStart: -20 },
  { x: "25%", y: "65%", size: 56, color: "#ff9a6c", delay: 1.2, duration: 8, rotateStart: 30 },
  { x: "70%", y: "55%", size: 40, color: "#ffd4bd", delay: 0.4, duration: 5.5, rotateStart: -10 },
  { x: "50%", y: "8%", size: 32, color: "#ff6c37", delay: 1.6, duration: 9, rotateStart: 45 },
  { x: "8%", y: "42%", size: 44, color: "#d4d4d8", delay: 0.6, duration: 6.5, rotateStart: -35 },
  { x: "88%", y: "38%", size: 28, color: "#ff6c37", delay: 1, duration: 7.5, rotateStart: 25 },
  { x: "40%", y: "78%", size: 52, color: "#d4d4d8", delay: 1.4, duration: 8.5, rotateStart: -15 },
];

type Debris = {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  dx: number;
  dy: number;
  rotate: number;
};

let debrisId = 0;

function spawnDebris(x: number, y: number, color: string): Debris[] {
  const count = 16 + Math.floor(Math.random() * 10);
  const pieces: Debris[] = [];
  for (let i = 0; i < count; i++) {
    // Spread horizontally, fall naturally downward
    const spreadX = (Math.random() - 0.5) * 120;
    const fallY = 80 + Math.random() * 250; // always fall down
    pieces.push({
      id: debrisId++,
      x,
      y,
      color,
      size: 2 + Math.random() * 4,
      dx: spreadX,
      dy: fallY,
      rotate: Math.random() * 540 - 270,
    });
  }
  return pieces;
}

function CSSCube({
  cube,
  onDebris,
}: {
  cube: Cube;
  onDebris: (x: number, y: number, color: string) => void;
}) {
  const half = cube.size / 2;

  const faces = [
    { transform: `translateZ(${half}px)` },
    { transform: `rotateY(180deg) translateZ(${half}px)` },
    { transform: `rotateY(90deg) translateZ(${half}px)` },
    { transform: `rotateY(-90deg) translateZ(${half}px)` },
    { transform: `rotateX(90deg) translateZ(${half}px)` },
    { transform: `rotateX(-90deg) translateZ(${half}px)` },
  ];

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).closest('[data-blocks-root]')?.getBoundingClientRect();
      if (!rect) return;
      onDebris(e.clientX - rect.left, e.clientY - rect.top, cube.color);
    },
    [cube.color, onDebris],
  );

  return (
    <motion.div
      className="absolute cursor-pointer"
      style={{ left: cube.x, top: cube.y, perspective: 600 }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: cube.delay, duration: 0.8, ease: "easeOut" }}
      onClick={handleClick}
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
            className="absolute inset-0 rounded-sm border border-black/10"
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

function DebrisPiece({ d }: { d: Debris }) {
  return (
    <motion.div
      className="absolute rounded-[1px]"
      style={{
        left: d.x,
        top: d.y,
        width: d.size,
        height: d.size,
        backgroundColor: d.color,
        opacity: 0.8,
      }}
      initial={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 0.85 }}
      animate={{
        x: d.dx,
        y: d.dy,
        rotate: d.rotate,
        scale: [1, 0.8, 0],
        opacity: [0.85, 0.6, 0],
      }}
      transition={{
        duration: 1 + Math.random() * 0.5,
        ease: [0.12, 0, 0.39, 0], // accelerating fall (gravity-like)
      }}
    />
  );
}

export function FloatingBlocks() {
  const [debris, setDebris] = useState<Debris[]>([]);

  const handleDebris = useCallback((x: number, y: number, color: string) => {
    const pieces = spawnDebris(x, y, color);
    setDebris((prev) => [...prev, ...pieces]);
    // Clean up after animation
    setTimeout(() => {
      setDebris((prev) => prev.filter((p) => !pieces.includes(p)));
    }, 1500);
  }, []);

  return (
    <div
      data-blocks-root
      className="absolute inset-0 h-[900px]"
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      {cubes.map((c, i) => (
        <div key={i} style={{ pointerEvents: "auto" }}>
          <CSSCube cube={c} onDebris={handleDebris} />
        </div>
      ))}
      <AnimatePresence>
        {debris.map((d) => (
          <DebrisPiece key={d.id} d={d} />
        ))}
      </AnimatePresence>
    </div>
  );
}
