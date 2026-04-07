"use client";

import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t.lang.label}
      className="relative flex items-center rounded-full border border-black/10 bg-black/[0.03] p-1 backdrop-blur-xl"
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
              isActive ? "text-black" : "text-black/60 hover:text-gray-900"
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="lang-pill"
                transition={{ type: "spring", stiffness: 360, damping: 32 }}
                className="absolute inset-0 -z-10 rounded-full bg-[#ff6c37]"
              />
            )}
            {l === "en" ? "EN" : "中文"}
          </button>
        );
      })}
    </div>
  );
}
