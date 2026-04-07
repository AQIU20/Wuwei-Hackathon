"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { MagneticButton } from "./MagneticButton";
import { SpotlightCard } from "./SpotlightCard";

const mqttSnippet = `# Subscribe to every block announcement
mosquitto_sub -h host.local -t "blocks/+/announce"

# Control the LED light block
mosquitto_pub -h host.local \\
  -t "blocks/light-001/command" \\
  -m '{"action":"set_color","r":255,"g":94,"b":135}'`;

const pySnippet = `import asyncio, json
from paho.mqtt import client as mqtt

async def main():
    c = mqtt.Client()
    c.connect("host.local", 1883)
    c.subscribe("blocks/+/data")

    def on_msg(_, __, msg):
        payload = json.loads(msg.payload)
        print(msg.topic, payload)

    c.on_message = on_msg
    c.loop_forever()

asyncio.run(main())`;

export function DevHub() {
  const { t } = useI18n();

  return (
    <div className="relative mx-auto max-w-7xl px-6 pt-16 pb-28 lg:px-10">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="mb-16"
      >
        <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] font-medium tracking-[-0.04em] text-white">
          {t.dev.heroTitle}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-white/50">
          {t.dev.heroDesc}
        </p>
      </motion.div>

      {/* Code snippets */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CodeCard title={t.dev.mqttCardTitle} language="bash" code={mqttSnippet} />
        <CodeCard title={t.dev.pyCardTitle} language="python" code={pySnippet} />
      </div>

      {/* Services + Topics */}
      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <SpotlightCard className="lg:col-span-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            {t.dev.topicsTitle}
          </p>
          <div className="mt-5 space-y-2">
            {t.dev.topics.map((topic, i) => (
              <motion.div
                key={topic.t}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
              >
                <span className="font-mono text-sm text-[color:var(--accent-2)]">
                  {topic.t}
                </span>
                <span className="text-xs text-white/50">{topic.d}</span>
              </motion.div>
            ))}
          </div>
        </SpotlightCard>

        <SpotlightCard className="lg:col-span-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            {t.dev.portsTitle}
          </p>
          <div className="mt-5 space-y-3">
            {t.dev.services.map((s, i) => (
              <motion.div
                key={s.port}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm text-white">
                    {s.name}
                  </span>
                  <span className="font-mono text-xs text-[color:var(--accent-1)]">
                    {s.port}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/40">{s.tag}</p>
              </motion.div>
            ))}
          </div>
        </SpotlightCard>
      </div>

      {/* Downloads */}
      <div className="mt-8">
        <SpotlightCard>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            {t.dev.downloads}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {t.dev.downloadItems.map((item) => (
              <div
                key={item.name}
                className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <DownloadIcon />
                  <div>
                    <div className="text-sm font-medium text-white">
                      {item.name}
                    </div>
                    <div className="text-xs text-white/40">{item.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SpotlightCard>
      </div>

      {/* Link to docs */}
      <div className="mt-8 flex justify-center">
        <Link href="/dev/docs">
          <MagneticButton>{t.dev.docsLink}</MagneticButton>
        </Link>
      </div>
    </div>
  );
}

function CodeCard({
  title,
  language,
  code,
}: {
  title: string;
  language: string;
  code: string;
}) {
  return (
    <SpotlightCard className="p-0">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
            {title}
          </span>
        </div>
        <span className="font-mono text-[10px] text-white/30">{language}</span>
      </div>
      <pre className="overflow-x-auto px-5 py-5 font-mono text-[12.5px] leading-[1.7] text-white/80">
        <code>{code}</code>
      </pre>
    </SpotlightCard>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="text-white/40"
    >
      <path
        d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
