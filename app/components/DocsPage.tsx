"use client";

import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";

export function DocsPage() {
  const { t, locale } = useI18n();
  const zh = locale === "zh";

  return (
    <div className="relative mx-auto max-w-4xl px-6 pt-16 pb-28 lg:px-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="mb-16"
      >
        <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] font-medium tracking-[-0.04em] text-white">
          {t.docs.title}
        </h1>
        <p className="mt-4 text-lg text-white/50">{t.docs.desc}</p>
      </motion.div>

      <div className="space-y-16">
        {/* System Architecture */}
        <Section id="arch" title={t.docs.sections.arch}>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] p-6 font-mono text-xs leading-relaxed text-white/70">
{`┌──────────────────────────────────────────────────┐
│  AI Agent ${zh ? "层" : "Layer"}  (LLM ${zh ? "决策" : "reasoning"} + ${zh ? "前端" : "frontend"} UI)          │
├──────────────────────────────────────────────────┤
│  PC Host ${zh ? "层" : "Layer"}   (${zh ? "调度 / 路由 / AI 管道" : "dispatch / routing / AI pipeline"})       │
├──────────────────────────────────────────────────┤
│  ${zh ? "硬件模块层" : "Hardware Layer"}  (ESP32-S3 / ESP32-C3 ${zh ? "积木" : "blocks"})        │
└──────────────────────────────────────────────────┘`}
          </pre>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] p-6 font-mono text-xs leading-relaxed text-white/70">
{`${zh ? "传感器" : "Sensors"} ──MQTT──→ Broker ──→ ${zh ? "事件总线" : "Event Bus"} ──→ AI ${zh ? "管道" : "Pipeline"} / ${zh ? "前端推送" : "Frontend"}
${zh ? "视觉块" : "Vision"}  ──UDP───→ UDP Server ──→ ${zh ? "事件总线" : "Event Bus"} ──→ ${zh ? "视觉推理" : "Vision AI"}
${zh ? "语音块" : "Voice"}   ──WS────→ WS Server  ──→ ${zh ? "事件总线" : "Event Bus"} ──→ ASR
AI ${zh ? "决策" : "Decision"} ────→ ${zh ? "事件总线" : "Event Bus"} ──→ MQTT pub ──→ ${zh ? "执行器" : "Actuators"}
${zh ? "前端" : "Frontend"} / Agent ──WS:3000──→ Host ──→ ${zh ? "事件总线" : "Event Bus"}`}
          </pre>
        </Section>

        {/* Module Types */}
        <Section id="modules" title={t.docs.sections.modules}>
          <h4 className="mb-3 font-mono text-xs uppercase tracking-widest text-[color:var(--accent-1)]">
            {zh ? "高带宽流式模块" : "High-bandwidth stream modules"} (ESP32-S3)
          </h4>
          <Table
            headers={[zh ? "模块" : "Module", zh ? "协议" : "Protocol", zh ? "说明" : "Description"]}
            rows={[
              [zh ? "视觉块" : "Vision", "UDP :5600", zh ? "JPEG 视频帧，高带宽低时延，允许丢帧" : "JPEG video frames, high bandwidth low latency, tolerates drops"],
              [zh ? "语音块" : "Voice", "WebSocket :8765", zh ? "音频实时双向传输（采集 + TTS 播放）" : "Real-time bidirectional audio (capture + TTS playback)"],
            ]}
          />

          <h4 className="mb-3 mt-8 font-mono text-xs uppercase tracking-widest text-[color:var(--accent-2)]">
            {zh ? "传感器模块" : "Sensor modules"} (ESP32-C3, MQTT pub)
          </h4>
          <Table
            headers={[zh ? "模块" : "Module", zh ? "数据" : "Data"]}
            rows={[
              [zh ? "姿态块" : "Posture", zh ? "IMU（加速度 / 陀螺仪）" : "IMU (accelerometer / gyroscope)"],
              [zh ? "心率块" : "Heart Rate", "BPM / HRV"],
              [zh ? "环境块" : "Environment", zh ? "温度、湿度" : "Temperature, humidity"],
              [zh ? "甲醛块" : "Formaldehyde", zh ? "HCHO 浓度" : "HCHO concentration"],
            ]}
          />

          <h4 className="mb-3 mt-8 font-mono text-xs uppercase tracking-widest text-[color:var(--accent-3)]">
            {zh ? "执行器模块" : "Actuator modules"} (ESP32-C3, MQTT sub)
          </h4>
          <Table
            headers={[zh ? "模块" : "Module", zh ? "控制" : "Control"]}
            rows={[
              [zh ? "振动块" : "Haptics", zh ? "振动马达" : "Vibration motor"],
              [zh ? "灯光块" : "LED Strip", "WS2812 LED"],
            ]}
          />
        </Section>

        {/* MQTT Topics */}
        <Section id="mqtt" title={t.docs.sections.mqtt}>
          <div className="space-y-2">
            {[
              { topic: "blocks/{module_id}/announce", desc: zh ? "模块上线自报属性" : "Module self-reports properties on boot" },
              { topic: "blocks/{module_id}/status", desc: zh ? "在线状态（LWT 自动发布）" : "Online status (LWT auto-publish)" },
              { topic: "blocks/{module_id}/data", desc: zh ? "传感器数据上报" : "Sensor data telemetry" },
              { topic: "blocks/{module_id}/config", desc: zh ? "Host → 模块的配置下发" : "Host → block work config" },
              { topic: "blocks/{module_id}/command", desc: zh ? "Agent/Host → 执行器控制指令" : "Agent/Host → actuator commands" },
            ].map((t) => (
              <div key={t.topic} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <code className="font-mono text-sm text-[color:var(--accent-2)]">{t.topic}</code>
                <span className="text-xs text-white/50">{t.desc}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Message Formats */}
        <Section id="messages" title={t.docs.sections.messages}>
          <CodeBlock title="announce" code={`{ "id": "env-001", "type": "sensor", "capability": "temperature" }`} />
          <CodeBlock title={zh ? "data（传感器示例）" : "data (sensor example)"} code={`{ "temperature": 26.5, "humidity": 60, "timestamp": 1700000000 }`} />
          <CodeBlock title={zh ? "command（执行器示例）" : "command (actuator examples)"} code={`{ "action": "vibrate", "duration": 500 }
{ "action": "set_color", "r": 255, "g": 0, "b": 0 }`} />
          <CodeBlock title={zh ? "config（普通传感器）" : "config (sensor)"} code={`{ "channel": "mqtt", "interval": 100 }`} />
          <CodeBlock title={zh ? "config（流式模块）" : "config (stream module)"} code={`{ "channel": "ws", "ws_port": 8801 }`} />
        </Section>

        {/* Host Services */}
        <Section id="services" title={t.docs.sections.services}>
          <Table
            headers={[zh ? "服务" : "Service", zh ? "端口" : "Port", zh ? "职责" : "Purpose"]}
            rows={[
              ["MQTT Broker (Mosquitto)", ":1883", zh ? "所有模块注册 / 心跳 / 数据 / 控制通道，QoS 1 + LWT" : "All module registration / heartbeat / data / control, QoS 1 + LWT"],
              ["UDP Server", ":5600", zh ? "接收视觉块 JPEG 帧，帧缓冲与帧率控制" : "Receive vision block JPEG frames, frame buffering & rate control"],
              ["WebSocket Server", ":8765", zh ? "语音块双向音频流，会话管理" : "Voice block bidirectional audio, session management"],
              [zh ? "前端 WebSocket" : "Frontend WebSocket", ":3000", zh ? "向前端 UI / Agent 推送数据，接收控制指令" : "Push data to frontend / Agent, receive control commands"],
            ]}
          />
          <h4 className="mb-3 mt-8 font-mono text-xs uppercase tracking-widest text-white/40">
            {zh ? "内部组件" : "Internal components"}
          </h4>
          <Table
            headers={[zh ? "组件" : "Component", zh ? "职责" : "Purpose"]}
            rows={[
              [zh ? "事件总线" : "Event Bus", zh ? "基于 asyncio.Queue，跨服务解耦" : "asyncio.Queue based, cross-service decoupling"],
              [zh ? "节点注册表" : "Node Registry", zh ? "维护在线模块列表（类型、能力、电量、最后心跳）" : "Maintain online module list (type, capability, battery, last heartbeat)"],
              [zh ? "端口池管理" : "Port Pool", zh ? "为流式模块动态分配 / 回收专用端口" : "Dynamically allocate/recycle ports for stream modules"],
              ["AI Pipeline", zh ? "ASR（语音→文本）、视觉推理、意图编排" : "ASR (voice→text), vision inference, intent orchestration"],
            ]}
          />
        </Section>

        {/* Module Onboarding */}
        <Section id="onboarding" title={t.docs.sections.onboarding}>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] p-6 font-mono text-xs leading-relaxed text-white/70">
{`${zh ? "新模块" : "New Block"}                MQTT Broker              PC Host
  │                        │                      │
  │── 1. CONNECT ─────────→│                      │
  │  (LWT: blocks/{id}/status = "offline")        │
  │                        │                      │
  │── 2. pub announce ────→│───────────────────→ 3. ${zh ? "解析属性" : "Parse props"}
  │                        │                     ${zh ? "按 capability 分流" : "Route by capability"}
  │                        │                      │
  │                        │←── 4. pub config ───│
  │←───────────────────────│                      │

${zh ? "掉线回收" : "Disconnect recovery"}:
${zh ? "模块断线" : "Block disconnects"} → Broker ${zh ? "自动发布" : "auto-publishes"} LWT → Host ${zh ? "更新注册表" : "updates registry"}
    → ${zh ? "若为流式模块" : "If stream module"}: port_pool.release(port)`}
          </pre>
        </Section>

        {/* Data Flow - web ↔ system */}
        <Section id="dataflow" title={t.docs.sections.dataflow}>
          <h4 className="mb-3 font-mono text-xs uppercase tracking-widest text-white/40">
            {zh ? "当前（Hackathon Demo）" : "Current (Hackathon Demo)"}
          </h4>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] p-6 font-mono text-xs leading-relaxed text-white/70">
{`${zh ? "浏览器" : "Browser"} → /api/chat (Vercel Function) → OpenAI API
${zh ? "传感器数据" : "Sensor data"} = ${zh ? "前端 mock 静态值" : "Frontend mock static values"}`}
          </pre>

          <h4 className="mb-3 mt-8 font-mono text-xs uppercase tracking-widest text-white/40">
            {zh ? "后续接真实 Host" : "Future: real Host integration"}
          </h4>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] p-6 font-mono text-xs leading-relaxed text-white/70">
{`PC Host (WS:3000) ← Cloud Tunnel (WSS) → Vercel Function
                                            ↕
                                       ${zh ? "浏览器" : "Browser"} (SSE/WS)

/api/blocks      → ${zh ? "代理查 Host 节点注册表" : "Proxy to Host node registry"} → ${zh ? "返回真实在线积木" : "Real online blocks"}
/api/blocks/[id] → ${zh ? "代理查 Host 传感器数据" : "Proxy to Host sensor data"} → ${zh ? "返回真实读数" : "Real readings"}
/api/chat        → LLM + tool call → ${zh ? "通过 Host 下发 MQTT command" : "Issue MQTT command via Host"}`}
          </pre>

          <h4 className="mb-3 mt-8 font-mono text-xs uppercase tracking-widest text-white/40">
            {zh ? "数据存储（规划）" : "Data storage (planned)"}
          </h4>
          <Table
            headers={[zh ? "用途" : "Purpose", zh ? "存储" : "Storage", zh ? "说明" : "Notes"]}
            rows={[
              [zh ? "实时状态" : "Real-time state", "Redis (Upstash)", zh ? "Context Snapshot 缓存 + SSE 订阅" : "Context Snapshot cache + SSE subscription"],
              [zh ? "时序历史" : "Time series", "TimescaleDB / ClickHouse", zh ? "MVP 阶段暂不存，后续加" : "Skipped for MVP, add later"],
              [zh ? "用户 / 设备绑定" : "User / device binding", "Postgres (Neon)", "tenant ↔ host ↔ blocks"],
              [zh ? "对话记录" : "Chat history", "Postgres", zh ? "暂不持久化" : "Not persisted yet"],
            ]}
          />
        </Section>

        {/* Open API (planned) */}
        <Section id="api" title={t.docs.sections.api}>
          <div className="space-y-2">
            {[
              { method: "GET", path: "/v1/blocks", desc: zh ? "列出授权的积木" : "List authorized blocks" },
              { method: "GET", path: "/v1/blocks/{id}/context", desc: zh ? "最新 snapshot" : "Latest snapshot" },
              { method: "GET", path: "/v1/blocks/{id}/history?range=1h", desc: zh ? "时序历史" : "Time series history" },
              { method: "POST", path: "/v1/blocks/{id}/actions", desc: zh ? "下发执行器指令" : "Issue actuator command" },
              { method: "GET", path: "/v1/blocks/{id}/stream", desc: zh ? "SSE 订阅实时 context" : "SSE subscribe to real-time context" },
              { method: "POST", path: "/v1/webhooks", desc: zh ? "注册 webhook" : "Register webhook" },
            ].map((api) => (
              <div key={api.path} className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <span className={`font-mono text-xs font-bold ${api.method === "GET" ? "text-[color:var(--accent-2)]" : "text-[color:var(--accent-3)]"}`}>
                  {api.method}
                </span>
                <code className="font-mono text-sm text-white/70">{api.path}</code>
                <span className="ml-auto text-xs text-white/40">{api.desc}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-white/30">
            {zh
              ? "MCP Server：平台为每个 OAuth token 自动生成 MCP endpoint，工具和 REST 一一对应。"
              : "MCP Server: The platform auto-generates an MCP endpoint per OAuth token. Tools map 1:1 to REST endpoints."}
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6 }}
    >
      <h2 className="font-display mb-6 text-2xl font-medium tracking-tight text-white">
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-white/40"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5 last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-3 ${j === 0 ? "font-medium text-white" : "text-white/60"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[11px] text-white/40">{title}</span>
      </div>
      <pre className="px-4 py-3 font-mono text-xs text-[color:var(--accent-2)]">
        {code}
      </pre>
    </div>
  );
}
