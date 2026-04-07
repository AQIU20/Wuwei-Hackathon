"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import dynamic from "next/dynamic";
import { MagneticButton } from "./MagneticButton";

const FloatingBlocks = dynamic(
  () => import("./FloatingBlocks").then((m) => m.FloatingBlocks),
  { ssr: false },
);
import { SpotlightCard } from "./SpotlightCard";
import { IsometricRoom } from "./IsometricRoom";

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
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-black/[0.03] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-black/60 backdrop-blur-md"
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
            <span className="text-gray-900">{t.hero.titleB}</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 max-w-2xl text-lg leading-relaxed text-black/60"
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
            className="mt-16 grid grid-cols-2 gap-8 border-t border-black/10 pt-8 sm:grid-cols-4"
          >
            {t.hero.stats.map((s) => (
              <div key={s.v}>
                <div className="font-display text-3xl font-medium text-gray-900">
                  {s.k}
                </div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-black/40">
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
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-black/40">
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
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-black/[0.06]">
                  <ValueIcon type={c.icon} />
                </div>
                <h3 className="font-display text-xl font-medium text-gray-900">
                  {c.t}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-black/55">
                  {c.d}
                </p>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Smart Space — 3D Room center, modules + scenes orbiting */}
      <section className="relative mx-auto max-w-7xl px-6 pb-28 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.7 }}
          className="mb-10 text-center"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-black/40">
            {locale === "zh" ? "智能空间" : "Smart Space"}
          </span>
          <h2 className="font-display mt-3 text-[clamp(2rem,4.5vw,3rem)] font-medium leading-[1.05] tracking-[-0.03em] text-gray-900">
            {t.scenes.title}
          </h2>
        </motion.div>

        {/* Desktop: 3D room center with orbiting modules + scenes */}
        <div className="hidden lg:block">
          <div className="relative mx-auto" style={{ maxWidth: 1100, height: 700 }}>
            {/* Center — 3D Room */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
              style={{ width: 420 }}
            >
              <IsometricRoom />
            </motion.div>

            {/* Orbiting scene images — 5 scenes around the room */}
            {t.scenes.items.slice(0, 5).map((s, i) => {
              const positions = [
                { top: '0%', left: '0%' },      /* top-left: cooking */
                { top: '2%', right: '0%' },      /* top-right: bathing */
                { top: '50%', left: '-2%' },     /* mid-left: baby */
                { top: '48%', right: '-1%' },    /* mid-right: mood */
                { bottom: '0%', left: '30%' },   /* bottom-center: sleeping */
              ];
              const pos = positions[i];
              return (
                <motion.div
                  key={s.src}
                  initial={{ opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.1, duration: 0.6 }}
                  className="absolute z-20 group"
                  style={{ width: 220, ...pos }}
                >
                  <div className="overflow-hidden rounded-2xl border border-black/8 bg-white/90 backdrop-blur-sm shadow-md transition-all duration-300 hover:border-black/20 hover:shadow-lg">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <img
                        src={s.src}
                        alt={s.alt}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                    <p className="px-3 py-2 text-[11px] leading-relaxed text-black/45">{s.alt}</p>
                  </div>
                </motion.div>
              );
            })}

            {/* Floating module images scattered around */}
            {moduleImages.map((mod, i) => {
              const chipPositions = [
                { top: '6%', left: '36%' },
                { top: '4%', right: '26%' },
                { top: '32%', left: '6%' },
                { top: '34%', right: '4%' },
                { bottom: '22%', left: '8%' },
                { bottom: '6%', right: '28%' },
              ];
              const pos = chipPositions[i];
              return (
                <motion.div
                  key={mod.src}
                  initial={{ opacity: 0, scale: 0.5 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.08, duration: 0.5 }}
                  className="absolute z-30"
                  style={{ width: 64, ...pos }}
                >
                  <motion.img
                    src={mod.src}
                    alt={mod.alt}
                    className="w-full drop-shadow-md"
                    loading="lazy"
                    animate={{
                      y: [0, -6, 0, 4, 0],
                      rotate: [-2, 2, -1, 1, -2],
                    }}
                    transition={{
                      duration: 4 + i * 0.7,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    whileHover={{ scale: 1.15 }}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Mobile/tablet fallback */}
        <div className="lg:hidden">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="mb-8"
          >
            <IsometricRoom />
          </motion.div>

          {/* Module images row */}
          <div className="mb-6 flex flex-wrap justify-center gap-3">
            {moduleImages.map((mod) => (
              <img key={mod.src} src={mod.src} alt={mod.alt} className="w-12 drop-shadow-md" loading="lazy" />
            ))}
          </div>

          {/* Scene grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {t.scenes.items.slice(0, 5).map((s, i) => (
              <motion.div
                key={s.src}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.5 }}
                className="group overflow-hidden rounded-xl border border-black/8 bg-black/[0.02] transition-colors duration-300 hover:border-black/20"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={s.src}
                    alt={s.alt}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <p className="px-2 py-1.5 text-[10px] leading-relaxed text-black/45">{s.alt}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team — scrolling photo gallery */}
      <section
        id="team"
        className="relative pb-20 overflow-hidden"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mb-10 text-center px-6"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-black/40">
            {t.team.eyebrow}
          </span>
        </motion.div>

        <TeamMarquee />
      </section>
    </>
  );
}

const teamPhotos = ["/team/1.jpg", "/team/2.jpg", "/team/3.jpg", "/team/4.jpg", "/team/5.jpg", "/team/6.jpg"];

const moduleImages = [
  { src: "/modules/麦克.png", alt: "Voice / 麦克" },
  { src: "/modules/相机.png", alt: "Camera / 相机" },
  { src: "/modules/温度.png", alt: "Temperature / 温度" },
  { src: "/modules/湿度.png", alt: "Humidity / 湿度" },
  { src: "/modules/震动.png", alt: "Haptics / 震动" },
  { src: "/modules/追迹.png", alt: "Posture / 追迹" },
];

function TeamMarquee() {
  // Double the images for seamless infinite scroll
  const images = [...teamPhotos, ...teamPhotos];

  return (
    <div className="relative w-full">
      <div className="team-marquee flex gap-6">
        {images.map((src, i) => (
          <div
            key={i}
            className="flex-none overflow-hidden rounded-2xl border border-black/8 shadow-sm"
            style={{ width: 420 }}
          >
            <Image
              src={src}
              alt=""
              width={420}
              height={288}
              className="h-72 w-full object-cover"
              loading="lazy"
              sizes="420px"
            />
          </div>
        ))}
      </div>

      <style jsx>{`
        .team-marquee {
          animation: marquee-scroll 35s linear infinite;
          width: max-content;
        }
        .team-marquee:hover {
          animation-play-state: paused;
        }
        @keyframes marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
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
