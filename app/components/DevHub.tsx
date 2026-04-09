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
  const { t, locale } = useI18n();

  return (
    <div className="relative mx-auto max-w-7xl px-6 pt-16 pb-28 lg:px-10">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="mb-16"
      >
        <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] font-medium tracking-[-0.04em] text-gray-900">
          {t.dev.heroTitle}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-black/50">
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
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40">
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
                className="flex items-center justify-between rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3"
              >
                <span className="font-mono text-sm text-[color:var(--accent-2)]">
                  {topic.t}
                </span>
                <span className="text-xs text-black/50">{topic.d}</span>
              </motion.div>
            ))}
          </div>
        </SpotlightCard>

        <SpotlightCard className="lg:col-span-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40">
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
                className="rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm text-gray-900">
                    {s.name}
                  </span>
                  <span className="font-mono text-xs text-[color:var(--accent-1)]">
                    {s.port}
                  </span>
                </div>
                <p className="mt-1 text-xs text-black/40">{s.tag}</p>
              </motion.div>
            ))}
          </div>
        </SpotlightCard>
      </div>

      {/* Downloads */}
      <div className="mt-8">
        <SpotlightCard>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40">
            {t.dev.downloads}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {t.dev.downloadItems.map((item) => (
              <div
                key={item.name}
                className="rounded-xl border border-black/5 bg-black/[0.02] px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <DownloadIcon />
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {item.name}
                    </div>
                    <div className="text-xs text-black/40">{item.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SpotlightCard>
      </div>

      {/* Source Code Repos */}
      <div className="mt-8">
        <SpotlightCard>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40">
            {locale === "zh" ? "开源代码库" : "Source Code"}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <a
              href="https://github.com/AQIU20/Wuwei-Hackathon"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-xl border border-black/5 bg-black/[0.02] px-5 py-4 transition-colors hover:border-black/15 hover:bg-black/[0.04]"
            >
              <GitHubIcon />
              <div>
                <div className="text-sm font-medium text-gray-900 group-hover:text-[color:var(--accent-1)] transition-colors">
                  {locale === "zh" ? "软件代码库" : "Software Repository"}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-black/40">
                  AQIU20/Wuwei-Hackathon
                </div>
                <div className="mt-1 text-xs text-black/50">
                  {locale === "zh"
                    ? "Next.js 前端 + Hono 后端 + AI Agent + MQTT Bridge"
                    : "Next.js frontend + Hono backend + AI Agent + MQTT Bridge"}
                </div>
              </div>
            </a>
            <a
              href="https://github.com/woodbridgehi/Red_Hackson_node_code"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-xl border border-black/5 bg-black/[0.02] px-5 py-4 transition-colors hover:border-black/15 hover:bg-black/[0.04]"
            >
              <GitHubIcon />
              <div>
                <div className="text-sm font-medium text-gray-900 group-hover:text-[color:var(--accent-1)] transition-colors">
                  {locale === "zh" ? "硬件代码库" : "Hardware Repository"}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-black/40">
                  woodbridgehi/Red_Hackson_node_code
                </div>
                <div className="mt-1 text-xs text-black/50">
                  {locale === "zh"
                    ? "ESP32 传感器节点固件 + aihub 协议实现"
                    : "ESP32 sensor node firmware + aihub protocol implementation"}
                </div>
              </div>
            </a>
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
      <div className="flex items-center justify-between border-b border-black/10 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 font-mono text-[11px] uppercase tracking-[0.18em] text-black/40">
            {title}
          </span>
        </div>
        <span className="font-mono text-[10px] text-black/30">{language}</span>
      </div>
      <pre className="overflow-x-auto px-5 py-5 font-mono text-[12.5px] leading-[1.7] text-black/80">
        <code>{code}</code>
      </pre>
    </SpotlightCard>
  );
}

function GitHubIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0 text-black/60"
    >
      <path
        d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="text-black/40"
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
