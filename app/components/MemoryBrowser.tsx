"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getAgentServerUrl } from "@/lib/agent-server";
import { useI18n, type Locale } from "@/lib/i18n";
import { MagneticButton } from "./MagneticButton";
import { SpotlightCard } from "./SpotlightCard";

type AgentMemory = {
  id: string;
  home_id: string | null;
  memory_type: string;
  memory_key: string;
  memory_value: string;
  confidence: number;
  evidence_count: number;
  last_observed_at: string;
  source_episode_ids?: string[];
  reason: string | null;
  status: string;
  created_at?: string;
  updated_at: string;
};

type FilterValue = "all" | "sleep" | "lighting" | "health" | "routine" | "other";

const SERVER = getAgentServerUrl();

const CATEGORY_META: Record<
  FilterValue,
  { icon: string; label: { zh: string; en: string } }
> = {
  all: { icon: "◎", label: { zh: "全部", en: "All" } },
  sleep: { icon: "◔", label: { zh: "睡眠", en: "Sleep" } },
  lighting: { icon: "◑", label: { zh: "灯光", en: "Lighting" } },
  health: { icon: "◕", label: { zh: "健康", en: "Health" } },
  routine: { icon: "◒", label: { zh: "习惯", en: "Routine" } },
  other: { icon: "◌", label: { zh: "其他", en: "Other" } },
};

const MEMORY_LABELS: Record<string, { zh: string; en: string }> = {
  response_language: { zh: "回复语言", en: "Response language" },
  response_tone: { zh: "回复语气", en: "Response tone" },
  response_length: { zh: "回复长度", en: "Response length" },
  explanation_style: { zh: "解释风格", en: "Explanation style" },
  formatting_preference: { zh: "格式偏好", en: "Formatting preference" },
  tool_preference: { zh: "工具偏好", en: "Tool preference" },
  coding_preference: { zh: "编码偏好", en: "Coding preference" },
  sleep_schedule: { zh: "睡眠时间", en: "Sleep schedule" },
  lighting_preference: { zh: "灯光偏好", en: "Lighting preference" },
  health_pattern: { zh: "健康规律", en: "Health pattern" },
};

const DEMO_MEMORIES: AgentMemory[] = [
  {
    id: "demo-sleep",
    home_id: "demo-home",
    memory_type: "pattern",
    memory_key: "sleep_schedule",
    memory_value:
      "工作日通常在 00:30 到 01:10 之间入睡，早上 8 点前后起床。连续熬夜两天后，第二天下午心率会偏高。",
    confidence: 0.92,
    evidence_count: 18,
    last_observed_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    reason: "过去两周内，睡眠与心率数据反复出现相同模式。",
    status: "active",
    created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-light",
    home_id: "demo-home",
    memory_type: "preference",
    memory_key: "lighting_preference",
    memory_value:
      "晚上阅读时更喜欢暖白低亮度灯光，接近 22:30 会把灯切到更暗的 sunset 模式。",
    confidence: 0.88,
    evidence_count: 14,
    last_observed_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    reason: "在阅读场景下，多次主动把灯光从冷白调回暖白。",
    status: "active",
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-health",
    home_id: "demo-home",
    memory_type: "health",
    memory_key: "health_pattern",
    memory_value:
      "湿度超过 70% 且甲醛轻微升高时，更容易出现心率偏快和烦躁，适合提前通风。",
    confidence: 0.84,
    evidence_count: 11,
    last_observed_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    reason: "环境与体征记录里有稳定相关性，但仍需要更多样本。",
    status: "active",
    created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-routine",
    home_id: "demo-home",
    memory_type: "pattern",
    memory_key: "desk_focus_routine",
    memory_value:
      "坐到书桌前超过 15 分钟后，通常会开启专注模式，并希望姿态提醒更积极一些。",
    confidence: 0.79,
    evidence_count: 9,
    last_observed_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    reason: "对话请求和姿态模块触发记录在相近时间窗口内重复出现。",
    status: "active",
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
];

function relativeTime(iso: string, locale: Locale): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (locale === "zh") {
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return `${days} 天前`;
  }

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function inferCategory(memory: AgentMemory): FilterValue {
  const haystack =
    `${memory.memory_type} ${memory.memory_key} ${memory.memory_value} ${memory.reason ?? ""}`.toLowerCase();

  if (/(sleep|bed|night|nap|rest|wake|睡|起床)/.test(haystack)) return "sleep";
  if (/(light|lamp|led|bright|warm|dim|sunset|灯|光|亮度)/.test(haystack))
    return "lighting";
  if (
    /(heart|bpm|health|stress|posture|humidity|temperature|hcho|vital|心率|健康|体征)/.test(
      haystack,
    )
  ) {
    return "health";
  }
  if (/(habit|routine|usually|often|prefers|schedule|习惯|经常|偏好|规律)/.test(haystack))
    return "routine";

  return "other";
}

function memoryTitle(memory: AgentMemory, locale: Locale): string {
  const preset = MEMORY_LABELS[memory.memory_key];
  if (preset) return locale === "zh" ? preset.zh : preset.en;
  return memory.memory_key.replace(/[_-]+/g, " ");
}

function typeLabel(memoryType: string, locale: Locale): string {
  if (locale === "zh") {
    if (memoryType === "preference") return "偏好";
    if (memoryType === "pattern") return "规律";
    if (memoryType === "health") return "健康";
  }
  return memoryType;
}

export function MemoryBrowser() {
  const { locale } = useI18n();
  const zh = locale === "zh";

  const [items, setItems] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [usingDemoData, setUsingDemoData] = useState(false);

  async function readErrorMessage(res: Response) {
    try {
      const data = (await res.json()) as { error?: string };
      return data.error || `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    setUsingDemoData(false);

    try {
      const res = await fetch(`${SERVER}/v1/memories`);
      if (res.status === 503) {
        setUnavailable(true);
        setItems(DEMO_MEMORIES);
        setUsingDemoData(true);
        return;
      }
      if (!res.ok) throw new Error(await readErrorMessage(res));

      const data = (await res.json()) as { items: AgentMemory[] };
      if (data.items.length === 0) {
        setItems(DEMO_MEMORIES);
        setUsingDemoData(true);
        return;
      }
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memories");
      setItems(DEMO_MEMORIES);
      setUsingDemoData(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(id: string) {
    if (usingDemoData) return;
    const value = editValue.trim();
    if (!value) return;

    setSaving(true);
    try {
      const res = await fetch(`${SERVER}/v1/memories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value,
          reason: editReason.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));

      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (usingDemoData) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${SERVER}/v1/memories/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));

      setItems((prev) => prev.filter((item) => item.id !== id));
      if (editId === id) setEditId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const displayed =
    filter === "all" ? items : items.filter((item) => inferCategory(item) === filter);

  const recentCount = items.filter(
    (item) => Date.now() - new Date(item.updated_at).getTime() < 86_400_000,
  ).length;
  const strongCount = items.filter((item) => item.confidence >= 0.8).length;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/40">
            Memory Browser
          </p>
          <h2 className="mt-2 font-display text-3xl text-white">
            {zh ? "它学到了什么" : "What it has learned"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">
            {zh
              ? "AI 会把反复观察到的规律整理成长期记忆。你可以在这里看到它学到的睡眠时间、灯光偏好、健康规律和其他稳定习惯。"
              : "The agent condenses repeated observations into durable memories. Review what it has learned about sleep, lighting, health, and other stable routines."}
          </p>
          {usingDemoData && (
            <p className="mt-3 inline-flex rounded-full border border-[color:var(--accent-1)]/30 bg-[color:var(--accent-1)]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--accent-1)]">
              {zh
                ? "当前展示的是演示记忆数据"
                : "Showing demo memory data"}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_META) as FilterValue[]).map((key) => {
            const meta = CATEGORY_META[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.15em] transition ${
                  filter === key
                    ? "border-[color:var(--accent-1)] bg-[color:var(--accent-1)] text-black"
                    : "border-white/10 text-white/55 hover:border-white/25 hover:text-white/80"
                }`}
              >
                {meta.icon} {zh ? meta.label.zh : meta.label.en}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: zh ? "总记忆数" : "Total memories", value: items.length },
          { label: zh ? "高置信度" : "High confidence", value: strongCount },
          { label: zh ? "24h 内更新" : "Updated in 24h", value: recentCount },
        ].map((item) => (
          <SpotlightCard key={item.label}>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              {item.label}
            </p>
            <p className="mt-2 font-display text-3xl text-[color:var(--accent-1)]">
              {item.value}
            </p>
          </SpotlightCard>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {loading && (
        <div className="py-12 font-mono text-xs uppercase tracking-[0.2em] text-white/35">
          {zh ? "正在整理记忆" : "Loading memories"}
        </div>
      )}

      {!loading && displayed.length === 0 && (
        <SpotlightCard className="py-16 text-center">
          <p className="font-display text-xl text-white/80">
            {zh ? "还没有整理出可展示的记忆" : "No memories to show yet"}
          </p>
          <p className="mt-2 text-sm text-white/45">
            {zh
              ? "先多积累一些对话和环境观测，Agent 才会开始提炼稳定规律。"
              : "Give the agent more conversations and observations, and it will start distilling stable patterns."}
          </p>
        </SpotlightCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <AnimatePresence initial={false}>
          {displayed.map((memory) => {
            const category = CATEGORY_META[inferCategory(memory)];
            const isEditing = editId === memory.id;
            const isDeleting = deletingId === memory.id;

            return (
              <motion.div
                key={memory.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <SpotlightCard className="h-full p-0">
                  <div className="flex h-full flex-col gap-5 p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                          <span>{category.icon}</span>
                          <span>{zh ? category.label.zh : category.label.en}</span>
                          <span className="text-white/20">/</span>
                          <span>{typeLabel(memory.memory_type, locale)}</span>
                        </div>
                        <h3 className="mt-3 font-display text-2xl text-white">
                          {memoryTitle(memory, locale)}
                        </h3>
                      </div>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-white/45">
                        {formatPercent(memory.confidence)}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                          placeholder={zh ? "新的记忆内容" : "Updated memory value"}
                        />
                        <input
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/80 outline-none focus:border-white/25"
                          placeholder={zh ? "备注，可选" : "Note, optional"}
                        />
                      </div>
                    ) : (
                      <p className="text-base leading-7 text-white/88">{memory.memory_value}</p>
                    )}

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35">
                          {zh ? "证据" : "Evidence"}
                        </p>
                        <p className="mt-1 text-sm text-white/80">{memory.evidence_count}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35">
                          {zh ? "最近观测" : "Last seen"}
                        </p>
                        <p className="mt-1 text-sm text-white/80">
                          {relativeTime(memory.last_observed_at, locale)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/35">
                          {zh ? "更新时间" : "Updated"}
                        </p>
                        <p className="mt-1 text-sm text-white/80">
                          {relativeTime(memory.updated_at, locale)}
                        </p>
                      </div>
                    </div>

                    {memory.reason && !isEditing && (
                      <div className="rounded-2xl border border-[color:var(--accent-1)]/20 bg-[color:var(--accent-1)]/8 px-4 py-3 text-sm leading-6 text-white/65">
                        {memory.reason}
                      </div>
                    )}

                    <div className="mt-auto flex flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <MagneticButton
                            type="button"
                            onClick={() => void save(memory.id)}
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
                              if (usingDemoData) return;
                              setEditId(memory.id);
                              setEditValue(memory.memory_value);
                              setEditReason(memory.reason ?? "");
                            }}
                            variant="ghost"
                            className="!px-4 !py-2 text-xs"
                            disabled={usingDemoData}
                          >
                            {zh ? "编辑记忆" : "Edit memory"}
                          </MagneticButton>
                          <button
                            type="button"
                            onClick={() => void remove(memory.id)}
                            disabled={isDeleting || usingDemoData}
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
    </section>
  );
}
