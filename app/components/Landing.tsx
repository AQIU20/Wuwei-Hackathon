"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import dynamic from "next/dynamic";
import { MagneticButton } from "./MagneticButton";

const FloatingBlocks = dynamic(
  () => import("./FloatingBlocks").then((m) => m.FloatingBlocks),
  { ssr: false },
);
import { SpotlightCard } from "./SpotlightCard";

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
};

export function Landing() {
  const { t, locale } = useI18n();

  return (
    <>
      {/* Floating 3D blocks */}
      <FloatingBlocks />

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-24 pb-20 lg:px-10 lg:pt-32">
        <motion.div
          key={`hero-${locale}`}
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.1 } } }}
          className="max-w-4xl"
        >
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-white/60 backdrop-blur-md"
          >
            <span className="pulse-dot block h-1.5 w-1.5 rounded-full bg-[color:var(--accent-2)]" />
            {t.hero.badge}
          </motion.div>

          <motion.h1
            variants={fadeUp}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-display mt-8 text-[clamp(2.75rem,7vw,6.25rem)] font-medium leading-[0.95] tracking-[-0.04em]"
          >
            <span className="text-gradient">{t.hero.titleA}</span>
            <br />
            <span className="text-white">{t.hero.titleB}</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 max-w-2xl text-lg leading-relaxed text-white/60"
          >
            {t.hero.desc}
          </motion.p>

          {/* CTA — up top */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Link href={t.hero.primaryHref}>
              <MagneticButton>
                {t.hero.primary} <ArrowIcon />
              </MagneticButton>
            </Link>
            <Link href={t.hero.secondaryHref}>
              <MagneticButton variant="ghost">
                {t.hero.secondary}
              </MagneticButton>
            </Link>
          </motion.div>

          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="mt-16 grid grid-cols-2 gap-8 border-t border-white/10 pt-8 sm:grid-cols-4"
          >
            {t.hero.stats.map((s) => (
              <div key={s.v}>
                <div className="font-display text-3xl font-medium text-white">
                  {s.k}
                </div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
                  {s.v}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* Value Props */}
      <section className="relative mx-auto max-w-7xl px-6 pb-28 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.7 }}
          className="mb-14 text-center"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/40">
            {t.values.eyebrow}
          </span>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-3">
          {t.values.cards.map((c, i) => (
            <motion.div
              key={c.t}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.7 }}
            >
              <SpotlightCard className="h-full">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
                  <ValueIcon type={c.icon} />
                </div>
                <h3 className="font-display text-xl font-medium text-white">
                  {c.t}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-white/55">
                  {c.d}
                </p>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Module Showcase */}
      <section className="relative mx-auto max-w-7xl px-6 pb-28 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.7 }}
          className="mb-14 text-center"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/40">
            {t.modules.eyebrow}
          </span>
          <h2 className="font-display mt-4 text-[clamp(2rem,4.5vw,3rem)] font-medium leading-[1.05] tracking-[-0.03em] text-white">
            {t.modules.title}
          </h2>
        </motion.div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {t.modules.items.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
              className="group rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-white/25"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-base font-medium text-white">
                  {m.name}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${
                    m.cat === "stream"
                      ? "bg-[#ff6c37]/15 text-[#ff6c37]"
                      : m.cat === "sensor"
                        ? "bg-white/8 text-white/60"
                        : "bg-white/8 text-white/40"
                  }`}
                >
                  {t.modules.categories[m.cat as keyof typeof t.modules.categories]}
                </span>
              </div>
              <p className="mt-2 text-xs text-white/50">{m.desc}</p>
              <p className="mt-2 font-mono text-[10px] text-white/30">
                {m.proto}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Scenes */}
      <section className="relative mx-auto max-w-7xl px-6 pb-28 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.7 }}
          className="mb-14 text-center"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/40">
            {t.scenes.eyebrow}
          </span>
          <h2 className="font-display mt-4 text-[clamp(2rem,4.5vw,3rem)] font-medium leading-[1.05] tracking-[-0.03em] text-white">
            {t.scenes.title}
          </h2>
        </motion.div>

        {/* Orbital layout: center body + 5 surrounding scenes */}
        <div className="relative mx-auto" style={{ maxWidth: 900 }}>
          {/* Desktop orbital layout */}
          <div className="hidden lg:block" style={{ height: 720 }}>
            {/* Center body image */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
              style={{ width: 260 }}
            >
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
                <img
                  src="/scene-blocks.png"
                  alt={t.scenes.items[t.scenes.items.length - 1].alt}
                  className="w-full object-cover"
                />
              </div>
            </motion.div>

            {/* 5 orbiting scene cards */}
            {t.scenes.items.slice(0, 5).map((s, i) => {
              const positions = [
                { top: '2%', left: '0%' },
                { top: '0%', right: '2%' },
                { top: '42%', left: '-4%' },
                { top: '45%', right: '-2%' },
                { bottom: '2%', left: '28%' },
              ];
              const pos = positions[i];
              return (
                <motion.div
                  key={s.src}
                  initial={{ opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.15 + i * 0.1, duration: 0.6 }}
                  className="absolute z-20 group"
                  style={{ width: 180, ...pos }}
                >
                  <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0a0a0a]/80 backdrop-blur-sm transition-colors duration-300 hover:border-white/20">
                    <div className="relative aspect-[3/4] overflow-hidden">
                      <img
                        src={s.src}
                        alt={s.alt}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                    <p className="px-3 py-2 text-[11px] leading-relaxed text-white/45">{s.alt}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Mobile/tablet fallback: stacked layout */}
          <div className="lg:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="mx-auto mb-8 max-w-xs overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]"
            >
              <img
                src="/scene-blocks.png"
                alt={t.scenes.items[t.scenes.items.length - 1].alt}
                className="w-full object-cover"
              />
            </motion.div>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
              {t.scenes.items.slice(0, 5).map((s, i) => (
                <motion.div
                  key={s.src}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.6 }}
                  className="group overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] transition-colors duration-300 hover:border-white/20"
                >
                  <div className="relative aspect-[3/4] overflow-hidden">
                    <img
                      src={s.src}
                      alt={s.alt}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <p className="px-3 py-2.5 text-xs leading-relaxed text-white/45">{s.alt}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section
        id="team"
        className="relative mx-auto max-w-7xl px-6 pb-20 lg:px-10"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/40">
            {t.team.eyebrow}
          </span>
          <h2 className="font-display mt-4 text-[clamp(2rem,4.5vw,3rem)] font-medium tracking-[-0.03em] text-white">
            {t.team.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/50">{t.team.desc}</p>
        </motion.div>
      </section>
    </>
  );
}

function ValueIcon({ type }: { type: string }) {
  if (type === "magnet")
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 8a8 8 0 1 1 16 0v4H16V8a4 4 0 0 0-8 0v4H4V8Z"
          stroke="currentColor"
          strokeWidth="1.6"
          className="text-[color:var(--accent-1)]"
        />
        <rect x="4" y="12" width="4" height="4" rx="1" fill="currentColor" className="text-[color:var(--accent-1)]" />
        <rect x="16" y="12" width="4" height="4" rx="1" fill="currentColor" className="text-[color:var(--accent-1)]" />
      </svg>
    );
  if (type === "layers")
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          className="text-[color:var(--accent-2)]"
        />
      </svg>
    );
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3c.5 4-3 7.5-7 8 4 .5 7.5 4 8 7 .5-3 4-6.5 8-7-4-.5-8.5-4-9-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        className="text-[color:var(--accent-3)]"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12h14M13 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
