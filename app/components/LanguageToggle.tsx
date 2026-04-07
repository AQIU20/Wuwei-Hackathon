"use client";

import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t.lang.label}
      className="relative flex items-center rounded-full border border-white/10 bg-white/[0.03] p-1 backdrop-blur-xl"
    >
      {(["en", "zh"] as const).map((l) => {
        const isActive = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            aria-pressed={isActive}
            className={`relative z-10 min-w-[52px] rounded-full px-3 py-1.5 font-display text-[11px] font-medium tracking-[0.18em] uppercase transition-colors duration-300 ${
              isActive ? "text-black" : "text-white/60 hover:text-white"
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="lang-pill"
                transition={{ type: "spring", stiffness: 360, damping: 32 }}
                className="absolute inset-0 -z-10 rounded-full"
                style={{
                  background:
                    "linear-gradient(135deg, #ffffff 0%, #ffd4bd 60%, #ff6c37 100%)",
                  boxShadow:
                    "0 8px 30px -12px rgba(255, 108, 55, 0.5), 0 0 0 1px rgba(255,255,255,0.3)",
                }}
              />
            )}
            {l === "en" ? "EN" : "中文"}
          </button>
        );
      })}
    </div>
  );
}
