"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { MagneticButton } from "./MagneticButton";
import { SpotlightCard } from "./SpotlightCard";

const ContextMachineInline = dynamic(
  () => import("../context-machine/ContextMachine").then((m) => m.ContextMachine),
  { ssr: false },
);

const GalleryMarquee = dynamic(
  () => import("../context-machine/ContextMachine").then((m) => m.GalleryMarquee),
  { ssr: false },
);

const FloatingBlocks = dynamic(
  () => import("./FloatingBlocks").then((m) => m.FloatingBlocks),
  { ssr: false },
);

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

      {/* Context Machine — inline interactive section */}
      <section id="context-machine" className="relative py-16">
        <ContextMachineInline />
      </section>

      {/* Gallery marquee — community cards */}
      <GalleryMarquee />

      {/* Smart Space — sensors + scenes interleaved */}
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

        {/* Interleaved: sensor module → scene, sensor → scene, ... */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {t.scenes.items.map((scene, i) => {
            const mod = moduleImages[i % moduleImages.length];
            return (
              <motion.div
                key={scene.src}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                className="contents"
              >
                {/* Sensor module card */}
                <div className="flex items-center justify-center rounded-xl border border-black/6 bg-black/[0.02] p-6">
                  <motion.div
                    className="drop-shadow-md"
                    animate={{ y: [0, -6, 0, 4, 0], rotate: [-2, 2, -1, 1, -2] }}
                    transition={{ duration: 4 + i * 0.7, repeat: Infinity, ease: "easeInOut" }}
                    whileHover={{ scale: 1.15 }}
                  >
                    <Image src={mod.src} alt={mod.alt} width={80} height={80} className="h-auto w-20" />
                  </motion.div>
                </div>
                {/* Scene card */}
                <div className="group overflow-hidden rounded-xl border border-black/8 bg-black/[0.02] transition-colors duration-300 hover:border-black/20">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src={scene.src}
                      alt={scene.alt}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <p className="px-2 py-1.5 text-[10px] leading-relaxed text-black/45">{scene.alt}</p>
                </div>
              </motion.div>
            );
          })}
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

const teamPhotos = ["/team/1.jpg", "/team/2.jpg", "/team/3.jpg", "/team/4.jpg", "/team/5.jpg", "/team/6.jpg", "/team/7.png", "/team/8.png", "/team/9.png", "/team/10.jpg", "/team/11.jpg", "/team/12.jpg"];

const moduleImages = [
  { src: "/modules/麦克.png", alt: "Voice / 麦克" },
  { src: "/modules/声音.png", alt: "Sound / 声音" },
  { src: "/modules/相机.png", alt: "Camera / 相机" },
  { src: "/modules/触觉.png", alt: "Touch / 触觉" },
  { src: "/modules/温度.png", alt: "Temperature / 温度" },
  { src: "/modules/湿度.png", alt: "Humidity / 湿度" },
  { src: "/modules/震动.png", alt: "Haptics / 震动" },
  { src: "/modules/追迹.png", alt: "Posture / 追迹" },
  { src: "/modules/方向.png", alt: "Direction / 方向" },
  { src: "/modules/距离.png", alt: "Distance / 距离" },
  { src: "/modules/天气.png", alt: "Weather / 天气" },
  { src: "/modules/位置.png", alt: "Location / 位置" },
  { src: "/modules/滚珠追迹.png", alt: "Ball Tracker / 滚珠追迹" },
  { src: "/modules/sensor.png", alt: "Sensor / 传感器" },
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
          animation: marquee-scroll 60s linear infinite;
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
