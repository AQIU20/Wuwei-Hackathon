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
  response_language: { en: "Response language", zh: "回复语言", icon: "🌐" },
  response_tone: { en: "Response tone", zh: "回复语气", icon: "💬" },
  response_length: { en: "Response length", zh: "回复长度", icon: "📏" },
  explanation_style: { en: "Explanation style", zh: "解释风格", icon: "📖" },
  formatting_preference: { en: "Formatting", zh: "格式偏好", icon: "✏️" },
  tool_preference: { en: "Tool preference", zh: "工具偏好", icon: "🔧" },
  coding_preference: { en: "Coding preference", zh: "编码偏好", icon: "💻" },
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
  const { locale } = useI18n();
  const zh = locale === "zh";

  const [items, setItems] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: AgentMemory[] };
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(id: string) {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${SERVER}/v1/memory/preferences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: editValue.trim(),
          reason: editReason.trim() || null,
        }),
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
      const res = await fetch(`${SERVER}/v1/memory/preferences/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const displayed =
    filter === "all" ? items : items.filter((m) => m.memory_type === filter);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/40">
          {zh ? "Agent 记忆" : "Agent memory"}
        </p>
        <h2 className="mt-2 font-display text-3xl text-white">
          {zh ? "它记住了什么" : "What it remembers"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
          {zh
            ? "根目录 app 现在直接展示 agent 的长期偏好记忆。你可以查看、修改或删除。"
            : "The root app now shows the agent's long-lived preference memory directly. You can review, edit, or delete entries here."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: zh ? "总数" : "Total", value: items.length },
          {
            label: zh ? "偏好" : "Preference",
            value: items.filter((m) => m.memory_type === "preference").length,
          },
          {
            label: zh ? "24h 更新" : "Updated 24h",
            value: items.filter(
              (m) => Date.now() - new Date(m.updated_at).getTime() < 86_400_000,
            ).length,
          },
        ].map((s) => (
          <SpotlightCard key={s.label}>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              {s.label}
            </p>
            <p className="mt-2 font-display text-3xl text-[color:var(--accent-1)]">
              {s.value}
            </p>
          </SpotlightCard>
        ))}
      </div>

      <div className="flex gap-2">
        {(["all", "preference"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full border px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] transition ${
              filter === value
                ? "border-[color:var(--accent-1)] bg-[color:var(--accent-1)] text-black"
                : "border-white/10 text-white/55 hover:border-white/25 hover:text-white/80"
            }`}
          >
            {value === "all"
              ? zh
                ? "全部"
                : "All"
              : zh
                ? "偏好"
                : "Preferences"}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {loading && (
        <div className="py-12 font-mono text-xs uppercase tracking-[0.2em] text-white/35">
          {zh ? "记忆加载中" : "Loading memory"}
        </div>
      )}

      {!loading && displayed.length === 0 && (
        <SpotlightCard className="py-16 text-center">
          <p className="text-4xl opacity-30">🧠</p>
          <p className="mt-3 font-display text-xl text-white/80">
            {zh ? "还没有记忆" : "No memories yet"}
          </p>
          <p className="mt-2 text-sm text-white/45">
            {zh
              ? "多聊几轮，agent 会开始提炼稳定偏好。"
              : "Chat a few more times and the agent will start extracting stable preferences."}
          </p>
        </SpotlightCard>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <AnimatePresence initial={false}>
          {displayed.map((m) => {
            const meta = KEY_META[m.memory_key] ?? {
              en: m.memory_key,
              zh: m.memory_key,
              icon: "📌",
            };
            const isEditing = editId === m.id;
            const isDeleting = deletingId === m.id;

            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <SpotlightCard className="h-full">
                  <div className="flex h-full flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{meta.icon}</span>
                        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/45">
                          {zh ? meta.zh : meta.en}
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-white/45">
                        {m.memory_type}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="flex-1 space-y-2">
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                          placeholder={zh ? "新的值" : "New value"}
                        />
                        <input
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/80 outline-none focus:border-white/25"
                          placeholder={zh ? "修改原因，可选" : "Reason, optional"}
                        />
                      </div>
                    ) : (
                      <p className="flex-1 text-sm leading-relaxed text-white/85">
                        {m.memory_value}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-3 text-xs text-white/35">
                      <span>{relativeTime(m.updated_at, locale)}</span>
                      <span>{zh ? `证据 ${m.evidence_count}` : `evidence ${m.evidence_count}`}</span>
                    </div>

                    {m.reason && !isEditing && (
                      <p className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-xs leading-relaxed text-white/50">
                        {m.reason}
                      </p>
                    )}

                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <MagneticButton
                            type="button"
                            onClick={() => void save(m.id)}
                            disabled={saving}
                            className="!px-4 !py-2 text-xs"
                          >
                            {saving ? (zh ? "保存中" : "Saving") : zh ? "保存" : "Save"}
                          </MagneticButton>
                          <MagneticButton
                            type="button"
                            onClick={() => setEditId(null)}
                            variant="ghost"
                            className="!px-4 !py-2 text-xs"
                          >
                            {zh ? "取消" : "Cancel"}
                          </MagneticButton>
                        </>
                      ) : (
                        <>
                          <MagneticButton
                            type="button"
                            onClick={() => {
                              setEditId(m.id);
                              setEditValue(m.memory_value);
                              setEditReason(m.reason ?? "");
                            }}
                            variant="ghost"
                            className="!px-4 !py-2 text-xs"
                          >
                            {zh ? "编辑" : "Edit"}
                          </MagneticButton>
                          <button
                            type="button"
                            onClick={() => void del(m.id)}
                            disabled={isDeleting}
                            className="rounded-full border border-white/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] text-white/50 transition hover:border-red-300/40 hover:text-red-100 disabled:opacity-50"
                          >
                            {isDeleting ? (zh ? "删除中" : "Deleting") : zh ? "删除" : "Delete"}
                          </button>
                        </>
                      )}
                    </div>
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
