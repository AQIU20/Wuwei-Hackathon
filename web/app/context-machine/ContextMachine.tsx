"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toPng } from "html-to-image";
import { useI18n, type Locale } from "@/lib/i18n";
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

/* ---- Vibes / Moods ---- */
const VIBES = ["happy", "relaxed", "tense", "anxious", "joyful", "dreamy", "focused", "melancholic"] as const;
type Vibe = (typeof VIBES)[number];

const VIBE_LABELS: Record<string, Record<Vibe, string>> = {
  en: { happy: "Happy", relaxed: "Relaxed", tense: "Tense", anxious: "Anxious", joyful: "Joyful", dreamy: "Dreamy", focused: "Focused", melancholic: "Melancholic" },
  zh: { happy: "开心", relaxed: "放松", tense: "紧张", anxious: "焦虑", joyful: "愉悦", dreamy: "梦幻", focused: "专注", melancholic: "忧郁" },
};

const VIBE_EMOJI: Record<Vibe, string> = {
  happy: "😊", relaxed: "😌", tense: "😰", anxious: "😟", joyful: "🥳", dreamy: "🌙", focused: "🎯", melancholic: "🌧️",
};

/* ---- Backgrounds per vibe (pool of 3-4 each, randomly picked) ---- */
const VIBE_BACKGROUNDS: Record<Vibe, string[]> = {
  happy: [
    "linear-gradient(135deg, #1a1a0a 0%, #3d3a0a 40%, #5c4a0a 100%)",
    "linear-gradient(135deg, #2a1a0a 0%, #4d3a1a 50%, #3d2a0a 100%)",
    "linear-gradient(160deg, #1a1500 0%, #3d3200 45%, #5c4800 100%)",
  ],
  relaxed: [
    "linear-gradient(135deg, #0a1a1a 0%, #0a3a3a 50%, #0a2a2a 100%)",
    "linear-gradient(135deg, #0a1a28 0%, #0a2d3d 50%, #0a2030 100%)",
    "linear-gradient(160deg, #081818 0%, #0d3030 45%, #0a2828 100%)",
  ],
  tense: [
    "linear-gradient(135deg, #1a0505 0%, #3d0a0a 50%, #2a0000 100%)",
    "linear-gradient(135deg, #1a0a05 0%, #3d1a0a 50%, #2a0d00 100%)",
    "linear-gradient(160deg, #200505 0%, #401010 45%, #300808 100%)",
  ],
  anxious: [
    "linear-gradient(135deg, #0a0a1a 0%, #1a1a3d 50%, #0d0d2a 100%)",
    "linear-gradient(135deg, #0f0a1a 0%, #251a3d 50%, #180d2a 100%)",
    "linear-gradient(160deg, #0a0818 0%, #1a1535 45%, #0d0a28 100%)",
  ],
  joyful: [
    "linear-gradient(135deg, #1a0a2e 0%, #3d1a5e 40%, #5e1a3d 100%)",
    "linear-gradient(135deg, #2a0a1e 0%, #4d1a4e 50%, #3d0a3e 100%)",
    "linear-gradient(160deg, #1e0a28 0%, #3e1a50 45%, #501a40 100%)",
  ],
  dreamy: [
    "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    "linear-gradient(135deg, #0a0a28 0%, #252060 50%, #1e1a40 100%)",
    "linear-gradient(160deg, #0d0a25 0%, #282058 45%, #201a3a 100%)",
  ],
  focused: [
    "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)",
    "linear-gradient(135deg, #0a0f14 0%, #141a20 50%, #0a0f14 100%)",
    "linear-gradient(160deg, #0c1018 0%, #151c25 45%, #0c1018 100%)",
  ],
  melancholic: [
    "linear-gradient(135deg, #0a1628 0%, #1a2a3c 50%, #0d1a28 100%)",
    "linear-gradient(135deg, #0a1420 0%, #1a2835 50%, #0d1822 100%)",
    "linear-gradient(160deg, #081525 0%, #182838 45%, #0c1a28 100%)",
  ],
};

const VIBE_PATTERNS: Record<Vibe, string[]> = {
  happy: [
    "radial-gradient(circle at 25% 25%, rgba(255,200,50,0.06) 0%, transparent 40%), radial-gradient(circle at 75% 75%, rgba(255,150,50,0.04) 0%, transparent 40%)",
    "repeating-linear-gradient(60deg, transparent 0px, transparent 10px, rgba(255,200,0,0.02) 10px, rgba(255,200,0,0.02) 11px)",
  ],
  relaxed: [
    "radial-gradient(ellipse at 50% 100%, rgba(100,200,200,0.06) 0%, transparent 60%)",
    "repeating-linear-gradient(0deg, transparent 0px, transparent 20px, rgba(100,200,180,0.02) 20px, rgba(100,200,180,0.02) 21px)",
  ],
  tense: [
    "repeating-linear-gradient(45deg, transparent 0px, transparent 4px, rgba(255,50,50,0.03) 4px, rgba(255,50,50,0.03) 5px)",
    "repeating-linear-gradient(-45deg, transparent 0px, transparent 6px, rgba(255,80,30,0.02) 6px, rgba(255,80,30,0.02) 7px)",
  ],
  anxious: [
    "repeating-radial-gradient(circle at 50% 50%, transparent 0px, transparent 8px, rgba(100,80,200,0.025) 8px, rgba(100,80,200,0.025) 9px)",
    "repeating-linear-gradient(90deg, transparent 0px, transparent 3px, rgba(120,80,200,0.02) 3px, rgba(120,80,200,0.02) 4px)",
  ],
  joyful: [
    "repeating-conic-gradient(from 0deg, rgba(255,100,200,0.02) 0deg, transparent 5deg, transparent 15deg)",
    "radial-gradient(circle at 30% 30%, rgba(255,100,255,0.05) 0%, transparent 40%), radial-gradient(circle at 70% 70%, rgba(100,200,255,0.04) 0%, transparent 40%)",
  ],
  dreamy: [
    "radial-gradient(ellipse at 40% 20%, rgba(150,100,255,0.06) 0%, transparent 50%), radial-gradient(ellipse at 60% 80%, rgba(100,150,255,0.04) 0%, transparent 50%)",
    "repeating-linear-gradient(135deg, transparent 0px, transparent 12px, rgba(150,100,255,0.015) 12px, rgba(150,100,255,0.015) 13px)",
  ],
  focused: [
    "linear-gradient(to bottom, rgba(200,200,200,0.03) 1px, transparent 1px), linear-gradient(to right, rgba(200,200,200,0.03) 1px, transparent 1px)",
    "repeating-linear-gradient(0deg, transparent 0px, transparent 25px, rgba(200,200,200,0.02) 25px, rgba(200,200,200,0.02) 26px)",
  ],
  melancholic: [
    "radial-gradient(ellipse at 50% 0%, rgba(100,150,200,0.06) 0%, transparent 60%)",
    "repeating-linear-gradient(180deg, transparent 0px, transparent 15px, rgba(100,140,200,0.02) 15px, rgba(100,140,200,0.02) 16px)",
  ],
};

/* ---- Easter eggs: combo key -> array of text variants (en/zh) ---- */
/* Each sensor gets single-module easter eggs too */

type EasterEggDef = { combo: SensorId[]; variants: { en: string[]; zh: string[] } };

const EASTER_EGGS: EasterEggDef[] = [
  // Single-sensor
  { combo: ["vision"], variants: { en: ["All-Seeing Eye", "Pixel Whisperer", "Frame Hunter"], zh: ["全视之眼", "像素低语者", "帧猎手"] } },
  { combo: ["voice"], variants: { en: ["Echo Chamber", "Sonic Bloom", "Voice Weaver"], zh: ["回声之室", "声波绽放", "织声者"] } },
  { combo: ["env"], variants: { en: ["Climate Oracle", "Atmosphere Reader", "Weather Whisperer"], zh: ["气候预言师", "大气解读者", "天气低语者"] } },
  { combo: ["hr"], variants: { en: ["Heartbeat Decoder", "Pulse Keeper", "Rhythm Catcher"], zh: ["心跳解码器", "脉搏守护者", "节奏捕手"] } },
  { combo: ["hcho"], variants: { en: ["Air Alchemist", "Molecule Scout", "Breath Warden"], zh: ["空气炼金师", "分子侦察兵", "呼吸守卫"] } },
  { combo: ["imu"], variants: { en: ["Motion Mapper", "Gravity Surfer", "Balance Keeper"], zh: ["运动绘图师", "重力冲浪者", "平衡守卫"] } },
  { combo: ["light"], variants: { en: ["Photon Painter", "Light Bender", "Neon Poet"], zh: ["光子画师", "折光者", "霓虹诗人"] } },
  { combo: ["vibe"], variants: { en: ["Tremor Artist", "Haptic Dream", "Pulse Sculptor"], zh: ["震颤艺术家", "触觉之梦", "脉冲雕刻家"] } },

  // Two-sensor
  { combo: ["voice", "hr"], variants: { en: ["Empathic Listener", "Heart Song", "Mood Reader"], zh: ["共情倾听者", "心之歌", "情绪解读者"] } },
  { combo: ["vision", "imu"], variants: { en: ["Spatial Navigator", "Depth Seeker", "World Scanner"], zh: ["空间导航仪", "深度探索者", "世界扫描仪"] } },
  { combo: ["env", "light"], variants: { en: ["Ambient Orchestrator", "Mood Lighter", "Scene Painter"], zh: ["氛围编排师", "情绪灯光师", "场景画师"] } },
  { combo: ["hcho", "env"], variants: { en: ["Pure Air Guardian", "Breath Analyst", "Air Quality Sage"], zh: ["净气守护者", "呼吸分析师", "空气质量先知"] } },
  { combo: ["hr", "imu"], variants: { en: ["Body Whisperer", "Kinetic Heart", "Motion Vitals"], zh: ["身体低语者", "动力之心", "运动体征"] } },
  { combo: ["light", "vibe"], variants: { en: ["Sensory Duo", "Touch & Light", "Haptic Glow"], zh: ["感官二重奏", "触觉与光", "触觉光芒"] } },
  { combo: ["voice", "vision"], variants: { en: ["Perception Engine", "See & Hear", "Sense Fusion"], zh: ["感知引擎", "所见所闻", "感官融合"] } },

  // Three-sensor
  { combo: ["voice", "imu", "vision"], variants: { en: ["Holographic Interpreter", "Reality Weaver", "Dimension Bridge"], zh: ["全息同声传译器", "现实编织者", "维度之桥"] } },
  { combo: ["env", "hr", "hcho"], variants: { en: ["Vital Signs Station", "Life Monitor", "Biome Sentinel"], zh: ["生命体征监测站", "生命监视器", "生态哨兵"] } },
  { combo: ["light", "vibe", "voice"], variants: { en: ["Immersive Sensory Engine", "Sensation Forge", "Experience Reactor"], zh: ["沉浸式感官引擎", "感觉熔炉", "体验反应堆"] } },
  { combo: ["env", "hcho", "vision"], variants: { en: ["Environment Guardian", "Space Watcher", "Eco Sentinel"], zh: ["环境守卫者", "空间瞭望者", "生态哨兵"] } },
  { combo: ["hr", "imu", "vibe"], variants: { en: ["Phantom Awareness", "Body Electric", "Nerve Network"], zh: ["幻影感知", "电子之躯", "神经网络"] } },

  // Four-sensor
  { combo: ["hcho", "hr", "env", "imu"], variants: { en: ["Biofield Scanner", "Living Matrix", "Organic Radar"], zh: ["生物场扫描仪", "活体矩阵", "有机雷达"] } },
  { combo: ["vision", "voice", "light", "vibe"], variants: { en: ["Synesthesia Engine", "Cross-Sense Core", "Perception Blender"], zh: ["通感引擎", "跨感官核心", "感知搅拌机"] } },
  { combo: ["voice", "hr", "env", "light"], variants: { en: ["Emotional Landscape", "Mood Architect", "Feeling Machine"], zh: ["情绪景观", "情绪建筑师", "感觉机器"] } },
  { combo: ["vision", "imu", "hcho", "vibe"], variants: { en: ["Reality Augmenter", "World Enhancer", "Sense Amplifier"], zh: ["现实增强器", "世界增幅器", "感官放大器"] } },

  // Five+
  { combo: ["vision", "voice", "env", "hr", "hcho"], variants: { en: ["Omniscient Observer", "Life Reader", "Total Awareness"], zh: ["全知观察者", "生命解读者", "完全感知"] } },
  { combo: ["vision", "voice", "light", "vibe", "imu"], variants: { en: ["Sensory Overload", "Hyper Perception", "Experience Maximizer"], zh: ["感官过载", "超级感知", "体验最大化"] } },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ContextMachine() {
  const { t, locale } = useI18n();
  const cm = t.contextMachine;

  const [username, setUsername] = useState("");
  const [selectedVibe, setSelectedVibe] = useState<Vibe>("happy");
  const [active, setActive] = useState<SensorId[]>([]);
  const [unlockedTexts, setUnlockedTexts] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [cardImage, setCardImage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<"idle" | "ok" | "dup">("idle");
  const [posted, setPosted] = useState(false);

  // Random seed for card style — changes on each generate
  const [cardSeed, setCardSeed] = useState(0);

  const cardRef = useRef<HTMLDivElement>(null);
  const serverUrl = getAgentServerUrl();

  // Resolve easter eggs whenever active sensors change
  useEffect(() => {
    const texts: string[] = [];
    const lang = locale as "en" | "zh";

    // Find all matching combos (sorted by combo size desc so bigger combos first)
    const matched = EASTER_EGGS
      .filter((egg) => egg.combo.every((s) => active.includes(s)))
      .sort((a, b) => b.combo.length - a.combo.length);

    // Pick one random variant per matched combo
    for (const egg of matched) {
      texts.push(pick(egg.variants[lang]));
    }

    // All sensors bonus
    if (active.length === SENSORS.length) {
      texts.unshift(locale === "zh" ? "全频谱本体 ∞" : "Full Spectrum Entity ∞");
    }

    setUnlockedTexts(texts);
  }, [active, locale]);

  /* -- Drag -- */
  function handleDragStart(e: React.DragEvent, sensorId: SensorId) {
    e.dataTransfer.setData("sensor", sensorId);
    e.dataTransfer.effectAllowed = "copy";
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("sensor") as SensorId;
    if (id && !active.includes(id)) setActive((p) => [...p, id]);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  function removeSensor(id: SensorId) {
    setActive((p) => p.filter((s) => s !== id));
    setCardImage(null);
    setPosted(false);
  }

  /* -- Generate -- */
  const generateCard = useCallback(async () => {
    if (!cardRef.current || active.length === 0) return;
    setCardSeed(Math.random()); // randomize style
    setGenerating(true);
    // Wait a tick for seed-based styles to render
    await new Promise((r) => setTimeout(r, 50));
    try {
      const png = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: "#000" });
      setCardImage(png);
    } catch { /* */ }
    setGenerating(false);
  }, [active, username, selectedVibe]);

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
    } catch { /* */ }
  }

  /* -- Gallery post -- */
  async function postToGallery() {
    if (!cardImage) return;
    try {
      await fetch(`${serverUrl}/v1/gallery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username || "Anonymous", sensors: active, easterEggs: unlockedTexts, imageBase64: cardImage }),
      });
      setPosted(true);
    } catch { /* */ }
  }

  /* -- Helpers -- */
  function sensorName(id: string) {
    return t.modules.items.find((m: { id: string }) => m.id === id)?.name ?? id;
  }

  // Seeded random pick from array
  const seededIdx = (arr: unknown[], seed: number) => Math.floor(((seed * 9301 + 49297) % 233280) / 233280 * arr.length);

  const bgPool = VIBE_BACKGROUNDS[selectedVibe];
  const patPool = VIBE_PATTERNS[selectedVibe];
  const cardBackground = bgPool[seededIdx(bgPool, cardSeed * 1000)];
  const cardPattern = patPool[seededIdx(patPool, cardSeed * 2000)];
  const vibeLabel = VIBE_LABELS[locale]?.[selectedVibe] ?? selectedVibe;

  return (
    <div className="relative mx-auto max-w-7xl px-4 pt-10 pb-20 sm:px-6 lg:px-10">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{cm.title}</h1>
        <p className="mt-2 text-base text-black/50">{cm.subtitle}</p>
      </motion.div>

      {/* Username + Vibe picker */}
      <div className="mx-auto mb-8 max-w-lg space-y-4">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={cm.usernamePlaceholder}
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-center outline-none focus:border-black/30 transition-colors"
        />
        {/* Vibe selector */}
        <div className="text-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/35 block mb-2">
            {locale === "zh" ? "选择你的 Vibe" : "Pick your vibe"}
          </span>
          <div className="flex flex-wrap justify-center gap-2">
            {VIBES.map((v) => (
              <button
                key={v}
                onClick={() => { setSelectedVibe(v); setCardImage(null); }}
                className={`shrink-0 whitespace-nowrap rounded-full border-2 px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedVibe === v
                    ? "border-black bg-black text-white scale-105"
                    : "border-black/10 bg-white text-black/60 hover:border-black/25"
                }`}
              >
                {VIBE_EMOJI[v]} {VIBE_LABELS[locale]?.[v] ?? v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Sensor palette */}
        <div className="rounded-2xl border border-black/8 bg-white/60 p-4 backdrop-blur-sm">
          <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-black/40">{cm.sensorPalette}</h3>
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

        {/* Stage + card */}
        <div className="space-y-6">
          {/* Drop stage */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="relative min-h-[400px] overflow-hidden rounded-2xl border-2 border-dashed border-black/10 bg-black/[0.02] transition-colors"
            style={active.length > 0 ? { borderStyle: "solid", borderColor: "rgba(0,0,0,0.08)" } : {}}
          >
            <div className="absolute inset-0">
              {active.map((id) => {
                const sensor = SENSORS.find((s) => s.id === id)!;
                return <motion.div key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`effect-layer effect-${sensor.effect}`} />;
              })}
            </div>

            {active.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="font-mono text-sm text-black/25">{cm.stage}</p>
              </div>
            )}

            {/* Active sensor blocks */}
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

            {/* Easter egg toasts — show up to 4 */}
            <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap gap-2">
              <AnimatePresence>
                {unlockedTexts.slice(0, 4).map((text, i) => (
                  <motion.div
                    key={text + i}
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg"
                  >
                    ✨ {cm.easterEggUnlock}: {text}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Generate */}
          {active.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center">
              <MagneticButton className="!px-8 !py-3 text-sm" onClick={generateCard}>
                {generating ? cm.generating : cm.generate}
              </MagneticButton>
            </motion.div>
          )}

          {/* Hidden card for image gen */}
          <div className="fixed -left-[9999px] top-0">
            <div
              ref={cardRef}
              style={{ width: 400, padding: 24, borderRadius: 16, background: cardBackground, fontFamily: "system-ui, sans-serif", position: "relative", overflow: "hidden" }}
            >
              <div style={{ position: "absolute", inset: 0, backgroundImage: cardPattern, pointerEvents: "none" }} />
              <div style={{ position: "relative" }}>
                <CardContent username={username} active={active} unlockedTexts={unlockedTexts} sensorName={sensorName} vibeLabel={vibeLabel} vibeEmoji={VIBE_EMOJI[selectedVibe]} cm={cm} />
              </div>
            </div>
          </div>

          {/* Card display + actions */}
          <AnimatePresence>
            {cardImage && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                <div className="mx-auto max-w-sm">
                  <img src={cardImage} alt="Context Card" className="w-full rounded-2xl shadow-2xl" />
                </div>

                <div className="mx-auto flex max-w-md flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
                  <a href={cardImage} download={`context-card-${username || "anonymous"}.png`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-5 py-2.5 text-sm font-medium hover:bg-black/[0.02] transition-colors">
                    ↓ Download
                  </a>
                  {!posted ? (
                    <button onClick={postToGallery} className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-black/80 transition-colors">
                      {cm.gallery.post}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">✓ {cm.gallery.posted}</span>
                  )}
                </div>

                {/* Waitlist */}
                <div className="mx-auto max-w-md rounded-2xl border border-black/8 bg-white/60 p-6 backdrop-blur-sm">
                  <h3 className="font-display text-lg font-semibold">{cm.waitlist.title}</h3>
                  <p className="mt-1 text-sm text-black/50">{cm.waitlist.desc}</p>
                  {waitlistStatus === "idle" ? (
                    <div className="mt-4 flex gap-2">
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={cm.waitlist.placeholder} className="flex-1 rounded-xl border border-black/10 px-4 py-2.5 text-sm outline-none focus:border-black/30 transition-colors" onKeyDown={(e) => e.key === "Enter" && submitWaitlist()} />
                      <button onClick={submitWaitlist} className="rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-black/80 transition-colors">{cm.waitlist.submit}</button>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm font-medium text-emerald-600">✓ {waitlistStatus === "ok" ? cm.waitlist.success : cm.waitlist.duplicate}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Effect CSS */}
      <style jsx global>{`
        .effect-layer { position: absolute; inset: 0; pointer-events: none; }
        .effect-sound-wave { background: repeating-radial-gradient(circle at 50% 50%, transparent 0px, transparent 8px, rgba(139,92,246,0.06) 8px, rgba(139,92,246,0.06) 10px); animation: pulse-wave 3s ease-in-out infinite; }
        @keyframes pulse-wave { 0%,100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.05); opacity: 1; } }
        .effect-heat-map { background: radial-gradient(ellipse at 30% 60%, rgba(239,68,68,0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 40%, rgba(59,130,246,0.10) 0%, transparent 60%); animation: heat-shift 5s ease-in-out infinite alternate; }
        @keyframes heat-shift { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(30deg); } }
        .effect-lens-flare { background: radial-gradient(circle at 65% 35%, rgba(251,191,36,0.15) 0%, transparent 50%), radial-gradient(circle at 30% 70%, rgba(251,191,36,0.08) 0%, transparent 40%); animation: flare-move 6s ease-in-out infinite alternate; }
        @keyframes flare-move { 0% { background-position: 0% 0%; } 100% { background-position: 100% 100%; } }
        .effect-pulse { background: radial-gradient(circle at 50% 50%, rgba(236,72,153,0.10) 0%, transparent 70%); animation: heartbeat 1.2s ease-in-out infinite; }
        @keyframes heartbeat { 0%,100% { transform: scale(1); opacity: 0.5; } 14% { transform: scale(1.05); opacity: 0.9; } 28% { transform: scale(1); opacity: 0.5; } 42% { transform: scale(1.03); opacity: 0.8; } }
        .effect-particles { background-image: radial-gradient(1px 1px at 20% 30%, rgba(16,185,129,0.4) 50%, transparent 50%), radial-gradient(1px 1px at 40% 70%, rgba(16,185,129,0.3) 50%, transparent 50%), radial-gradient(1.5px 1.5px at 60% 20%, rgba(16,185,129,0.35) 50%, transparent 50%), radial-gradient(1px 1px at 80% 50%, rgba(16,185,129,0.3) 50%, transparent 50%); animation: particle-drift 8s linear infinite; }
        @keyframes particle-drift { 0% { transform: translateY(0); } 100% { transform: translateY(-20px); } }
        .effect-grid-tilt { background-image: linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px); background-size: 30px 30px; animation: grid-skew 4s ease-in-out infinite alternate; }
        @keyframes grid-skew { 0% { transform: perspective(500px) rotateX(2deg) rotateY(-1deg); } 100% { transform: perspective(500px) rotateX(-2deg) rotateY(1deg); } }
        .effect-neon-strip { background: linear-gradient(90deg, rgba(168,85,247,0.08) 0%, rgba(236,72,153,0.08) 25%, rgba(59,130,246,0.08) 50%, rgba(16,185,129,0.08) 75%, rgba(168,85,247,0.08) 100%); background-size: 200% 100%; animation: neon-flow 3s linear infinite; }
        @keyframes neon-flow { 0% { background-position: 0% 0%; } 100% { background-position: 200% 0%; } }
        .effect-vibration { background: repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(245,158,11,0.04) 3px, rgba(245,158,11,0.04) 4px); animation: shake 0.3s linear infinite; }
        @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(0.5px); } 75% { transform: translateX(-0.5px); } }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card content                                                       */
/* ------------------------------------------------------------------ */

function CardContent({
  username, active, unlockedTexts, sensorName, vibeLabel, vibeEmoji, cm,
}: {
  username: string; active: SensorId[]; unlockedTexts: string[];
  sensorName: (id: string) => string; vibeLabel: string; vibeEmoji: string;
  cm: Record<string, any>;
}) {
  return (
    <div style={{ color: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(255,255,255,0.4)" }}>{cm.card.title}</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{new Date().toLocaleDateString()}</span>
      </div>

      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 6 }}>{username || "Anonymous"}</div>

      {/* Vibe badge */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, background: "rgba(255,255,255,0.08)", fontSize: 11, marginBottom: 16, whiteSpace: "nowrap" }}>
        {vibeEmoji} {vibeLabel}
      </div>

      {/* Sensor blocks */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{cm.card.sensors}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {active.map((id) => {
            const s = SENSORS.find((s) => s.id === id)!;
            return (
              <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, background: "rgba(255,255,255,0.1)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", border: "1px solid rgba(255,255,255,0.08)" }}>
                {s.icon} {sensorName(id)}
              </span>
            );
          })}
        </div>
      </div>

      {/* Unlocked texts */}
      {unlockedTexts.length > 0 && (
        <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{cm.card.unlocked}</div>
          {unlockedTexts.slice(0, 5).map((text, i) => (
            <div key={i} style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, background: "linear-gradient(90deg, #a855f7, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              ✨ {text}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>unforce-make.vercel.app</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>无为创造</span>
      </div>
    </div>
  );
}

interface GalleryItem {
  id: number;
  username: string;
  sensors: string[];
  easterEggs: string[];
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Gallery Marquee — horizontal scroll with vertical wave            */
/* ------------------------------------------------------------------ */

export function GalleryMarquee() {
  const { t } = useI18n();
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const serverUrl = getAgentServerUrl();

  useEffect(() => {
    fetch(`${serverUrl}/v1/gallery?limit=50`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setGallery(d.items || []))
      .catch(() => {});
  }, [serverUrl]);

  if (gallery.length === 0) return null;

  // Double for seamless loop
  const items = [...gallery, ...gallery];

  function sensorName(id: string) {
    return t.modules.items.find((m: { id: string }) => m.id === id)?.name ?? id;
  }

  return (
    <section className="relative overflow-hidden pb-16">
      <h2 className="mb-8 text-center font-display text-2xl font-semibold tracking-tight">
        {t.contextMachine.gallery.title}
      </h2>
      <div className="gallery-marquee flex gap-5">
        {items.map((item, i) => (
          <div
            key={`${item.id}-${i}`}
            className="gallery-card flex-none overflow-hidden rounded-xl border border-black/8 bg-white shadow-sm"
            style={{ width: 280, animationDelay: `${(i % gallery.length) * -0.4}s` }}
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

      <style jsx>{`
        .gallery-marquee {
          animation: gallery-scroll 40s linear infinite;
          width: max-content;
        }
        .gallery-marquee:hover {
          animation-play-state: paused;
        }
        @keyframes gallery-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .gallery-card {
          animation: card-wave 3s ease-in-out infinite;
        }
        @keyframes card-wave {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>
    </section>
  );
}
