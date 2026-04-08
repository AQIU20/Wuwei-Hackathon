"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getAgentServerUrl } from "@/lib/agent-server";
import { useI18n, type Locale } from "@/lib/i18n";
import { SpotlightCard } from "./SpotlightCard";
import { MagneticButton } from "./MagneticButton";

type AgentMemory = {
  id: string;
  home_id: string | null;
  memory_type: string;
  memory_key: string;
  memory_value: string;
  confidence: number;
  evidence_count: number;
  last_observed_at: string;
  reason: string | null;
  status: string;
  updated_at: string;
};

const KEY_META: Record<string, { en: string; zh: string; icon: string }> = {
  response_language:    { en: "Response language",  zh: "回复语言",  icon: "🌐" },
  response_tone:        { en: "Response tone",       zh: "回复语气",  icon: "💬" },
  response_length:      { en: "Response length",     zh: "回复长度",  icon: "📏" },
  explanation_style:    { en: "Explanation style",   zh: "解释风格",  icon: "📖" },
  formatting_preference:{ en: "Formatting",          zh: "格式偏好",  icon: "✏️" },
  tool_preference:      { en: "Tool preference",     zh: "工具偏好",  icon: "🔧" },
  coding_preference:    { en: "Coding preference",   zh: "编码偏好",  icon: "💻" },
};

function relativeTime(iso: string, locale: Locale): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (locale === "zh") {
    if (m < 1) return "刚刚";
    if (m < 60) return `${m} 分钟前`;
    if (h < 24) return `${h} 小时前`;
    return `${d} 天前`;
  }
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

const SERVER = getAgentServerUrl();

export function MemoryBrowser() {
  const { locale, t } = useI18n();
  const zh = locale === "zh";

  const [items, setItems] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "preference">("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER}/v1/memory/preferences`);
      if (res.status === 503) { setUnavailable(true); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: AgentMemory[] };
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(id: string) {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${SERVER}/v1/memory/preferences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: editValue.trim(), reason: editReason.trim() || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`${SERVER}/v1/memory/preferences/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const displayed = filter === "all" ? items : items.filter((m) => m.memory_type === filter);

  if (unavailable) {
    return (
      <SpotlightCard className="py-20 text-center">
        <p className="font-display text-xl text-black/40 mb-2">
          {zh ? "记忆服务未配置" : "Memory service unavailable"}
        </p>
        <p className="text-sm text-black/30">
          {zh
            ? "需要在 Railway 上配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY"
            : "Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Railway to enable this."}
        </p>
      </SpotlightCard>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-black/40 mb-2">
          {zh ? "Agent 记忆" : "Agent memory"}
        </p>
        <h1 className="font-display text-3xl font-medium text-black/85">
          {zh ? "AI 对你了解多少" : "What the agent knows about you"}
        </h1>
        <p className="mt-2 text-sm text-black/50 leading-relaxed max-w-xl">
          {zh
            ? "每轮对话结束后，Agent 会自动提炼你的偏好并记录下来。这里是它目前掌握的内容，你可以随时纠正或删除。"
            : "After each conversation, the agent extracts your preferences and remembers them. Review, correct, or delete any entry here."}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: zh ? "总记忆" : "Total",    value: items.length },
          { label: zh ? "偏好类" : "Preference", value: items.filter(m => m.memory_type === "preference").length },
          { label: zh ? "最近更新" : "Recent",  value: items.filter(m => Date.now() - new Date(m.updated_at).getTime() < 86_400_000).length },
        ].map((s) => (
          <SpotlightCard key={s.label} className="py-4 px-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/35">{s.label}</p>
            <p className="mt-1 font-display text-3xl text-[color:var(--accent-1)]">{s.value}</p>
          </SpotlightCard>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "preference"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-[0.15em] border transition-all ${
              filter === f
                ? "bg-black/90 text-white border-black/90"
                : "border-black/10 text-black/50 hover:border-black/25"
            }`}
          >
            {f === "all" ? (zh ? "全部" : "All") : (zh ? "对话偏好" : "Preferences")}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 py-16 text-black/30 font-mono text-xs">
          {[0, 1, 2].map((i) => (
            <motion.span key={i} className="block h-1.5 w-1.5 rounded-full bg-black/30"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
          ))}
          {zh ? "加载中…" : "Loading…"}
        </div>
      )}

      {/* Empty */}
      {!loading && displayed.length === 0 && (
        <SpotlightCard className="py-20 flex flex-col items-center gap-4 text-center">
          <p className="text-4xl opacity-20">🧠</p>
          <p className="font-display text-xl text-black/40">
            {zh ? "还没有记忆" : "No memories yet"}
          </p>
          <p className="text-sm text-black/30 max-w-xs">
            {zh
              ? "多和 Agent 聊几次，它会自动开始记录你的偏好。"
              : "Chat with the agent a few times — it will start remembering your preferences automatically."}
          </p>
        </SpotlightCard>
      )}

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence initial={false}>
          {displayed.map((m) => {
            const meta = KEY_META[m.memory_key] ?? { en: m.memory_key, zh: m.memory_key, icon: "📌" };
            const isEditing = editId === m.id;
            const isDeleting = deletingId === m.id;

            return (
              <motion.div key={m.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.22 }}>
                <SpotlightCard className={`h-full flex flex-col gap-3 ${isEditing ? "border-black/25" : ""}`}>

                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{meta.icon}</span>
                      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-black/40">
                        {zh ? meta.zh : meta.en}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                      m.memory_type === "preference"
                        ? "bg-purple-50 text-purple-600"
                        : "bg-amber-50 text-amber-600"
                    }`}>
                      {m.memory_type}
                    </span>
                  </div>

                  {/* Value / Edit input */}
                  {isEditing ? (
                    <div className="space-y-2 flex-1">
                      <input value={editValue} onChange={e => setEditValue(e.target.value)}
                        placeholder={zh ? "新的值…" : "New value…"}
                        className="w-full rounded-lg border border-black/15 bg-black/[0.03] px-3 py-2 text-sm text-black/80 outline-none focus:border-black/30" />
                      <input value={editReason} onChange={e => setEditReason(e.target.value)}
                        placeholder={zh ? "原因（可选）" : "Reason (optional)"}
                        className="w-full rounded-lg border border-black/10 bg-black/[0.02] px-3 py-1.5 text-xs text-black/55 outline-none focus:border-black/20" />
                    </div>
                  ) : (
                    <p className="flex-1 text-sm font-medium text-black/80 leading-relaxed">
                      {m.memory_value}
                    </p>
                  )}

                  {/* Confidence bar */}
                  {!isEditing && (
                    <div className="space-y-1">
                      <div className="flex justify-between font-mono text-[10px] text-black/30">
                        <span>{zh ? "置信度" : "confidence"}</span>
                        <span>{Math.round(m.confidence * 100)}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-black/8 overflow-hidden">
                        <div className="h-full rounded-full bg-[color:var(--accent-1)] transition-all duration-500"
                          style={{ width: `${Math.round(m.confidence * 100)}%` }} />
                      </div>
                      <p className="font-mono text-[10px] text-black/25">
                        {zh
                          ? `来自 ${m.evidence_count} 轮对话 · ${relativeTime(m.updated_at, locale)}`
                          : `${m.evidence_count} turn${m.evidence_count !== 1 ? "s" : ""} · ${relativeTime(m.updated_at, locale)}`}
                      </p>
                    </div>
                  )}

                  {/* Reason */}
                  {!isEditing && m.reason && (
                    <p className="text-xs text-black/35 leading-relaxed border-t border-black/6 pt-2 italic">
                      {m.reason}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    {isEditing ? (
                      <>
                        <MagneticButton type="button" onClick={() => void save(m.id)}
                          className="!px-4 !py-1.5 text-xs flex-1" disabled={saving || !editValue.trim()}>
                          {saving ? (zh ? "保存中…" : "Saving…") : (zh ? "保存" : "Save")}
                        </MagneticButton>
                        <button onClick={() => setEditId(null)}
                          className="px-4 py-1.5 rounded-full border border-black/10 text-xs text-black/45 hover:border-black/20">
                          {zh ? "取消" : "Cancel"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditId(m.id); setEditValue(m.memory_value); setEditReason(m.reason ?? ""); }}
                          className="flex-1 py-1.5 rounded-full border border-black/10 text-xs text-black/50 hover:border-black/25 hover:text-black/70 transition-all">
                          {zh ? "纠正" : "Correct"}
                        </button>
                        <button onClick={() => void del(m.id)} disabled={isDeleting}
                          className="flex-1 py-1.5 rounded-full border border-red-200 text-xs text-red-400 hover:border-red-300 hover:text-red-500 transition-all disabled:opacity-40">
                          {isDeleting ? "…" : (zh ? "删除" : "Delete")}
                        </button>
                      </>
                    )}
                  </div>
                </SpotlightCard>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
