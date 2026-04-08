"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { getAgentServerUrl } from "@/lib/agent-server";

export function DocsComingSoon() {
  const { locale } = useI18n();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "dup">("idle");

  async function submit() {
    if (!email) return;
    try {
      const res = await fetch(`${getAgentServerUrl()}/v1/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(res.status === 409 ? "dup" : "ok");
    } catch {
      // silent
    }
  }

  const isZh = locale === "zh";

  return (
    <div className="relative mx-auto max-w-2xl px-6 py-32 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-black/40">
          {isZh ? "开发者文档" : "Developer Docs"}
        </span>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          {isZh ? "敬请期待" : "Coming Soon"}
        </h1>
        <p className="mt-4 text-lg text-black/50 leading-relaxed">
          {isZh
            ? "完整的协议文档、API 参考和硬件接入指南正在制作中。加入等候名单，第一时间获取更新。"
            : "Full protocol docs, API reference, and hardware integration guides are on the way. Join the waitlist to get notified."}
        </p>

        <div className="mx-auto mt-8 max-w-sm">
          {status === "idle" ? (
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 rounded-xl border border-black/10 px-4 py-2.5 text-sm outline-none focus:border-black/30 transition-colors"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <button
                onClick={submit}
                className="rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-black/80 transition-colors"
              >
                {isZh ? "加入" : "Join"}
              </button>
            </div>
          ) : (
            <p className="text-sm font-medium text-emerald-600">
              {status === "ok"
                ? (isZh ? "你已加入名单！" : "You're on the list!")
                : (isZh ? "你已经在名单中了！" : "You're already on the list!")}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
