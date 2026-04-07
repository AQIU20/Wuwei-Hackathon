"use client";

import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";

export function DocsPage() {
  const { locale } = useI18n();
  const zh = locale === "zh";

  return (
    <div className="relative mx-auto max-w-4xl px-6 pt-16 pb-28 lg:px-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="mb-16"
      >
        <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] font-medium tracking-[-0.04em] text-gray-900">
          {zh ? "协议与架构" : "Protocol & Architecture"}
        </h1>
        <p className="mt-4 text-lg text-black/50">
          {zh
            ? "无为创造平台完整技术参考 — 覆盖桌面 Agent、硬件模块、Python Host 与 Web 前端。"
            : "Complete technical reference for the Unforce Make platform — covering the desktop Agent, hardware modules, Python Host, and Web frontend."}
        </p>
      </motion.div>

      <div className="space-y-16">
        {/* System Architecture */}
        <Section id="arch" title={zh ? "系统架构" : "System Architecture"}>
          <p className="mb-4 text-sm text-black/60">
            {zh
              ? "平台由三层组成：ESP32 硬件模块、PC Host 调度层、AI Agent 推理层。"
              : "The platform is composed of three layers: ESP32 hardware modules, PC Host dispatch layer, and AI Agent reasoning layer."}
          </p>
          <pre className="overflow-x-auto rounded-xl border border-black/10 bg-black/[0.02] p-6 font-mono text-xs leading-relaxed text-black/70">
{`┌──────────────────────────────────────────────────────────┐
│  AI Agent ${zh ? "层" : "Layer"}                                            │
│  Aila (Electron) / Web Agent (Next.js + Bun API)        │
│  LLM ${zh ? "决策" : "reasoning"} · ${zh ? "工具调用" : "tool calls"} · ${zh ? "偏好记忆" : "preference memory"}                │
├──────────────────────────────────────────────────────────┤
│  Agent Server ${zh ? "层" : "Layer"}  (Bun + Hono)                         │
│  REST API · NDJSON Stream · WebSocket Hardware Feed     │
│  HardwareStore · Session Runtime · Provider Registry    │
├──────────────────────────────────────────────────────────┤
│  ${zh ? "硬件模块层" : "Hardware Layer"}                                          │
│  ESP32-S3 (${zh ? "视觉/语音" : "vision/voice"})  ·  ESP32-C3 (${zh ? "传感器/执行器" : "sensors/actuators"})     │
│  POGO-pin ${zh ? "磁吸连接" : "magnetic connectors"} · ${zh ? "自动入网" : "auto-join Wi-Fi"}                  │
└──────────────────────────────────────────────────────────┘`}
          </pre>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-black/10 bg-black/[0.02] p-6 font-mono text-xs leading-relaxed text-black/70">
{`${zh ? "数据流" : "Data Flow"}:

${zh ? "传感器/执行器" : "Sensors/Actuators"} ──→ HardwareStore ${zh ? "模拟/接入层" : "simulation/ingress layer"}
${zh ? "桌面端" : "Desktop"} ──→ AgentRuntime ──→ LLM + ${zh ? "工具" : "tools"} ──→ HardwareStore
${zh ? "Web 前端" : "Web frontend"} ──POST──→ /v1/chat/sessions/:id/messages ──→ NDJSON ${zh ? "事件流" : "event stream"}
${zh ? "Web 前端" : "Web frontend"} ──WS────→ /v1/hardware/ws ──→ ${zh ? "实时硬件快照" : "live hardware snapshots"}`}
          </pre>
        </Section>

        {/* Desktop Agent: Aila */}
        <Section id="aila" title={zh ? "桌面 Agent: Aila" : "Desktop Agent: Aila"}>
          <p className="mb-4 text-sm text-black/60">
            {zh
              ? "Aila 是基于 Electron + React 的桌面 AI 助手，通过 IPC 桥接主进程与渲染层。"
              : "Aila is an Electron + React desktop AI assistant, bridging the main process and renderer via IPC."}
          </p>
          <pre className="overflow-x-auto rounded-xl border border-black/10 bg-black/[0.02] p-6 font-mono text-xs leading-relaxed text-black/70">
{`Electron Main Process
├── AgentService          ${zh ? "# Agent 会话管理、流式输出" : "# Agent session, streaming"}
├── ConfigService         ${zh ? "# 持久化 provider 配置" : "# Persist provider config"}
├── ProviderRegistry      ${zh ? "# 创建 LLM Model 实例" : "# Create LLM Model instances"}
├── PreferenceMemory      ${zh ? "# SQLite 偏好记忆" : "# SQLite preference memory"}
└── IPC Handlers (36)     ${zh ? "# agent / provider / model / memory" : "# agent / provider / model / memory"}

Renderer (React 19)
├── ChatPage              ${zh ? "# 对话界面" : "# Chat interface"}
│   ├── useAgentChat()    ${zh ? "# 核心 hook: rAF 缓冲 + 队列" : "# Core hook: rAF buffer + queue"}
│   ├── ChatTranscript    ${zh ? "# 消息列表" : "# Message list"}
│   ├── MessageRow        ${zh ? "# 文本/思考/工具块渲染" : "# Text/thinking/tool blocks"}
│   └── ModelSelector     ${zh ? "# 运行时切换模型" : "# Runtime model switch"}
└── SettingsPage          ${zh ? "# Provider / 搜索 / 记忆 配置" : "# Provider / search / memory config"}`}
          </pre>

          <h4 className="mb-3 mt-6 font-mono text-xs uppercase tracking-widest text-[color:var(--accent-1)]">
            {zh ? "Agent 工具" : "Agent Tools"}
          </h4>
          <Table
            headers={[zh ? "工具" : "Tool", zh ? "说明" : "Description"]}
            rows={[
              ["list_blocks", zh ? "查询在线积木列表（类型、能力、电量、状态）" : "List online blocks (type, capability, battery, status)"],
              ["get_sensor_data", zh ? "读取传感器读数（心率、温度、甲醛…）" : "Read sensor values (heart rate, temp, formaldehyde…)"],
              ["get_camera_snapshot", zh ? "获取视觉块快照" : "Capture camera block snapshot"],
              ["control_actuator", zh ? "控制执行器（灯光 RGB、振动模式）" : "Control actuators (LED RGB, vibration patterns)"],
              ["web_search", zh ? "Tavily 网络搜索" : "Tavily web search"],
              ["web_extract", zh ? "从 URL 提取内容" : "Extract content from URLs"],
            ]}
          />

          <h4 className="mb-3 mt-6 font-mono text-xs uppercase tracking-widest text-[color:var(--accent-2)]">
            {zh ? "Provider 系统" : "Provider System"}
          </h4>
          <Table
            headers={["Provider", "API", zh ? "说明" : "Notes"]}
            rows={[
              ["Anthropic", "anthropic-messages", "Claude 3.5 / 4"],
              ["OpenAI", "openai-responses", "GPT-4o / GPT-5"],
              ["Google GenAI", "google-generative-ai", "Gemini"],
              ["Google Vertex", "google-vertex", "Vertex AI"],
              [zh ? "自定义" : "Custom", zh ? "任意 API" : "Any API", zh ? "用户可添加自定义 provider" : "User-defined providers"],
            ]}
          />

          <h4 className="mb-3 mt-6 font-mono text-xs uppercase tracking-widest text-[color:var(--accent-3)]">
            {zh ? "偏好记忆" : "Preference Memory"}
          </h4>
          <p className="mb-3 text-sm text-black/60">
            {zh
              ? "SQLite 存储，每轮对话后自动提取偏好。两阶段 LLM 处理："
              : "SQLite backed, auto-extracts preferences after each turn. Two-pass LLM processing:"}
          </p>
          <Table
            headers={[zh ? "阶段" : "Phase", zh ? "职责" : "Responsibility"]}
            rows={[
              [zh ? "提取器" : "Extractor", zh ? "从对话中识别偏好候选（语言、语气、长度、编码风格…）" : "Identify preference candidates from dialog (language, tone, length, coding style…)"],
              [zh ? "协调器" : "Reconciler", zh ? "与已有记忆比对，决定 ADD / UPDATE / DELETE / NONE" : "Compare against existing memory, decide ADD / UPDATE / DELETE / NONE"],
            ]}
          />
          <div className="mt-3 space-y-1">
            {["response_language", "response_tone", "response_length", "explanation_style", "formatting_preference", "tool_preference", "coding_preference"].map((k) => (
              <span key={k} className="mr-2 inline-block rounded-full bg-black/[0.04] px-3 py-1 font-mono text-[10px] text-black/50">
                {k}
              </span>
            ))}
          </div>
        </Section>

        {/* Hardware Modules */}
        <Section id="modules" title={zh ? "硬件模块" : "Hardware Modules"}>
          <h4 className="mb-3 font-mono text-xs uppercase tracking-widest text-[color:var(--accent-1)]">
            {zh ? "高带宽流式模块" : "High-bandwidth stream modules"} (ESP32-S3)
          </h4>
          <Table
            headers={[zh ? "模块" : "Module", zh ? "协议" : "Protocol", zh ? "说明" : "Description"]}
            rows={[
              [zh ? "视觉块 Vision" : "Vision", "UDP :5600", zh ? "JPEG 视频帧，高带宽低时延，允许丢帧" : "JPEG video frames, high bandwidth low latency, tolerates drops"],
              [zh ? "语音块 Voice" : "Voice", "WebSocket :8765", zh ? "音频实时双向传输（采集 + TTS 播放）" : "Real-time bidirectional audio (capture + TTS playback)"],
            ]}
          />

          <h4 className="mb-3 mt-8 font-mono text-xs uppercase tracking-widest text-[color:var(--accent-2)]">
            {zh ? "传感器模块" : "Sensor modules"} (ESP32-C3, MQTT pub)
          </h4>
          <Table
            headers={[zh ? "模块" : "Module", "ID", zh ? "数据" : "Data"]}
            rows={[
              [zh ? "环境块" : "Environment", "env-001", zh ? "温度 (°C)、湿度 (%)" : "Temperature (°C), Humidity (%)"],
              [zh ? "心率块" : "Heart Rate", "hr-002", "BPM, HRV (ms)"],
              [zh ? "甲醛块" : "Formaldehyde", "hcho-01", "HCHO (mg/m³)"],
              [zh ? "姿态块" : "Posture", "imu-01", zh ? "IMU 加速度 / 陀螺仪, 倾斜角度" : "IMU accel/gyro, tilt degrees"],
            ]}
          />

          <h4 className="mb-3 mt-8 font-mono text-xs uppercase tracking-widest text-[color:var(--accent-3)]">
            {zh ? "执行器模块" : "Actuator modules"} (ESP32-C3, MQTT sub)
          </h4>
          <Table
            headers={[zh ? "模块" : "Module", "ID", zh ? "控制" : "Control"]}
            rows={[
              [zh ? "灯光块" : "LED Strip", "light-03", "WS2812 RGB, brightness, patterns (solid/blink/breath)"],
              [zh ? "振动块" : "Haptics", "vibe-02", zh ? "振动马达 (gentle/alert/heartbeat/double-tap)" : "Vibration motor (gentle/alert/heartbeat/double-tap)"],
            ]}
          />
        </Section>

        {/* MQTT Topics */}
        <Section id="mqtt" title={zh ? "MQTT Topic 规范" : "MQTT Topic Spec"}>
          <div className="space-y-2">
            {[
              { topic: "blocks/{module_id}/announce", desc: zh ? "模块上线自报属性（id / type / capability）" : "Module self-reports properties on boot (id / type / capability)" },
              { topic: "blocks/{module_id}/status", desc: zh ? "在线状态（LWT 自动发布 offline）" : "Online status (LWT auto-publishes offline)" },
              { topic: "blocks/{module_id}/data", desc: zh ? "传感器数据上报（JSON payload）" : "Sensor data telemetry (JSON payload)" },
              { topic: "blocks/{module_id}/config", desc: zh ? "Host → 模块的配置下发（采样间隔、通道…）" : "Host → block config (interval, channel…)" },
              { topic: "blocks/{module_id}/command", desc: zh ? "Agent/Host → 执行器控制指令" : "Agent/Host → actuator commands" },
            ].map((t) => (
              <div key={t.topic} className="flex items-center justify-between rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
                <code className="font-mono text-sm text-[color:var(--accent-2)]">{t.topic}</code>
                <span className="text-xs text-black/50">{t.desc}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Message Formats */}
        <Section id="messages" title={zh ? "消息格式" : "Message Formats"}>
          <CodeBlock title="announce" code={`{
  "id": "env-001",
  "type": "sensor",
  "capability": "temperature",
  "chip": "ESP32-C3",
  "firmware": "1.2.0"
}`} />
          <CodeBlock title={zh ? "data — 传感器示例" : "data — sensor examples"} code={`// env-001
{ "temperature_c": 29.4, "humidity_pct": 72, "timestamp": 1700000000 }

// hr-002
{ "bpm": 86, "hrv_ms": 42, "timestamp": 1700000000 }

// hcho-01
{ "hcho_mg_m3": 0.09, "timestamp": 1700000000 }

// imu-01
{ "posture": "slightly slouched", "tilt_deg": 14, "timestamp": 1700000000 }`} />
          <CodeBlock title={zh ? "command — 执行器示例" : "command — actuator examples"} code={`// light-03: set color
{ "action": "set_color", "r": 255, "g": 94, "b": 135 }
// light-03: animation mode
{ "mode": "breath", "r": 255, "g": 180, "b": 100, "duration_ms": 3000 }

// vibe-02: haptic pattern
{ "pattern": "heartbeat", "duration_ms": 800 }
// vibe-02: vibration alert
{ "pattern": "alert", "duration_ms": 1500 }`} />
          <CodeBlock title={zh ? "config — 传感器配置" : "config — sensor config"} code={`// MQTT sensor
{ "channel": "mqtt", "interval": 100 }

// Stream module (voice/vision)
{ "channel": "ws", "ws_port": 8801 }`} />
        </Section>

        {/* Host Services */}
        <Section id="services" title={zh ? "Host 服务" : "Host Services"}>
          <Table
            headers={[zh ? "服务" : "Service", zh ? "端口" : "Port", zh ? "职责" : "Purpose"]}
            rows={[
              ["MQTT Broker (Mosquitto)", ":1883", zh ? "所有模块注册 / 心跳 / 数据 / 控制，QoS 1 + LWT" : "All module registration / heartbeat / data / control, QoS 1 + LWT"],
              ["UDP Server", ":5600", zh ? "接收视觉块 JPEG 帧，帧缓冲与帧率控制" : "Receive vision block JPEG frames, frame buffering & rate control"],
              ["WebSocket Server", ":8765", zh ? "语音块双向音频流，会话管理" : "Voice block bidirectional audio, session management"],
              [zh ? "前端 Gateway" : "Frontend Gateway", ":3000", zh ? "向前端 / Agent 推送数据，接收控制指令" : "Push data to frontend / Agent, receive control commands"],
            ]}
          />
          <h4 className="mb-3 mt-8 font-mono text-xs uppercase tracking-widest text-black/40">
            {zh ? "内部组件" : "Internal Components"}
          </h4>
          <Table
            headers={[zh ? "组件" : "Component", zh ? "职责" : "Purpose"]}
            rows={[
              [zh ? "事件总线 Event Bus" : "Event Bus", zh ? "基于 asyncio.Queue，跨服务解耦通信" : "asyncio.Queue based, cross-service decoupled communication"],
              [zh ? "节点注册表 Node Registry" : "Node Registry", zh ? "维护在线模块列表（类型、能力、电量、最后心跳）" : "Maintain online modules (type, capability, battery, last heartbeat)"],
              [zh ? "端口池 Port Pool" : "Port Pool", zh ? "为流式模块动态分配 / 回收专用端口" : "Dynamically allocate/recycle ports for stream modules"],
              ["AI Pipeline", zh ? "ASR（语音→文本）、视觉推理、意图编排" : "ASR (voice→text), vision inference, intent orchestration"],
            ]}
          />
        </Section>

        {/* Module Onboarding */}
        <Section id="onboarding" title={zh ? "模块上线流程" : "Module Onboarding"}>
          <pre className="overflow-x-auto rounded-xl border border-black/10 bg-black/[0.02] p-6 font-mono text-xs leading-relaxed text-black/70">
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
${zh ? "模块断线" : "Block disconnects"} → Broker ${zh ? "自动发布" : "auto-publishes"} LWT
  → Host ${zh ? "更新注册表" : "updates registry"}
  → ${zh ? "若为流式模块" : "If stream module"}: port_pool.release(port)`}
          </pre>
        </Section>

        {/* Web Agent API */}
        <Section id="web-api" title={zh ? "Web Agent API" : "Web Agent API"}>
          <p className="mb-4 text-sm text-black/60">
            {zh
              ? "Web 前端直接连接 Bun/Hono Agent Server：先创建会话，再通过 NDJSON 流接收文本、思考和工具事件，同时通过独立 WebSocket 订阅硬件快照。"
              : "The web frontend talks directly to the Bun/Hono agent server: it creates a session, streams text/thinking/tool events over NDJSON, and subscribes to hardware snapshots over a separate WebSocket."}
          </p>
          <CodeBlock title="POST /v1/chat/sessions/:sessionId/messages" code={`// Request
{ "text": "Turn the lights warm", "locale": "en" | "zh" }

// Response: NDJSON event stream
{ "type": "assistant_start", "messageId": "..." }
{ "type": "text_delta", "messageId": "...", "delta": "..." }
{ "type": "tool_start", "messageId": "...", "name": "control_actuator", "args": {...} }
{ "type": "tool_end", "messageId": "...", "name": "control_actuator", "result": "..." }
{ "type": "complete", "messageId": "..." }`} />

          <h4 className="mb-3 mt-6 font-mono text-xs uppercase tracking-widest text-[color:var(--accent-1)]">
            {zh ? "Web Agent 工具" : "Web Agent Tools"}
          </h4>
          <Table
            headers={[zh ? "工具" : "Tool", zh ? "参数" : "Params", zh ? "说明" : "Description"]}
            rows={[
              ["readSensors", "blocks: string[]", zh ? "读取 env/hr/hcho/imu 传感器值" : "Read env/hr/hcho/imu sensor values"],
              ["setLight", "mode, r, g, b, duration_ms", zh ? "控制 WS2812 灯光（solid/blink/breath/off）" : "Control WS2812 LED (solid/blink/breath/off)"],
              ["triggerHaptic", "pattern, duration_ms", zh ? "触发振动模式（gentle/alert/heartbeat/double-tap）" : "Trigger vibration (gentle/alert/heartbeat/double-tap)"],
              ["speak", "text, voice", zh ? "TTS 语音播报（calm/neutral/warm）" : "TTS speech (calm/neutral/warm)"],
              ["listOnlineBlocks", "—", zh ? "列出所有在线积木" : "List all online blocks"],
            ]}
          />
        </Section>

        {/* Data Flow */}
        <Section id="dataflow" title={zh ? "数据流与集成" : "Data Flow & Integration"}>
          <h4 className="mb-3 font-mono text-xs uppercase tracking-widest text-black/40">
            {zh ? "当前（Hackathon Demo）" : "Current (Hackathon Demo)"}
          </h4>
          <pre className="overflow-x-auto rounded-xl border border-black/10 bg-black/[0.02] p-6 font-mono text-xs leading-relaxed text-black/70">
{`${zh ? "桌面" : "Desktop"}: Aila (Electron) → pi-coding-agent → LLM → ${zh ? "硬件 Mock 工具" : "Hardware mock tools"}
Web:  ${zh ? "浏览器" : "Browser"} → Railway Web → Railway Agent Server
                             ├─ POST /v1/chat/sessions
                             ├─ POST /v1/chat/sessions/:id/messages (NDJSON)
                             └─ GET  /v1/hardware/ws (WebSocket)`}
          </pre>

          <h4 className="mb-3 mt-8 font-mono text-xs uppercase tracking-widest text-black/40">
            {zh ? "真实硬件接入" : "Real Hardware Integration"}
          </h4>
          <pre className="overflow-x-auto rounded-xl border border-black/10 bg-black/[0.02] p-6 font-mono text-xs leading-relaxed text-black/70">
{`Hardware blocks → MQTT / UDP / WebSocket ingress → Agent Server HardwareStore
                                             ↕
                                  ${zh ? "浏览器" : "Browser"} ← /v1/blocks + /v1/hardware/ws

/v1/blocks                    → ${zh ? "返回当前在线积木与状态" : "Return current online blocks and state"}
/v1/hardware/ws               → ${zh ? "推送实时快照 / 更新" : "Push real-time snapshots / updates"}
/v1/chat/sessions/:id/messages → LLM + tool call → ${zh ? "通过 HardwareStore 执行动作" : "Execute actions via HardwareStore"}`}
          </pre>

          <h4 className="mb-3 mt-8 font-mono text-xs uppercase tracking-widest text-[color:var(--accent-3)]">
            {zh ? "Capability Schema（开源规划）" : "Capability Schema (Open Source Plan)"}
          </h4>
          <p className="mb-3 text-sm text-black/60">
            {zh
              ? "每种硬件能力用一个 JSON Schema 定义，驱动 UI 生成、LLM 工具描述和 MCP endpoint 自动注册。"
              : "Each hardware capability defined by a JSON Schema, driving UI generation, LLM tool descriptions, and MCP endpoint auto-registration."}
          </p>
          <CodeBlock title={zh ? "示例: heart_rate.json" : "Example: heart_rate.json"} code={`{
  "capability": "heart_rate",
  "type": "sensor",
  "transport": "mqtt",
  "data": {
    "bpm": { "type": "number", "unit": "bpm" },
    "spo2": { "type": "number", "unit": "%" }
  },
  "ui": { "widget": "line_chart", "label": "Heart Rate Monitor" },
  "llm_description": "Real-time heart rate and blood oxygen..."
}`} />
        </Section>

        {/* Open API (planned) */}
        <Section id="api" title={zh ? "Open API（规划中）" : "Open API (Planned)"}>
          <div className="space-y-2">
            {[
              { method: "GET", path: "/v1/blocks", desc: zh ? "列出授权的积木" : "List authorized blocks" },
              { method: "GET", path: "/v1/blocks/{id}/context", desc: zh ? "最新 context snapshot" : "Latest context snapshot" },
              { method: "GET", path: "/v1/blocks/{id}/history?range=1h", desc: zh ? "时序历史" : "Time series history" },
              { method: "POST", path: "/v1/blocks/{id}/actions", desc: zh ? "下发执行器指令" : "Issue actuator command" },
              { method: "GET", path: "/v1/blocks/{id}/stream", desc: zh ? "SSE 订阅实时 context" : "SSE subscribe to real-time context" },
              { method: "POST", path: "/v1/webhooks", desc: zh ? "注册 webhook" : "Register webhook" },
            ].map((api) => (
              <div key={api.path} className="flex items-center gap-4 rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
                <span className={`font-mono text-xs font-bold ${api.method === "GET" ? "text-[color:var(--accent-2)]" : "text-[color:var(--accent-3)]"}`}>
                  {api.method}
                </span>
                <code className="font-mono text-sm text-black/70">{api.path}</code>
                <span className="ml-auto text-xs text-black/40">{api.desc}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-black/30">
            {zh
              ? "MCP Server：平台为每个 OAuth token 自动生成 MCP endpoint，工具和 REST 一一对应。"
              : "MCP Server: The platform auto-generates an MCP endpoint per OAuth token. Tools map 1:1 to REST endpoints."}
          </p>
        </Section>

        {/* Running the Project */}
        <Section id="quickstart" title={zh ? "快速开始" : "Quick Start"}>
          <CodeBlock title={zh ? "桌面 Agent (Aila)" : "Desktop Agent (Aila)"} code={`cd hackson
bun install
bun run dev        # ${zh ? "启动 Electron 开发模式" : "Start Electron dev mode"}`} />
          <CodeBlock title={zh ? "Web 前端" : "Website"} code={`cd hackson/web
npm install
npm run dev        # ${zh ? "启动 Next.js 开发服务器" : "Start Next.js dev server"}
# ${zh ? "已部署" : "Deployed"}: https://unforce-make.vercel.app`} />
          <CodeBlock title={zh ? "代码检查" : "Linting"} code={`bun run lint       # ${zh ? "检查" : "Check"}
bun run lint:fix   # ${zh ? "修复" : "Fix"}
bun run format     # Prettier`} />
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
      <h2 className="font-display mb-6 text-2xl font-medium tracking-tight text-gray-900">
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-black/10">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-black/10 bg-black/[0.03]">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-black/40"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-black/5 last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-3 ${j === 0 ? "font-medium text-gray-900" : "text-black/60"}`}
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
    <div className="mt-4 overflow-hidden rounded-xl border border-black/10 bg-black/[0.02]">
      <div className="border-b border-black/10 px-4 py-2">
        <span className="font-mono text-[11px] text-black/40">{title}</span>
      </div>
      <pre className="px-4 py-3 font-mono text-xs text-[color:var(--accent-2)]">
        {code}
      </pre>
    </div>
  );
}
