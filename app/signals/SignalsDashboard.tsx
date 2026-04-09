"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { SpotlightCard } from "../components/SpotlightCard";

/* ── Mock signal types ───────────────────────────────────── */

interface SensorBlock {
  id: string;
  name: string;
  nameZh: string;
  capability: string;
  icon: string;
  status: "online" | "offline";
  chip: string;
}

interface SignalReading {
  ts: number;
  value: number;
}

interface SensorSignal {
  block: SensorBlock;
  unit: string;
  label: string;
  labelZh: string;
  current: number;
  min: number;
  max: number;
  history: SignalReading[];
  color: string;
}

/* ── Mock blocks ─────────────────────────────────────────── */

const MOCK_BLOCKS: SensorBlock[] = [
  { id: "env_01", name: "Env Sensor", nameZh: "环境传感器", capability: "environment", icon: "temp", status: "online", chip: "ESP32-C3" },
  { id: "hr_01", name: "Heart Rate", nameZh: "心率传感器", capability: "heart_rate_oximeter", icon: "heart", status: "online", chip: "ESP32-S3" },
  { id: "cam_01", name: "Camera Hub", nameZh: "相机模块", capability: "camera", icon: "camera", status: "online", chip: "ESP32-S3" },
  { id: "imu_01", name: "IMU Tracker", nameZh: "姿态追踪", capability: "imu", icon: "motion", status: "online", chip: "ESP32-C3" },
  { id: "gas_01", name: "Air Quality", nameZh: "空气质量", capability: "air_quality", icon: "air", status: "online", chip: "ESP32-C3" },
  { id: "vad_01", name: "Voice Detect", nameZh: "语音检测", capability: "microphone", icon: "mic", status: "online", chip: "ESP32-S3" },
];

/* ── Signal generator ────────────────────────────────────── */

function generateHistory(base: number, variance: number, len: number): SignalReading[] {
  const now = Date.now();
  return Array.from({ length: len }, (_, i) => ({
    ts: now - (len - i) * 1000,
    value: base + (Math.random() - 0.5) * variance * 2,
  }));
}

function initSignals(): SensorSignal[] {
  return [
    { block: MOCK_BLOCKS[0], unit: "°C", label: "Temperature", labelZh: "温度", current: 24.3, min: 18, max: 35, history: generateHistory(24.3, 1.5, 60), color: "#ff6c37" },
    { block: MOCK_BLOCKS[0], unit: "%", label: "Humidity", labelZh: "湿度", current: 58, min: 20, max: 100, history: generateHistory(58, 5, 60), color: "#3b82f6" },
    { block: MOCK_BLOCKS[1], unit: "bpm", label: "Heart Rate", labelZh: "心率", current: 72, min: 40, max: 180, history: generateHistory(72, 8, 60), color: "#ef4444" },
    { block: MOCK_BLOCKS[1], unit: "%", label: "SpO2", labelZh: "血氧", current: 98, min: 85, max: 100, history: generateHistory(98, 0.8, 60), color: "#8b5cf6" },
    { block: MOCK_BLOCKS[4], unit: "ppb", label: "HCHO", labelZh: "甲醛", current: 23, min: 0, max: 200, history: generateHistory(23, 6, 60), color: "#10b981" },
    { block: MOCK_BLOCKS[4], unit: "AQI", label: "Air Quality", labelZh: "空气指数", current: 42, min: 0, max: 300, history: generateHistory(42, 10, 60), color: "#06b6d4" },
    { block: MOCK_BLOCKS[3], unit: "°/s", label: "Gyro X", labelZh: "陀螺仪 X", current: 0.3, min: -180, max: 180, history: generateHistory(0.3, 15, 60), color: "#f59e0b" },
    { block: MOCK_BLOCKS[5], unit: "dB", label: "Noise Level", labelZh: "噪声", current: 35, min: 0, max: 120, history: generateHistory(35, 8, 60), color: "#ec4899" },
  ];
}

/* ── Mini sparkline ──────────────────────────────────────── */

function Sparkline({ data, color, min, max }: { data: SignalReading[]; color: string; min: number; max: number }) {
  const w = 200;
  const h = 48;
  const range = max - min || 1;
  const points = data.slice(-40);

  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.value - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaD = `${d} L${w},${h} L0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color.replace("#", "")})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Latest point dot */}
      {points.length > 0 && (() => {
        const last = points[points.length - 1];
        const cx = w;
        const cy = h - ((last.value - min) / range) * h;
        return <circle cx={cx} cy={cy} r="2.5" fill={color} />;
      })()}
    </svg>
  );
}

/* ── Event log ───────────────────────────────────────────── */

interface EventLogEntry {
  id: string;
  ts: number;
  blockName: string;
  type: "data" | "alert" | "status";
  message: string;
}

const EVENT_TEMPLATES = [
  { blockIdx: 0, type: "data" as const, msg: "Temp: {v}°C", msgZh: "温度: {v}°C" },
  { blockIdx: 0, type: "data" as const, msg: "Humidity: {v}%", msgZh: "湿度: {v}%" },
  { blockIdx: 1, type: "data" as const, msg: "BPM: {v}", msgZh: "心率: {v}" },
  { blockIdx: 1, type: "alert" as const, msg: "SpO2 drop detected: {v}%", msgZh: "血氧下降: {v}%" },
  { blockIdx: 2, type: "status" as const, msg: "Frame captured, analyzing...", msgZh: "帧已捕获，分析中…" },
  { blockIdx: 3, type: "data" as const, msg: "Motion detected: {v}°/s", msgZh: "运动检测: {v}°/s" },
  { blockIdx: 4, type: "data" as const, msg: "HCHO: {v} ppb", msgZh: "甲醛: {v} ppb" },
  { blockIdx: 5, type: "alert" as const, msg: "Wake word detected!", msgZh: "唤醒词已检测！" },
  { blockIdx: 4, type: "data" as const, msg: "AQI: {v}", msgZh: "空气指数: {v}" },
];

/* ── Block icon ──────────────────────────────────────────── */

function BlockIcon({ type, className }: { type: string; className?: string }) {
  const c = className ?? "w-5 h-5";
  switch (type) {
    case "temp":
      return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 9V3m0 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /><path d="M12 3a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0V4a1 1 0 0 1 1-1Z" /></svg>;
    case "heart":
      return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" /></svg>;
    case "camera":
      return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>;
    case "motion":
      return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM4 17l3-3 2 2 4-4 2 2" /><path d="M19 7l-2 6-4-2-3 4-2-2-4 4" /></svg>;
    case "air":
      return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" /></svg>;
    case "mic":
      return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>;
    default:
      return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="10" /></svg>;
  }
}

/* ── Status indicator ────────────────────────────────────── */

function StatusDot({ status }: { status: "online" | "offline" }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${status === "online" ? "bg-emerald-500 pulse-dot" : "bg-gray-300"}`} />
  );
}

/* ── Camera mock ─────────────────────────────────────────── */

function CameraFeed() {
  const { locale } = useI18n();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => f + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const scenes = [
    { en: "Person sitting at desk, typing", zh: "一人坐在桌前打字" },
    { en: "Room empty, lights dimmed", zh: "房间空旷，灯光昏暗" },
    { en: "Two people in conversation", zh: "两人正在交谈" },
    { en: "Person walking towards door", zh: "一人走向门口" },
  ];
  const scene = scenes[frame % scenes.length];

  return (
    <SpotlightCard className="col-span-full lg:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BlockIcon type="camera" className="w-5 h-5 text-[color:var(--accent-1)]" />
          <span className="font-display text-sm font-medium text-gray-900">
            {locale === "zh" ? "相机视觉" : "Camera Vision"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot status="online" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-black/40">Live</span>
        </div>
      </div>
      <div className="relative rounded-xl bg-gray-900 overflow-hidden" style={{ aspectRatio: "16/9" }}>
        {/* Simulated camera feed with scanline effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900">
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
          }} />
          {/* Fake scene visualization */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              key={frame}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full bg-red-500 pulse-dot" />
                <span className="font-mono text-[11px] text-white/70">REC</span>
              </div>
              <p className="mt-4 font-mono text-xs text-white/50 max-w-[200px]">
                {locale === "zh" ? scene.zh : scene.en}
              </p>
            </motion.div>
          </div>
          {/* Timestamp overlay */}
          <div className="absolute bottom-2 right-3 font-mono text-[10px] text-white/30">
            {new Date().toLocaleTimeString()} | Frame #{frame}
          </div>
          <div className="absolute top-2 left-3 font-mono text-[10px] text-white/30">
            cam_01 | ESP32-S3 | 640x480
          </div>
        </div>
      </div>
      <p className="mt-2 font-mono text-[10px] text-black/40">
        AI Analysis: {locale === "zh" ? scene.zh : scene.en}
      </p>
    </SpotlightCard>
  );
}

/* ── Voice activity mock ─────────────────────────────────── */

function VoiceActivity() {
  const { locale } = useI18n();
  const [bars, setBars] = useState<number[]>(Array(24).fill(0.1));

  useEffect(() => {
    const id = setInterval(() => {
      setBars(prev =>
        prev.map(() => 0.05 + Math.random() * 0.95)
      );
    }, 150);
    return () => clearInterval(id);
  }, []);

  return (
    <SpotlightCard>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BlockIcon type="mic" className="w-5 h-5 text-[color:var(--accent-1)]" />
          <span className="font-display text-sm font-medium text-gray-900">
            {locale === "zh" ? "语音活动" : "Voice Activity"}
          </span>
        </div>
        <span className="font-mono text-[10px] text-emerald-500 uppercase tracking-wider">Listening</span>
      </div>
      <div className="flex items-end justify-between gap-[2px] h-16">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-full bg-[color:var(--accent-1)]"
            animate={{ height: `${h * 100}%`, opacity: 0.3 + h * 0.7 }}
            transition={{ duration: 0.1 }}
          />
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] text-black/40 truncate">
        {locale === "zh" ? '检测中… "帮我把客厅灯调亮一点"' : 'Detecting… "Turn the living room lights up"'}
      </p>
    </SpotlightCard>
  );
}

/* ── Main dashboard ──────────────────────────────────────── */

export function SignalsDashboard() {
  const { locale } = useI18n();
  const [signals, setSignals] = useState<SensorSignal[]>(initSignals);
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const eventIdRef = useRef(0);

  // Simulate real-time signal updates
  useEffect(() => {
    const id = setInterval(() => {
      setSignals(prev =>
        prev.map(s => {
          const drift = (Math.random() - 0.5) * (s.max - s.min) * 0.03;
          const newVal = Math.max(s.min, Math.min(s.max, s.current + drift));
          const newPoint: SignalReading = { ts: Date.now(), value: newVal };
          return {
            ...s,
            current: newVal,
            history: [...s.history.slice(-59), newPoint],
          };
        })
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Simulate event log
  const addEvent = useCallback(() => {
    const tmpl = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
    const block = MOCK_BLOCKS[tmpl.blockIdx];
    const v = (Math.random() * 100).toFixed(1);
    const msg = locale === "zh" ? tmpl.msgZh.replace("{v}", v) : tmpl.msg.replace("{v}", v);
    eventIdRef.current += 1;
    const entry: EventLogEntry = {
      id: `evt-${eventIdRef.current}`,
      ts: Date.now(),
      blockName: locale === "zh" ? block.nameZh : block.name,
      type: tmpl.type,
      message: msg,
    };
    setEvents(prev => [entry, ...prev].slice(0, 30));
  }, [locale]);

  useEffect(() => {
    const id = setInterval(addEvent, 1500 + Math.random() * 2000);
    // Add a few initial events
    for (let i = 0; i < 5; i++) setTimeout(addEvent, i * 300);
    return () => clearInterval(id);
  }, [addEvent]);

  return (
    <section className="relative z-10 mx-auto max-w-7xl px-6 pt-8 pb-20 lg:px-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-black/[0.03] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-black/60 backdrop-blur-md mb-4">
          <span className="pulse-dot block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {locale === "zh" ? "实时监控" : "Real-time Monitor"}
        </div>
        <h1 className="font-display text-[clamp(1.75rem,4vw,3rem)] font-medium leading-[1.05] tracking-[-0.03em] text-gray-900">
          {locale === "zh" ? "实时信号面板" : "Live Signal Dashboard"}
        </h1>
        <p className="mt-2 text-sm text-black/50 max-w-xl">
          {locale === "zh"
            ? "所有硬件模块的实时传感器数据流。通过 aihub 协议，Agent 可以感知物理世界的每一个信号。"
            : "Real-time sensor data streams from all hardware blocks. Through the aihub protocol, Agents perceive every signal in the physical world."}
        </p>
      </motion.div>

      {/* Block status bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="mb-6 flex flex-wrap gap-3"
      >
        {MOCK_BLOCKS.map(b => (
          <div
            key={b.id}
            className="inline-flex items-center gap-2 rounded-xl border border-black/8 bg-black/[0.02] px-3 py-2 text-xs"
          >
            <BlockIcon type={b.icon} className="w-4 h-4 text-[color:var(--accent-1)]" />
            <span className="font-medium text-gray-700">
              {locale === "zh" ? b.nameZh : b.name}
            </span>
            <StatusDot status={b.status} />
            <span className="font-mono text-[10px] text-black/30">{b.chip}</span>
          </div>
        ))}
      </motion.div>

      {/* Signal grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {signals.map((s, i) => (
          <motion.div
            key={`${s.block.id}-${s.label}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.05, duration: 0.5 }}
          >
            <SpotlightCard>
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-black/40">
                  {locale === "zh" ? s.labelZh : s.label}
                </span>
                <span className="font-mono text-[10px] text-black/30">{s.block.id}</span>
              </div>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="font-display text-2xl font-medium" style={{ color: s.color }}>
                  {s.current.toFixed(s.unit === "bpm" || s.unit === "AQI" || s.unit === "ppb" || s.unit === "dB" ? 0 : 1)}
                </span>
                <span className="font-mono text-xs text-black/40">{s.unit}</span>
              </div>
              <Sparkline data={s.history} color={s.color} min={s.min} max={s.max} />
              <div className="flex justify-between mt-1 font-mono text-[9px] text-black/25">
                <span>{s.min}{s.unit}</span>
                <span>{s.max}{s.unit}</span>
              </div>
            </SpotlightCard>
          </motion.div>
        ))}
      </div>

      {/* Camera + Voice + Event Log */}
      <div className="grid gap-4 lg:grid-cols-4">
        <CameraFeed />
        <VoiceActivity />

        {/* Event log */}
        <SpotlightCard className="lg:col-span-1 max-h-[400px] flex flex-col">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <span className="font-display text-sm font-medium text-gray-900">
              {locale === "zh" ? "事件日志" : "Event Log"}
            </span>
            <span className="font-mono text-[10px] text-black/30">
              {events.length} {locale === "zh" ? "条" : "events"}
            </span>
          </div>
          <div className="overflow-y-auto flex-1 space-y-1.5 pr-1 -mr-1">
            {events.map(evt => (
              <motion.div
                key={evt.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-2 rounded-lg bg-black/[0.02] px-2.5 py-1.5"
              >
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                  evt.type === "alert" ? "bg-red-400" : evt.type === "status" ? "bg-blue-400" : "bg-emerald-400"
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-medium text-black/60 truncate">
                      {evt.blockName}
                    </span>
                    <span className="font-mono text-[9px] text-black/25">
                      {new Date(evt.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-black/45 truncate">{evt.message}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </SpotlightCard>
      </div>

      {/* MQTT topic hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="mt-8 rounded-xl border border-black/8 bg-black/[0.02] px-5 py-4"
      >
        <p className="font-mono text-[11px] text-black/40 mb-2">
          {locale === "zh" ? "MQTT 订阅主题示例" : "MQTT Topic Examples"}
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            "aihub/env_01/sensor/environment",
            "aihub/hr_01/sensor/heart_rate",
            "aihub/cam_01/event/frame",
            "aihub/imu_01/sensor/motion",
            "aihub/gas_01/sensor/air_quality",
            "aihub/vad_01/event/wakeword",
          ].map(topic => (
            <code key={topic} className="hw-block text-[10px]">{topic}</code>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
