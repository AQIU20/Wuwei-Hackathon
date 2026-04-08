"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toPng } from "html-to-image";
import { useI18n } from "@/lib/i18n";
import { getAgentServerUrl } from "@/lib/agent-server";
import { MagneticButton } from "../components/MagneticButton";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const SENSORS = [
  { id: "vision", icon: "📷", effect: "lens-flare" },
  { id: "voice", icon: "🎙️", effect: "sound-wave" },
  { id: "env", icon: "🌡️", effect: "heat-map" },
  { id: "hr", icon: "💓", effect: "pulse" },
  { id: "hcho", icon: "🧪", effect: "particles" },
  { id: "imu", icon: "🧭", effect: "grid-tilt" },
  { id: "light", icon: "💡", effect: "neon-strip" },
  { id: "vibe", icon: "📳", effect: "vibration" },
] as const;

type SensorId = (typeof SENSORS)[number]["id"];

const EASTER_EGGS: { combo: SensorId[]; key: string }[] = [
  { combo: ["voice", "imu", "vision"], key: "hologram" },
  { combo: ["env", "hr", "hcho"], key: "vitals" },
  { combo: ["light", "vibe", "voice"], key: "immersive" },
  { combo: ["env", "hcho", "vision"], key: "guardian" },
  { combo: ["hr", "imu", "vibe"], key: "phantom" },
  { combo: ["voice", "hr"], key: "empathic" },
  { combo: ["vision", "imu"], key: "spatial" },
  { combo: ["env", "light"], key: "ambient" },
  { combo: ["hcho", "hr", "env", "imu"], key: "biofield" },
  { combo: ["vision", "voice", "light", "vibe"], key: "synesthesia" },
];

/* Card background gradients keyed by first unlocked combo (or sensor count) */
const CARD_BACKGROUNDS: Record<string, string> = {
  hologram:    "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
  vitals:      "linear-gradient(135deg, #0d1117 0%, #1a3a2a 50%, #0d2818 100%)",
  immersive:   "linear-gradient(135deg, #1a0a2e 0%, #3d1a6e 50%, #2d1b69 100%)",
  guardian:    "linear-gradient(135deg, #0a1628 0%, #1a3a5c 50%, #0d2137 100%)",
  phantom:     "linear-gradient(135deg, #1a0000 0%, #3d0a0a 50%, #2a0505 100%)",
  empathic:    "linear-gradient(135deg, #1a0a1e 0%, #3d1a3e 50%, #2d0b2e 100%)",
  spatial:     "linear-gradient(135deg, #0a1a28 0%, #1a3d5e 50%, #0d2a40 100%)",
  ambient:     "linear-gradient(135deg, #1a1a0a 0%, #3d3a1a 50%, #2d2a0d 100%)",
  biofield:    "linear-gradient(135deg, #001a0a 0%, #003d1a 50%, #002d0d 100%)",
  synesthesia: "linear-gradient(135deg, #1a0a28 0%, #3d1a5e 40%, #1a3d3d 70%, #0d2a15 100%)",
  all:         "linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 25%, #2e1a2e 50%, #1a2e1a 75%, #16213e 100%)",
  default:     "linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%)",
};

/* Card overlay pattern per combo */
const CARD_PATTERNS: Record<string, string> = {
  hologram:    "repeating-linear-gradient(45deg, transparent 0px, transparent 8px, rgba(100,100,255,0.03) 8px, rgba(100,100,255,0.03) 9px)",
  vitals:      "repeating-radial-gradient(circle at 50% 50%, transparent 0px, transparent 12px, rgba(0,255,100,0.02) 12px, rgba(0,255,100,0.02) 13px)",
  immersive:   "repeating-conic-gradient(from 0deg, transparent 0deg, transparent 10deg, rgba(180,100,255,0.02) 10deg, rgba(180,100,255,0.02) 11deg)",
  guardian:    "repeating-linear-gradient(0deg, transparent 0px, transparent 15px, rgba(100,180,255,0.03) 15px, rgba(100,180,255,0.03) 16px)",
  phantom:     "repeating-linear-gradient(135deg, transparent 0px, transparent 6px, rgba(255,50,50,0.02) 6px, rgba(255,50,50,0.02) 7px)",
  empathic:    "radial-gradient(ellipse at 50% 80%, rgba(255,100,200,0.05) 0%, transparent 60%)",
  spatial:     "linear-gradient(to bottom, rgba(100,200,255,0.03) 1px, transparent 1px), linear-gradient(to right, rgba(100,200,255,0.03) 1px, transparent 1px)",
  ambient:     "radial-gradient(circle at 30% 30%, rgba(255,200,50,0.05) 0%, transparent 50%)",
  biofield:    "repeating-radial-gradient(circle at 50% 50%, transparent 0px, transparent 20px, rgba(0,200,100,0.02) 20px, rgba(0,200,100,0.02) 21px)",
  synesthesia: "repeating-linear-gradient(60deg, transparent 0px, transparent 4px, rgba(200,100,255,0.015) 4px, rgba(200,100,255,0.015) 5px), repeating-linear-gradient(-60deg, transparent 0px, transparent 4px, rgba(100,255,200,0.015) 4px, rgba(100,255,200,0.015) 5px)",
  all:         "repeating-conic-gradient(from 0deg, rgba(255,255,255,0.01) 0deg, transparent 3deg, transparent 12deg)",
  default:     "none",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ContextMachine() {
  const { t } = useI18n();
  const cm = t.contextMachine;

  const [username, setUsername] = useState("");
  const [active, setActive] = useState<SensorId[]>([]);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [cardImage, setCardImage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<"idle" | "ok" | "dup">("idle");
  const [posted, setPosted] = useState(false);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);

  const cardRef = useRef<HTMLDivElement>(null);

  // Check easter eggs whenever active sensors change
  useEffect(() => {
    const newUnlocks: string[] = [];
    for (const egg of EASTER_EGGS) {
      if (egg.combo.every((s) => active.includes(s))) {
        newUnlocks.push(egg.key);
      }
    }
    if (active.length === SENSORS.length) {
      newUnlocks.push("all");
    }
    setUnlocked(newUnlocks);
  }, [active]);

  // Load gallery on mount
  useEffect(() => {
    fetchGallery();
  }, []);

  const serverUrl = getAgentServerUrl();

  async function fetchGallery() {
    try {
      const res = await fetch(`${serverUrl}/v1/gallery?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setGallery(data.items || []);
      }
    } catch {
      // gallery unavailable
    }
  }

  /* -- Drag handlers -- */
  function handleDragStart(e: React.DragEvent, sensorId: SensorId) {
    e.dataTransfer.setData("sensor", sensorId);
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("sensor") as SensorId;
    if (id && !active.includes(id)) {
      setActive((prev) => [...prev, id]);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function removeSensor(id: SensorId) {
    setActive((prev) => prev.filter((s) => s !== id));
    setCardImage(null);
    setPosted(false);
  }

  /* -- Card generation -- */
  const generateCard = useCallback(async () => {
    if (!cardRef.current || active.length === 0) return;
    setGenerating(true);
    try {
      const png = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: "#000",
      });
      setCardImage(png);
    } catch {
      // generation failed
    } finally {
      setGenerating(false);
    }
  }, [active, username, unlocked]);

  /* -- Waitlist -- */
  async function submitWaitlist() {
    if (!email) return;
    try {
      const res = await fetch(`${serverUrl}/v1/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setWaitlistStatus(res.status === 409 ? "dup" : "ok");
    } catch {
      // server unavailable
    }
  }

  /* -- Post to gallery -- */
  async function postToGallery() {
    if (!cardImage) return;
    try {
      await fetch(`${serverUrl}/v1/gallery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username || "Anonymous",
          sensors: active,
          easterEggs: unlocked,
          imageBase64: cardImage,
        }),
      });
      setPosted(true);
      fetchGallery();
    } catch {
      // server unavailable
    }
  }

  /* -- Helpers -- */
  function sensorName(id: string) {
    const item = t.modules.items.find((m: { id: string }) => m.id === id);
    return item?.name ?? id;
  }

  function comboName(key: string) {
    if (key === "all") return cm.allSensors;
    return (cm.combos as Record<string, string>)[key] ?? key;
  }

  const cardBgKey = unlocked.length > 0 ? unlocked[unlocked.length - 1] : "default";
  const cardBackground = CARD_BACKGROUNDS[cardBgKey] || CARD_BACKGROUNDS.default;
  const cardPattern = CARD_PATTERNS[cardBgKey] || CARD_PATTERNS.default;

  return (
    <div className="relative mx-auto max-w-7xl px-4 pt-10 pb-20 sm:px-6 lg:px-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {cm.title}
        </h1>
        <p className="mt-2 text-base text-black/50">{cm.subtitle}</p>
      </motion.div>

      {/* Username */}
      <div className="mx-auto mb-8 max-w-xs">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={cm.usernamePlaceholder}
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-center outline-none focus:border-black/30 transition-colors"
        />
      </div>

      {/* Main layout: palette + stage */}
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Sensor palette */}
        <div className="rounded-2xl border border-black/8 bg-white/60 p-4 backdrop-blur-sm">
          <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-black/40">
            {cm.sensorPalette}
          </h3>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {SENSORS.map((s) => {
              const isActive = active.includes(s.id);
              return (
                <div
                  key={s.id}
                  draggable={!isActive}
                  onDragStart={(e) => handleDragStart(e, s.id)}
                  className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm transition-all select-none whitespace-nowrap ${
                    isActive
                      ? "border-black/5 bg-black/[0.03] text-black/30 cursor-default"
                      : "border-black/10 bg-white cursor-grab hover:border-black/25 hover:shadow-md active:cursor-grabbing active:scale-95"
                  }`}
                >
                  <span className="text-base leading-none">{s.icon}</span>
                  <span className="font-semibold text-xs">{sensorName(s.id)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stage + card area */}
        <div className="space-y-6">
          {/* Drop stage */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="relative min-h-[400px] overflow-hidden rounded-2xl border-2 border-dashed border-black/10 bg-black/[0.02] transition-colors"
            style={active.length > 0 ? { borderStyle: "solid", borderColor: "rgba(0,0,0,0.08)" } : {}}
          >
            {/* Visual effect layers */}
            <div className="absolute inset-0">
              {active.map((id) => {
                const sensor = SENSORS.find((s) => s.id === id)!;
                return (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`effect-layer effect-${sensor.effect}`}
                  />
                );
              })}
            </div>

            {/* Empty state */}
            {active.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="font-mono text-sm text-black/25">{cm.stage}</p>
              </div>
            )}

            {/* Active sensor blocks — brick/block style */}
            <div className="relative z-10 flex flex-wrap gap-2.5 p-4">
              <AnimatePresence>
                {active.map((id) => {
                  const s = SENSORS.find((s) => s.id === id)!;
                  return (
                    <motion.button
                      key={id}
                      initial={{ scale: 0, opacity: 0, rotate: -10 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      exit={{ scale: 0, opacity: 0, rotate: 10 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      onClick={() => removeSensor(id)}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 border-black/10 bg-white/95 backdrop-blur-sm px-3 py-2 text-xs font-bold shadow-md hover:bg-red-50 hover:border-red-300 transition-colors"
                    >
                      <span className="text-sm leading-none">{s.icon}</span>
                      {sensorName(id)}
                      <span className="ml-0.5 text-[10px] text-black/25">×</span>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Easter egg toasts */}
            <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap gap-2">
              <AnimatePresence>
                {unlocked.map((key) => (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg"
                  >
                    <span>✨</span>
                    {cm.easterEggUnlock}: {comboName(key)}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Generate button */}
          {active.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-center"
            >
              <MagneticButton
                className="!px-8 !py-3 text-sm"
                onClick={generateCard}
              >
                {generating ? cm.generating : cm.generate}
              </MagneticButton>
            </motion.div>
          )}

          {/* Card preview (off-screen, used for image generation) */}
          <div className="fixed -left-[9999px] top-0">
            <div
              ref={cardRef}
              style={{
                width: 400,
                padding: 24,
                borderRadius: 16,
                background: cardBackground,
                fontFamily: "system-ui, sans-serif",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Pattern overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: cardPattern,
                  backgroundSize: cardBgKey === "spatial" ? "20px 20px" : undefined,
                  pointerEvents: "none",
                }}
              />
              <div style={{ position: "relative" }}>
                <CardContent
                  username={username}
                  active={active}
                  unlocked={unlocked}
                  sensorName={sensorName}
                  comboName={comboName}
                  cm={cm}
                />
              </div>
            </div>
          </div>

          {/* Generated card display + actions */}
          <AnimatePresence>
            {cardImage && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="mx-auto max-w-sm">
                  <img
                    src={cardImage}
                    alt="Context Card"
                    className="w-full rounded-2xl shadow-2xl"
                  />
                </div>

                <div className="mx-auto flex max-w-md flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
                  <a
                    href={cardImage}
                    download={`context-card-${username || "anonymous"}.png`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-5 py-2.5 text-sm font-medium hover:bg-black/[0.02] transition-colors"
                  >
                    ↓ Download
                  </a>
                  {!posted ? (
                    <button
                      onClick={postToGallery}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-black/80 transition-colors"
                    >
                      {cm.gallery.post}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
                      ✓ {cm.gallery.posted}
                    </span>
                  )}
                </div>

                {/* Waitlist */}
                <div className="mx-auto max-w-md rounded-2xl border border-black/8 bg-white/60 p-6 backdrop-blur-sm">
                  <h3 className="font-display text-lg font-semibold">{cm.waitlist.title}</h3>
                  <p className="mt-1 text-sm text-black/50">{cm.waitlist.desc}</p>
                  {waitlistStatus === "idle" ? (
                    <div className="mt-4 flex gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={cm.waitlist.placeholder}
                        className="flex-1 rounded-xl border border-black/10 px-4 py-2.5 text-sm outline-none focus:border-black/30 transition-colors"
                        onKeyDown={(e) => e.key === "Enter" && submitWaitlist()}
                      />
                      <button
                        onClick={submitWaitlist}
                        className="rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-black/80 transition-colors"
                      >
                        {cm.waitlist.submit}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm font-medium text-emerald-600">
                      ✓ {waitlistStatus === "ok" ? cm.waitlist.success : cm.waitlist.duplicate}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Gallery — images loaded individually via /gallery/:id/image */}
      {gallery.length > 0 && (
        <section className="mt-20">
          <h2 className="mb-8 text-center font-display text-2xl font-semibold tracking-tight">
            {cm.gallery.title}
          </h2>
          <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
            {gallery.map((item) => (
              <div
                key={item.id}
                className="mb-4 break-inside-avoid overflow-hidden rounded-xl border border-black/8 bg-white shadow-sm"
              >
                <img
                  src={`${serverUrl}/v1/gallery/${item.id}/image`}
                  alt={item.username}
                  className="w-full"
                  loading="lazy"
                />
                <div className="px-3 py-2">
                  <p className="text-xs font-medium">{item.username}</p>
                  <p className="text-[10px] text-black/40">
                    {item.sensors.map((s: string) => sensorName(s)).join(" · ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Effect layer CSS */}
      <style jsx global>{`
        .effect-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .effect-sound-wave {
          background: repeating-radial-gradient(
            circle at 50% 50%,
            transparent 0px, transparent 8px,
            rgba(139, 92, 246, 0.06) 8px, rgba(139, 92, 246, 0.06) 10px
          );
          animation: pulse-wave 3s ease-in-out infinite;
        }
        @keyframes pulse-wave {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        .effect-heat-map {
          background: radial-gradient(ellipse at 30% 60%, rgba(239,68,68,0.12) 0%, transparent 60%),
                      radial-gradient(ellipse at 70% 40%, rgba(59,130,246,0.10) 0%, transparent 60%);
          animation: heat-shift 5s ease-in-out infinite alternate;
        }
        @keyframes heat-shift {
          0% { filter: hue-rotate(0deg); }
          100% { filter: hue-rotate(30deg); }
        }
        .effect-lens-flare {
          background: radial-gradient(circle at 65% 35%, rgba(251,191,36,0.15) 0%, transparent 50%),
                      radial-gradient(circle at 30% 70%, rgba(251,191,36,0.08) 0%, transparent 40%);
          animation: flare-move 6s ease-in-out infinite alternate;
        }
        @keyframes flare-move {
          0% { background-position: 0% 0%; }
          100% { background-position: 100% 100%; }
        }
        .effect-pulse {
          background: radial-gradient(circle at 50% 50%, rgba(236,72,153,0.10) 0%, transparent 70%);
          animation: heartbeat 1.2s ease-in-out infinite;
        }
        @keyframes heartbeat {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          14% { transform: scale(1.05); opacity: 0.9; }
          28% { transform: scale(1); opacity: 0.5; }
          42% { transform: scale(1.03); opacity: 0.8; }
        }
        .effect-particles {
          background-image:
            radial-gradient(1px 1px at 20% 30%, rgba(16,185,129,0.4) 50%, transparent 50%),
            radial-gradient(1px 1px at 40% 70%, rgba(16,185,129,0.3) 50%, transparent 50%),
            radial-gradient(1.5px 1.5px at 60% 20%, rgba(16,185,129,0.35) 50%, transparent 50%),
            radial-gradient(1px 1px at 80% 50%, rgba(16,185,129,0.3) 50%, transparent 50%),
            radial-gradient(1.5px 1.5px at 10% 80%, rgba(16,185,129,0.4) 50%, transparent 50%),
            radial-gradient(1px 1px at 90% 10%, rgba(16,185,129,0.3) 50%, transparent 50%);
          animation: particle-drift 8s linear infinite;
        }
        @keyframes particle-drift {
          0% { transform: translateY(0); }
          100% { transform: translateY(-20px); }
        }
        .effect-grid-tilt {
          background-image:
            linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px);
          background-size: 30px 30px;
          animation: grid-skew 4s ease-in-out infinite alternate;
        }
        @keyframes grid-skew {
          0% { transform: perspective(500px) rotateX(2deg) rotateY(-1deg); }
          100% { transform: perspective(500px) rotateX(-2deg) rotateY(1deg); }
        }
        .effect-neon-strip {
          background: linear-gradient(90deg,
            rgba(168,85,247,0.08) 0%, rgba(236,72,153,0.08) 25%,
            rgba(59,130,246,0.08) 50%, rgba(16,185,129,0.08) 75%,
            rgba(168,85,247,0.08) 100%);
          background-size: 200% 100%;
          animation: neon-flow 3s linear infinite;
        }
        @keyframes neon-flow {
          0% { background-position: 0% 0%; }
          100% { background-position: 200% 0%; }
        }
        .effect-vibration {
          background: repeating-linear-gradient(0deg,
            transparent 0px, transparent 3px,
            rgba(245,158,11,0.04) 3px, rgba(245,158,11,0.04) 4px);
          animation: shake 0.3s linear infinite;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(0.5px); }
          75% { transform: translateX(-0.5px); }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card content (rendered to image)                                   */
/* ------------------------------------------------------------------ */

function CardContent({
  username,
  active,
  unlocked,
  sensorName,
  comboName,
  cm,
}: {
  username: string;
  active: SensorId[];
  unlocked: string[];
  sensorName: (id: string) => string;
  comboName: (key: string) => string;
  cm: Record<string, any>;
}) {
  return (
    <div style={{ color: "white" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(255,255,255,0.4)" }}>
          {cm.card.title}
        </span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
          {new Date().toLocaleDateString()}
        </span>
      </div>

      {/* Username */}
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 20 }}>
        {username || "Anonymous"}
      </div>

      {/* Sensor blocks — inline brick style */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
          {cm.card.sensors}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {active.map((id) => {
            const s = SENSORS.find((s) => s.id === id)!;
            return (
              <span
                key={id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 10px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.1)",
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {s.icon} {sensorName(id)}
              </span>
            );
          })}
        </div>
      </div>

      {/* Unlocked combos */}
      {unlocked.length > 0 && (
        <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
            {cm.card.unlocked}
          </div>
          {unlocked.map((key) => (
            <div
              key={key}
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 4,
                background: "linear-gradient(90deg, #a855f7, #ec4899)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              ✨ {comboName(key)}
            </div>
          ))}
        </div>
      )}

      {/* Footer branding */}
      <div style={{ marginTop: 24, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>unforce-make.vercel.app</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>无为创造</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GalleryItem {
  id: number;
  username: string;
  sensors: string[];
  easterEggs: string[];
  createdAt: string;
}
