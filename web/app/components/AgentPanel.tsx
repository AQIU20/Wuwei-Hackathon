"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { getAgentServerUrl, getHardwareWebSocketUrl } from "@/lib/agent-server";
import { useI18n } from "@/lib/i18n";
import { MagneticButton } from "./MagneticButton";
import { SpotlightCard } from "./SpotlightCard";

type Locale = "en" | "zh";

type Message = {
  content?: string;
  id: string;
  parts?: MessagePart[];
  role: "assistant" | "user";
};

type MessagePart =
  | { text: string; type: "text" }
  | { text: string; type: "thinking" }
  | {
      id: string;
      input?: unknown;
      output?: unknown;
      state?: "done" | "running";
      toolName: string;
      type: "tool";
    };

type SessionResponse = {
  session: {
    id: string;
  };
  transcript: Array<{
    content?: string;
    role: "assistant" | "user";
    blocks?: Array<
      | { content: string; type: "text" | "thinking" }
      | {
          args?: Record<string, unknown>;
          id: string;
          isError?: boolean;
          name: string;
          result?: string;
          status: "done" | "running";
          type: "tool";
        }
    >;
  }>;
};

type HardwareSnapshot = {
  blocks: Array<{
    actuator?: Record<string, unknown>;
    battery: number;
    block_id: string;
    capability: string;
    latest?: Record<string, number>;
    status: "offline" | "online";
    type: "actuator" | "sensor" | "stream";
  }>;
  metrics: {
    bpm: number | null;
    hcho: number | null;
    humidity: number | null;
    temp: number | null;
  };
};

const AGENT_SERVER_URL = getAgentServerUrl();

export function AgentPanel() {
  const { locale, t } = useI18n();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [snapshot, setSnapshot] = useState<HardwareSnapshot | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "streaming" | "submitted">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    let cancelled = false;

    async function initSession() {
      try {
        const res = await fetch(`${AGENT_SERVER_URL}/v1/chat/sessions`, {
          method: "POST",
        });

        if (!res.ok) {
          throw new Error("Failed to initialize agent session");
        }

        const data = (await res.json()) as SessionResponse;
        if (cancelled) return;

        setSessionId(data.session.id);
        setMessages(data.transcript.map(fromTranscriptMessage));
      } catch (nextError) {
        if (cancelled) return;
        setError(
          nextError instanceof Error ? nextError.message : t.agent.errorFallback,
        );
      }
    }

    void initSession();

    return () => {
      cancelled = true;
    };
  }, [t.agent.errorFallback]);

  useEffect(() => {
    const ws = new WebSocket(getHardwareWebSocketUrl());

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as {
          payload?: HardwareSnapshot;
          type: string;
        };

        if (
          (payload.type === "snapshot" || payload.type === "update") &&
          payload.payload
        ) {
          setSnapshot(payload.payload);
        }
      } catch {
        // Ignore invalid websocket payloads from other clients.
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const isLoading = status === "streaming" || status === "submitted";

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading || !sessionId) return;
    setError(null);
    setInput("");
    void streamPrompt(sessionId, text, locale);
  }

  function sendSuggestion(s: string) {
    if (isLoading || !sessionId) return;
    setError(null);
    void streamPrompt(sessionId, s, locale);
  }

  async function streamPrompt(
    currentSessionId: string,
    text: string,
    currentLocale: Locale,
  ) {
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setStatus("submitted");

    try {
      const res = await fetch(
        `${AGENT_SERVER_URL}/v1/chat/sessions/${currentSessionId}/messages`,
        {
          body: JSON.stringify({ locale: currentLocale, text }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: controller.signal,
        },
      );

      if (!res.ok || !res.body) {
        throw new Error("Failed to stream agent response");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          applyServerEvent(JSON.parse(line) as Record<string, unknown>);
        }
      }
    } catch (nextError) {
      if (
        nextError instanceof Error &&
        nextError.name === "AbortError"
      ) {
        return;
      }

      setError(
        nextError instanceof Error ? nextError.message : t.agent.errorFallback,
      );
      setStatus("idle");
    } finally {
      requestAbortRef.current = null;
    }
  }

  function applyServerEvent(event: Record<string, unknown>) {
    switch (event.type) {
      case "user_message": {
        const message = event.message as Message | undefined;
        if (!message) return;
        setMessages((current) => [...current, message]);
        setStatus("streaming");
        return;
      }
      case "assistant_start": {
        const messageId = String(event.messageId);
        setMessages((current) => [
          ...current,
          { id: messageId, parts: [], role: "assistant" },
        ]);
        setStatus("streaming");
        return;
      }
      case "text_delta": {
        setMessages((current) =>
          appendAssistantPart(current, String(event.messageId), {
            text: String(event.delta ?? ""),
            type: "text",
          }),
        );
        setStatus("streaming");
        return;
      }
      case "thinking_delta": {
        setMessages((current) =>
          appendAssistantPart(current, String(event.messageId), {
            text: String(event.delta ?? ""),
            type: "thinking",
          }),
        );
        setStatus("streaming");
        return;
      }
      case "tool_start": {
        setMessages((current) =>
          appendAssistantPart(current, String(event.messageId), {
            id: String(event.id),
            input: event.args,
            state: "running",
            toolName: String(event.name),
            type: "tool",
          }),
        );
        return;
      }
      case "tool_end": {
        setMessages((current) =>
          appendAssistantPart(current, String(event.messageId), {
            id: String(event.id),
            output: event.result,
            state: "done",
            toolName: String(event.name),
            type: "tool",
          }),
        );
        return;
      }
      case "complete":
        setStatus("idle");
        return;
      case "error":
        setError(String(event.message ?? t.agent.errorFallback));
        setStatus("idle");
        return;
      default:
        return;
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-5">
      {/* Chat panel */}
      <SpotlightCard className="lg:col-span-3 p-0">
        <div className="flex items-center gap-3 border-b border-black/10 px-6 py-4">
          <span className="pulse-dot block h-2 w-2 rounded-full bg-[color:var(--accent-2)]" />
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-black/50">
            {t.agent.header}
          </p>
          <span className="ml-auto font-mono text-[10px] text-black/30">
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
            <div className="rounded-xl border border-[color:var(--accent-3)]/40 bg-[color:var(--accent-3)]/10 px-4 py-3 text-sm text-black/80">
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={submit}
          className="flex items-center gap-3 border-t border-black/10 px-6 py-4"
        >
          <div className="flex flex-1 items-center gap-2 rounded-full border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm text-black/80 focus-within:border-black/30">
            <MicIcon />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.agent.placeholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-black/30"
            />
          </div>
          {isLoading ? (
            <MagneticButton
              type="button"
              onClick={() => {
                requestAbortRef.current?.abort();
                if (sessionId) {
                  void fetch(
                    `${AGENT_SERVER_URL}/v1/chat/sessions/${sessionId}/abort`,
                    { method: "POST" },
                  );
                }
                setStatus("idle");
              }}
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
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40">
            {t.agent.signals}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric
              label={t.agent.metrics.temp}
              value={formatMetric(snapshot?.metrics.temp, "°C")}
              accent="1"
            />
            <Metric
              label={t.agent.metrics.humidity}
              value={formatMetric(snapshot?.metrics.humidity, "%")}
              accent="2"
            />
            <Metric
              label={t.agent.metrics.bpm}
              value={formatMetric(snapshot?.metrics.bpm)}
              accent="3"
            />
            <Metric
              label={t.agent.metrics.hcho}
              value={formatMetric(snapshot?.metrics.hcho, "mg")}
              accent="1"
            />
          </div>
        </SpotlightCard>

        {/* Proactive Insights */}
        <SpotlightCard>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40">
            {t.agent.proactive.title}
          </p>
          <ProactiveAlerts alerts={t.agent.proactive.alerts} onAsk={sendSuggestion} />
        </SpotlightCard>

        <SpotlightCard>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40">
            {t.agent.online}
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {(snapshot?.blocks ?? []).map((b) => (
              <li
                key={b.block_id}
                className="flex items-center justify-between rounded-lg border border-black/5 bg-black/[0.02] px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`block h-1.5 w-1.5 rounded-full ${
                      b.status === "online"
                        ? "pulse-dot bg-[color:var(--accent-2)]"
                        : "bg-black/20"
                    }`}
                  />
                  <span className="font-mono text-xs text-black/80">
                    {b.block_id}
                  </span>
                </span>
                <span className="text-xs text-black/40">
                  {formatCapabilityLabel(b.capability, locale)}
                </span>
              </li>
            ))}
          </ul>
        </SpotlightCard>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  // Collect thinking parts into one collapsed block
  const thinkingParts = (message.parts ?? []).filter((p) => p.type === "thinking");
  const thinkingText = thinkingParts.map((p) => (p as { text: string }).text).join("");
  const otherParts = (message.parts ?? []).filter((p) => p.type !== "thinking");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={
        isUser
          ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-black/10 px-5 py-3 text-right text-sm text-black/90 backdrop-blur-sm"
          : "max-w-[90%] rounded-2xl rounded-bl-md border border-black/10 bg-gradient-to-br from-black/[0.06] to-black/[0.02] px-5 py-4 text-sm leading-relaxed text-black/90"
      }
    >
      <div className="space-y-2">
        {/* Collapsed thinking */}
        {!isUser && thinkingText && <CollapsedThinking text={thinkingText} />}

        {message.content && (
          isUser
            ? <div className="whitespace-pre-wrap">{message.content}</div>
            : <div className="agent-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
        )}
        {otherParts.map((part, i) => {
          if (part.type === "text") {
            return isUser ? (
              <div key={i} className="whitespace-pre-wrap">{part.text}</div>
            ) : (
              <div key={i} className="agent-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text) }} />
            );
          }
          if (part.type === "tool") {
            if (part.toolName === "memory_recall" && part.state === "done" && part.output) {
              return <MemoryRecallCard key={i} output={part.output} />;
            }
            return <CollapsedTool key={i} part={part} />;
          }
          return null;
        })}
      </div>
    </motion.div>
  );
}

function CollapsedThinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const preview = text.slice(0, 60).replace(/\n/g, " ").trim();
  return (
    <div
      className="flex items-start gap-1.5 cursor-pointer select-none group"
      onClick={() => setOpen(!open)}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        className={`mt-0.5 shrink-0 text-black/30 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      >
        <path d="M3 1.5L7 5L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {open ? (
        <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-black/35 italic">
          {text}
        </div>
      ) : (
        <span className="text-[11px] text-black/30 italic group-hover:text-black/45 transition-colors">
          {preview}{text.length > 60 ? "…" : ""}
        </span>
      )}
    </div>
  );
}

function CollapsedTool({ part }: { part: Extract<MessagePart, { type: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const statusIcon = part.state === "done" ? "✓" : "⟳";
  return (
    <div
      className="rounded-lg border border-[color:var(--accent-1)]/30 bg-[color:var(--accent-1)]/5 px-3 py-1.5 font-mono text-[11px] cursor-pointer select-none"
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-center gap-1.5 text-[color:var(--accent-1)]/70">
        <svg
          width="8"
          height="8"
          viewBox="0 0 10 10"
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        >
          <path d="M3 1.5L7 5L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{statusIcon} {part.toolName}</span>
        <span className="text-black/25">{part.state}</span>
      </div>
      {open && part.output !== undefined && (
        <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap text-[10px] text-black/50 border-t border-[color:var(--accent-1)]/15 pt-1.5">
          {typeof part.output === "string"
            ? part.output
            : JSON.stringify(part.output, null, 2)}
        </pre>
      )}
    </div>
  );
}

/** Block ID patterns for hardware module highlighting */
const BLOCK_ID_RE = /\b(heart_\d+|imu_\d+|env_\d+|air_\d+|cam_\d+|light_\d+|mic_\d+|spk_\d+|vib_\d+|hcho_\d+)\b/g;

/** Lightweight markdown → HTML (no deps needed) */
function renderMarkdown(src: string): string {
  // Protect code blocks first — extract and replace with placeholders
  const codeBlocks: string[] = [];
  let text = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(code.trimEnd())}</code></pre>`);
    return `\x00CB${idx}\x00`;
  });

  const inlineCodes: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00IC${idx}\x00`;
  });

  // Now escape the rest
  let html = escapeHtml(text);

  // Bold (must come before italic) — allow multiline
  html = html.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
  // Italic — single * not adjacent to another *
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  // Unordered lists — dash only (avoid eating * italic lines)
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>[\s\S]*?<\/li>\n?)+)/g, "<ul>$1</ul>");
  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  // HR
  html = html.replace(/^---$/gm, "<hr/>");
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Hardware block IDs → highlighted chip
  html = html.replace(BLOCK_ID_RE, '<span class="hw-block">$1</span>');

  // Paragraphs: collapse 2+ newlines into a small break (not a full paragraph gap)
  html = html.replace(/\n{2,}/g, '<br/><br/>');
  // Single newlines → <br>
  html = html.replace(/\n/g, "<br/>");

  // Restore code blocks and inline codes
  html = html.replace(/\x00CB(\d+)\x00/g, (_m, idx) => codeBlocks[Number(idx)]);
  html = html.replace(/\x00IC(\d+)\x00/g, (_m, idx) => inlineCodes[Number(idx)]);

  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
      <div className="font-display text-xl leading-snug text-black/80">
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
            className="rounded-full border border-black/10 bg-black/[0.03] px-4 py-2 text-xs text-black/70 transition-all duration-300 hover:border-black/30 hover:bg-black/[0.08] hover:text-gray-900"
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
    <div className="flex items-center gap-2 font-mono text-[11px] text-black/40">
      <span className="inline-flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="inline-block h-1 w-1 rounded-full bg-black/60"
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
    <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">
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

function ProactiveAlerts({
  alerts,
  onAsk,
}: {
  alerts: readonly { icon: string; text: string; severity: string }[];
  onAsk: (s: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= alerts.length) return;
    const timer = setTimeout(
      () => setVisibleCount((c) => c + 1),
      visibleCount === 0 ? 2000 : 4000,
    );
    return () => clearTimeout(timer);
  }, [visibleCount, alerts.length]);

  const severityStyles: Record<string, { border: string; bg: string; dot: string }> = {
    warn: { border: "border-amber-400/40", bg: "bg-amber-50", dot: "bg-amber-400" },
    info: { border: "border-blue-400/40", bg: "bg-blue-50", dot: "bg-blue-400" },
    action: { border: "border-emerald-400/40", bg: "bg-emerald-50", dot: "bg-emerald-400" },
  };

  const iconMap: Record<string, React.ReactNode> = {
    heart: <HeartAlertIcon />,
    air: <AirAlertIcon />,
    posture: <PostureAlertIcon />,
    sleep: <SleepAlertIcon />,
    mood: <MoodAlertIcon />,
  };

  return (
    <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto">
      <AnimatePresence initial={false}>
        {alerts.slice(0, visibleCount).map((a, i) => {
          const style = severityStyles[a.severity] ?? severityStyles.info;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className={`rounded-xl border ${style.border} ${style.bg} px-3 py-2.5 cursor-pointer transition-all hover:shadow-sm`}
              onClick={() => onAsk(a.text)}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-black/50">{iconMap[a.icon]}</span>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-black/35">
                      {a.severity === "warn" ? "warning" : a.severity === "action" ? "auto-action" : "insight"}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-black/70">{a.text}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {visibleCount === 0 && (
        <div className="flex items-center gap-2 py-3 font-mono text-[11px] text-black/30">
          <motion.span
            className="inline-block h-1.5 w-1.5 rounded-full bg-black/20"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          analyzing patterns…
        </div>
      )}
    </div>
  );
}

function HeartAlertIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path d="M12 21C12 21 4 14.36 4 8.5C4 5.42 6.42 3 9.5 3C11.24 3 12 4 12 4S12.76 3 14.5 3C17.58 3 20 5.42 20 8.5C20 14.36 12 21 12 21Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function AirAlertIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path d="M3 8h10a3 3 0 1 0-3-3M4 14h12a3 3 0 1 1-3 3M2 11h16a3 3 0 1 0-3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function PostureAlertIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="5" r="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l-3 5M12 12l3 5M8 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SleepAlertIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function MoodAlertIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

function MemoryRecallCard({ output }: { output: unknown }) {
  const memories = parseMemoryOutput(output);
  if (memories.length === 0) {
    return (
      <div className="rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 font-mono text-[11px] text-black/40">
        No memories found
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {memories.map((m, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.3 }}
          className="rounded-xl border border-purple-300/40 bg-gradient-to-br from-purple-50 to-indigo-50 px-4 py-3"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-purple-500">
              <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7Z" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10 21h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="font-mono text-[9px] uppercase tracking-wider text-purple-500/70">
              Memory
            </span>
            {m.timestamp && (
              <span className="ml-auto font-mono text-[9px] text-black/25">{m.timestamp}</span>
            )}
          </div>
          {m.label && (
            <div className="font-display text-xs font-medium text-black/70 mb-1">{m.label}</div>
          )}
          <div className="text-[11px] leading-relaxed text-black/60">{m.text}</div>
        </motion.div>
      ))}
    </div>
  );
}

type MemoryEntry = { label?: string; text: string; timestamp?: string };

function parseMemoryOutput(output: unknown): MemoryEntry[] {
  if (typeof output === "string") {
    if (!output.trim()) return [];
    // Try JSON parse first
    try {
      const parsed = JSON.parse(output);
      return parseMemoryOutput(parsed);
    } catch {
      // Plain text - split by double newlines as separate memories
      return output.split(/\n{2,}/).filter(Boolean).map((t) => ({ text: t.trim() }));
    }
  }
  if (Array.isArray(output)) {
    return output.map((item) => {
      if (typeof item === "string") return { text: item };
      const obj = item as Record<string, unknown>;
      return {
        label: (obj.label ?? obj.title ?? obj.key ?? obj.name) as string | undefined,
        text: String(obj.text ?? obj.content ?? obj.value ?? obj.summary ?? JSON.stringify(obj)),
        timestamp: (obj.timestamp ?? obj.date ?? obj.time) as string | undefined,
      };
    });
  }
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    // Could be { memories: [...] } or { results: [...] }
    const inner = obj.memories ?? obj.results ?? obj.data ?? obj.items;
    if (Array.isArray(inner)) return parseMemoryOutput(inner);
    return [{ text: JSON.stringify(output, null, 2) }];
  }
  return [];
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

function fromTranscriptMessage(message: SessionResponse["transcript"][number]): Message {
  return {
    content: message.content,
    id: crypto.randomUUID(),
    parts:
      message.blocks?.map((block) => {
        if (block.type === "tool") {
          return {
            id: block.id,
            input: block.args,
            output: block.result,
            state: block.status,
            toolName: block.name,
            type: "tool" as const,
          };
        }

        return {
          text: block.content,
          type: block.type,
        };
      }) ?? undefined,
    role: message.role,
  };
}

function appendAssistantPart(
  messages: Message[],
  messageId: string,
  nextPart: MessagePart,
) {
  return messages.map((message) => {
    if (message.id !== messageId) return message;

    const parts = [...(message.parts ?? [])];

    if (nextPart.type === "text" || nextPart.type === "thinking") {
      const lastPart = parts.at(-1);
      if (
        lastPart &&
        (lastPart.type === "text" || lastPart.type === "thinking") &&
        lastPart.type === nextPart.type
      ) {
        lastPart.text += nextPart.text;
        return { ...message, parts };
      }
    }

    if (nextPart.type === "tool") {
      const toolIndex = parts.findIndex(
        (part) => part.type === "tool" && part.id === nextPart.id,
      );

      if (toolIndex >= 0) {
        const current = parts[toolIndex] as Extract<MessagePart, { type: "tool" }>;
        parts[toolIndex] = { ...current, ...nextPart };
        return { ...message, parts };
      }
    }

    parts.push(nextPart);
    return { ...message, parts };
  });
}

function formatMetric(value: number | null | undefined, suffix = "") {
  if (value == null) return "--";
  return `${value.toFixed(2).replace(/\.00$/, "")}${suffix}`;
}

function formatCapabilityLabel(capability: string, locale: Locale) {
  const labels: Record<string, { en: string; zh: string }> = {
    camera: { en: "camera", zh: "摄像头" },
    formaldehyde: { en: "formaldehyde", zh: "甲醛" },
    heart_rate: { en: "heart rate", zh: "心率" },
    humidity: { en: "humidity", zh: "湿度" },
    light: { en: "light", zh: "灯光" },
    microphone: { en: "microphone", zh: "麦克风" },
    temperature: { en: "temperature", zh: "温度" },
    vibration: { en: "vibration", zh: "振动" },
    voice: { en: "voice", zh: "语音" },
    imu: { en: "imu", zh: "姿态" },
  };

  const label = labels[capability];
  return label ? label[locale] : capability.replaceAll("_", " ");
}
