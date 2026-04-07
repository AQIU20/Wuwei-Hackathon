"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { MagneticButton } from "./MagneticButton";
import { SpotlightCard } from "./SpotlightCard";

type CapabilityKey =
  | "environment"
  | "heart-rate"
  | "camera"
  | "voice"
  | "led-strip"
  | "haptics"
  | "posture"
  | "formaldehyde";

const onlineBlocks: { id: string; capability: CapabilityKey }[] = [
  { id: "env-001", capability: "environment" },
  { id: "hr-002", capability: "heart-rate" },
  { id: "hcho-01", capability: "formaldehyde" },
  { id: "vision-01", capability: "camera" },
  { id: "voice-01", capability: "voice" },
  { id: "light-03", capability: "led-strip" },
  { id: "vibe-02", capability: "haptics" },
  { id: "imu-01", capability: "posture" },
];

export function AgentPanel() {
  const { locale, t } = useI18n();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Re-mount useChat when locale changes so the system prompt stays in sync.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { locale },
      }),
    [locale],
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    transport,
    id: `room-${locale}`,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const isLoading = status === "streaming" || status === "submitted";

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
  }

  function sendSuggestion(s: string) {
    if (isLoading) return;
    sendMessage({ text: s });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-5">
      {/* Chat panel */}
      <SpotlightCard className="lg:col-span-3 p-0">
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
          <span className="pulse-dot block h-2 w-2 rounded-full bg-[color:var(--accent-2)]" />
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/50">
            {t.agent.header}
          </p>
          <span className="ml-auto font-mono text-[10px] text-white/30">
            {t.agent.ready}
          </span>
        </div>

        <div
          ref={scrollRef}
          className="flex max-h-[480px] min-h-[400px] flex-col gap-4 overflow-y-auto px-6 py-6"
        >
          {messages.length === 0 && (
            <Empty
              locale={locale}
              suggestions={t.agent.suggestions}
              onPick={sendSuggestion}
            />
          )}

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </AnimatePresence>

          {isLoading && <Thinking label={t.agent.thinking} />}

          {error && (
            <div className="rounded-xl border border-[color:var(--accent-3)]/40 bg-[color:var(--accent-3)]/10 px-4 py-3 text-sm text-white/80">
              {t.agent.errorFallback}
              <div className="mt-1 font-mono text-[10px] text-white/40">
                {error.message}
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={submit}
          className="flex items-center gap-3 border-t border-white/10 px-6 py-4"
        >
          <div className="flex flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/80 focus-within:border-white/30">
            <MicIcon />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.agent.placeholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
            />
          </div>
          {isLoading ? (
            <MagneticButton
              type="button"
              onClick={() => stop()}
              variant="ghost"
              className="!px-5 !py-2.5 text-xs"
            >
              {t.agent.stop}
            </MagneticButton>
          ) : (
            <MagneticButton type="submit" className="!px-5 !py-2.5 text-xs">
              {t.agent.send}
            </MagneticButton>
          )}
        </form>
      </SpotlightCard>

      {/* Side panel */}
      <div className="space-y-4 lg:col-span-2">
        <SpotlightCard>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            {t.agent.signals}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label={t.agent.metrics.temp} value="29.4°" accent="1" />
            <Metric label={t.agent.metrics.humidity} value="72%" accent="2" />
            <Metric label={t.agent.metrics.bpm} value="86" accent="3" />
            <Metric label={t.agent.metrics.hcho} value="0.09" accent="1" />
          </div>
        </SpotlightCard>

        <SpotlightCard>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            {t.agent.online}
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {onlineBlocks.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  <span className="pulse-dot block h-1.5 w-1.5 rounded-full bg-[color:var(--accent-2)]" />
                  <span className="font-mono text-xs text-white/80">
                    {b.id}
                  </span>
                </span>
                <span className="text-xs text-white/40">
                  {t.agent.blockLabels[b.capability]}
                </span>
              </li>
            ))}
          </ul>
        </SpotlightCard>
      </div>
    </div>
  );
}

type UIMessage = ReturnType<typeof useChat>["messages"][number];

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={
        isUser
          ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-white/10 px-5 py-3 text-right text-sm text-white/90 backdrop-blur-sm"
          : "max-w-[90%] rounded-2xl rounded-bl-md border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] px-5 py-4 text-sm leading-relaxed text-white/90"
      }
    >
      <div className="space-y-2">
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div key={i} className="whitespace-pre-wrap">
                {part.text}
              </div>
            );
          }
          if (part.type.startsWith("tool-")) {
            const tp = part as {
              type: string;
              state?: string;
              input?: unknown;
              output?: unknown;
            };
            const toolName = part.type.replace("tool-", "");
            return (
              <div
                key={i}
                className="rounded-lg border border-[color:var(--accent-1)]/40 bg-[color:var(--accent-1)]/10 px-3 py-2 font-mono text-[11px]"
              >
                <div className="text-[color:var(--accent-1)]">
                  → {toolName}
                  {tp.state ? ` · ${tp.state}` : ""}
                </div>
                {tp.output !== undefined && (
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] text-white/60">
                    {JSON.stringify(tp.output, null, 2)}
                  </pre>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>
    </motion.div>
  );
}

function Empty({
  locale,
  suggestions,
  onPick,
}: {
  locale: "en" | "zh";
  suggestions: readonly string[];
  onPick: (s: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-5 py-8">
      <div className="font-display text-xl leading-snug text-white/80">
        {locale === "zh"
          ? "你好呀 👋 让我帮你照看这个房间。"
          : "Hi there 👋 let me keep an eye on your room."}
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/70 transition-all duration-300 hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Thinking({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] text-white/40">
      <span className="inline-flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="inline-block h-1 w-1 rounded-full bg-white/60"
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}
      </span>
      {label}
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "1" | "2" | "3";
}) {
  const color =
    accent === "1"
      ? "var(--accent-1)"
      : accent === "2"
        ? "var(--accent-2)"
        : "var(--accent-3)";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
      <div
        className="mt-1 font-display text-2xl font-medium"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect
        x="9"
        y="3"
        width="6"
        height="12"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
