"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Locale = "en" | "zh";

export const dict = {
  en: {
    nav: {
      home: "Home",
      agent: "Agent",
      dev: "Developers",
      docs: "Docs",
      cta: "Try Agent",
    },
    hero: {
      badge: "Team Unforce Make · Hackathon 2026",
      titleA: "Stack the blocks.",
      titleB: "The room gets you.",
      desc: "Modular IoT blocks that magnetically snap together, auto-join Wi-Fi, and build a space that truly understands you.",
      primary: "Talk to the room",
      primaryHref: "/agent",
      secondary: "Developer docs",
      secondaryHref: "/dev",
      stats: [
        { k: "< 3s", v: "plug-and-play" },
        { k: "8", v: "block types" },
        { k: "4", v: "protocol lanes" },
        { k: "100%", v: "runs on-device" },
      ],
    },
    values: {
      eyebrow: "Why Unforce Make",
      cards: [
        {
          icon: "magnet",
          t: "Zero-config hardware",
          d: "POGO-pin magnetic connectors carry power and Wi-Fi credentials. A new block goes from box to mesh in under 3 seconds — no app, no pairing.",
        },
        {
          icon: "layers",
          t: "Unified Context",
          d: "ESP32 sensors speak MQTT, cameras speak UDP, mics speak WebSocket — the Host normalises everything into one Context API that any app or agent can consume.",
        },
        {
          icon: "brain",
          t: "Agent-native",
          d: "A built-in AI Agent fuses sensor data, vision and voice into a single understanding of the room. Just talk — it listens, sees, and acts.",
        },
      ],
    },
    modules: {
      eyebrow: "The blocks",
      title: "8 modules, 3 categories",
      categories: {
        stream: "Stream (ESP32-S3)",
        sensor: "Sensor (ESP32-C3)",
        actuator: "Actuator (ESP32-C3)",
      },
      items: [
        { id: "vision", name: "Vision", cat: "stream", proto: "UDP :5600", desc: "JPEG video frames" },
        { id: "voice", name: "Voice", cat: "stream", proto: "WebSocket :8765", desc: "Duplex audio" },
        { id: "env", name: "Environment", cat: "sensor", proto: "MQTT", desc: "Temperature & humidity" },
        { id: "hr", name: "Heart Rate", cat: "sensor", proto: "MQTT", desc: "BPM & HRV" },
        { id: "hcho", name: "Formaldehyde", cat: "sensor", proto: "MQTT", desc: "HCHO concentration" },
        { id: "imu", name: "Posture", cat: "sensor", proto: "MQTT", desc: "IMU accelerometer & gyro" },
        { id: "light", name: "LED Strip", cat: "actuator", proto: "MQTT", desc: "WS2812 color control" },
        { id: "vibe", name: "Haptics", cat: "actuator", proto: "MQTT", desc: "Vibration motor" },
      ],
    },
    scenes: {
      eyebrow: "Life with blocks",
      title: "Scenes that just work",
      items: [
        { src: "/scene-cooking.png", alt: "Voice assistant guides you through a recipe while cooking" },
        { src: "/scene-sleeping.png", alt: "Heart-rate block monitors your sleep in real time" },
        { src: "/scene-baby.png", alt: "Camera block watches the baby and alerts you instantly" },
        { src: "/scene-bathing.png", alt: "Relax in the bath while blocks monitor the environment" },
        { src: "/scene-mood.png", alt: "Voice block detects mood and adjusts lighting automatically" },
        { src: "/scene-blocks.png", alt: "All IoT blocks — camera, mic, sensors, and more" },
      ],
    },
    team: {
      eyebrow: "The team",
      title: "",
      desc: "",
    },
    agent: {
      header: "Unforce Agent · live",
      ready: "Cloud agent · coding + hardware",
      placeholder: "Ask the room anything…",
      send: "Send",
      stop: "Stop",
      suggestions: [
        "Is the air in the room ok?",
        "Remind me to sit straight while I'm reading",
        "Turn the lights into sunset mode",
        "How are my vitals right now?",
      ],
      thinking: "thinking…",
      signals: "live signals",
      online: "online blocks",
      metrics: {
        temp: "temp",
        humidity: "humidity",
        bpm: "bpm",
        hcho: "hcho",
      },
      blockLabels: {
        environment: "environment",
        "heart-rate": "heart rate",
        camera: "camera",
        voice: "voice",
        "led-strip": "led strip",
        haptics: "haptics",
        posture: "posture",
        formaldehyde: "formaldehyde",
      },
      errorFallback: "The agent server is unavailable right now.",
      proactive: {
        title: "Proactive Insights",
        alerts: [
          { icon: "heart", text: "Your resting heart rate has been elevated (92 bpm avg) for the past 30 min. Consider taking a break.", severity: "warn" },
          { icon: "air", text: "HCHO level rising — 0.09→0.12 mg/m³ in the last hour. Opening a window is recommended.", severity: "warn" },
          { icon: "posture", text: "You've been sitting for 55 minutes. Time to stretch!", severity: "info" },
          { icon: "sleep", text: "Based on last night's data (5.2h deep sleep), you may feel fatigued after 3 PM. A 20-min nap could help.", severity: "info" },
          { icon: "mood", text: "Voice tone analysis suggests low energy. Switching lights to warm mode to boost mood.", severity: "action" },
        ],
      },
    },
    dev: {
      heroTitle: "Developer Hub",
      heroDesc: "Everything you need to build on the Unforce Make platform.",
      mqttCardTitle: "MQTT · CLI",
      pyCardTitle: "Agent · Python",
      topicsTitle: "MQTT topic spec",
      portsTitle: "Host services",
      topics: [
        { t: "blocks/+/announce", d: "Reports id / type / capability on boot" },
        { t: "blocks/+/status", d: "online · offline (auto LWT)" },
        { t: "blocks/+/data", d: "Sensor telemetry (temp, IMU, HR…)" },
        { t: "blocks/{id}/config", d: "Host → block work config" },
        { t: "blocks/{id}/command", d: "Agent/Host → actuator commands" },
      ],
      services: [
        { port: ":1883", name: "MQTT Broker", tag: "Mosquitto · QoS 1 · LWT" },
        { port: ":5600", name: "UDP Server", tag: "Vision block JPEG frames" },
        { port: ":8765", name: "WebSocket", tag: "Voice block duplex audio" },
        { port: ":3000", name: "Host API", tag: "Agent & frontend gateway" },
      ],
      downloads: "Hardware resources",
      downloadItems: [
        { name: "3D Models (.STEP)", desc: "Enclosure & dock CAD files" },
        { name: "Firmware binaries", desc: "Pre-built ESP32-S3 / C3 images" },
        { name: "Schematics", desc: "Circuit diagrams & BOM" },
      ],
      docsLink: "Full protocol docs →",
    },
    docs: {
      title: "Protocol & Architecture",
      desc: "Complete technical reference for the Unforce Make platform.",
    },
    footer: {
      subtitle: "Hackathon · 2026",
      blurb:
        "",
      github: "GitHub",
      docs: "Docs",
      contact: "Contact",
    },
    lang: {
      label: "Language",
      en: "English",
      zh: "中文",
    },
  },
  zh: {
    nav: {
      home: "首页",
      agent: "Agent",
      dev: "开发者",
      docs: "文档",
      cta: "试试 Agent",
    },
    hero: {
      badge: "无为创造 · 2026 黑客松",
      titleA: "拼硬件如叠积木，",
      titleB: "用智能若话知音。",
      desc: "模块化 IoT 积木，磁吸即插、秒级入网，搭建一个更懂你的空间。",
      primary: "和房间聊聊",
      primaryHref: "/agent",
      secondary: "开发者文档",
      secondaryHref: "/dev",
      stats: [
        { k: "< 3 秒", v: "即插即用" },
        { k: "8", v: "种积木" },
        { k: "4", v: "条协议通道" },
        { k: "100%", v: "本地运行" },
      ],
    },
    values: {
      eyebrow: "为什么选无为创造",
      cards: [
        {
          icon: "magnet",
          t: "零配置硬件",
          d: "POGO 磁吸连接器同时传递供电和 Wi-Fi 凭证。新积木从拆箱到入网不到 3 秒 —— 不用 app，不用配对。",
        },
        {
          icon: "layers",
          t: "统一 Context",
          d: "传感器走 MQTT，摄像头走 UDP，麦克风走 WebSocket —— Host 把一切归一成一套 Context API，任何应用或 Agent 都能直接用。",
        },
        {
          icon: "brain",
          t: "原生 Agent",
          d: "内置 AI Agent 融合传感器、视觉、语音，形成对整个空间的理解。开口就行 —— 它能听、能看、能动。",
        },
      ],
    },
    modules: {
      eyebrow: "积木家族",
      title: "8 种模块，3 个分类",
      categories: {
        stream: "流式 (ESP32-S3)",
        sensor: "传感器 (ESP32-C3)",
        actuator: "执行器 (ESP32-C3)",
      },
      items: [
        { id: "vision", name: "视觉块", cat: "stream", proto: "UDP :5600", desc: "JPEG 视频帧" },
        { id: "voice", name: "语音块", cat: "stream", proto: "WebSocket :8765", desc: "双向音频" },
        { id: "env", name: "环境块", cat: "sensor", proto: "MQTT", desc: "温度 & 湿度" },
        { id: "hr", name: "心率块", cat: "sensor", proto: "MQTT", desc: "BPM & HRV" },
        { id: "hcho", name: "甲醛块", cat: "sensor", proto: "MQTT", desc: "甲醛浓度" },
        { id: "imu", name: "姿态块", cat: "sensor", proto: "MQTT", desc: "IMU 加速度 & 陀螺仪" },
        { id: "light", name: "灯光块", cat: "actuator", proto: "MQTT", desc: "WS2812 色彩控制" },
        { id: "vibe", name: "振动块", cat: "actuator", proto: "MQTT", desc: "振动马达" },
      ],
    },
    scenes: {
      eyebrow: "积木生活",
      title: "开箱即用的场景",
      items: [
        { src: "/scene-cooking.png", alt: "语音块在你做饭时引导你完成菜谱" },
        { src: "/scene-sleeping.png", alt: "心率块实时监测你的睡眠" },
        { src: "/scene-baby.png", alt: "摄像头块看护宝宝，即时提醒你" },
        { src: "/scene-bathing.png", alt: "泡澡放松，积木为你监控环境" },
        { src: "/scene-mood.png", alt: "语音块感知情绪，自动调整灯光" },
        { src: "/scene-blocks.png", alt: "全系列 IoT 积木 — 摄像头、麦克风、传感器等" },
      ],
    },
    team: {
      eyebrow: "团队",
      title: "",
      desc: "",
    },
    agent: {
      header: "Unforce Agent · 在线",
      ready: "云端 Agent · coding + hardware",
      placeholder: "随便问问这个房间……",
      send: "发送",
      stop: "停止",
      suggestions: [
        "现在房间空气还好吗？",
        "我读书的时候提醒我坐直",
        "把灯调成日落的感觉",
        "我现在的身体状况怎么样？",
      ],
      thinking: "思考中……",
      signals: "实时信号",
      online: "在线积木",
      metrics: {
        temp: "温度",
        humidity: "湿度",
        bpm: "心率",
        hcho: "甲醛",
      },
      blockLabels: {
        environment: "环境",
        "heart-rate": "心率",
        camera: "摄像头",
        voice: "语音",
        "led-strip": "灯带",
        haptics: "振动",
        posture: "姿态",
        formaldehyde: "甲醛",
      },
      errorFallback: "Agent 服务暂时不可用。",
      proactive: {
        title: "主动洞察",
        alerts: [
          { icon: "heart", text: "过去 30 分钟静息心率偏高（均值 92 bpm），建议休息一下。", severity: "warn" },
          { icon: "air", text: "甲醛浓度上升中 — 过去一小时从 0.09 升至 0.12 mg/m³，建议开窗通风。", severity: "warn" },
          { icon: "posture", text: "你已经坐了 55 分钟了，该起来活动一下！", severity: "info" },
          { icon: "sleep", text: "根据昨晚数据（深度睡眠 5.2h），下午 3 点后可能会疲倦，建议小睡 20 分钟。", severity: "info" },
          { icon: "mood", text: "语音情绪分析显示能量偏低，正在切换灯光至暖色模式提升状态。", severity: "action" },
        ],
      },
    },
    dev: {
      heroTitle: "开发者中心",
      heroDesc: "在无为创造平台上构建所需的一切。",
      mqttCardTitle: "MQTT · 命令行",
      pyCardTitle: "Agent · Python",
      topicsTitle: "MQTT Topic 规范",
      portsTitle: "Host 服务端口",
      topics: [
        { t: "blocks/+/announce", d: "模块上线上报 id / 类型 / 能力" },
        { t: "blocks/+/status", d: "online · offline（LWT 自动）" },
        { t: "blocks/+/data", d: "传感器数据（温度、姿态、心率…）" },
        { t: "blocks/{id}/config", d: "Host → 模块的工作配置" },
        { t: "blocks/{id}/command", d: "Agent / Host → 执行器指令" },
      ],
      services: [
        { port: ":1883", name: "MQTT Broker", tag: "Mosquitto · QoS 1 · LWT" },
        { port: ":5600", name: "UDP Server", tag: "视觉块 JPEG 帧" },
        { port: ":8765", name: "WebSocket", tag: "语音块双向音频" },
        { port: ":3000", name: "Host API", tag: "Agent 与前端统一网关" },
      ],
      downloads: "硬件资源",
      downloadItems: [
        { name: "3D 模型 (.STEP)", desc: "外壳 & 底座 CAD 文件" },
        { name: "固件二进制", desc: "预编译 ESP32-S3 / C3 镜像" },
        { name: "原理图", desc: "电路图 & BOM 清单" },
      ],
      docsLink: "完整协议文档 →",
    },
    docs: {
      title: "协议与架构",
      desc: "无为创造平台完整技术参考。",
    },
    footer: {
      subtitle: "黑客松 · 2026",
      blurb:
        "",
      github: "GitHub",
      docs: "文档",
      contact: "联系",
    },
    lang: {
      label: "语言",
      en: "English",
      zh: "中文",
    },
  },
};

export type Dict = (typeof dict)["en"];

type Ctx = {
  locale: Locale;
  t: Dict;
  setLocale: (l: Locale) => void;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? (localStorage.getItem("unforce-locale") as Locale | null)
        : null;
    if (stored === "zh" || stored === "en") {
      setLocaleState(stored);
      return;
    }
    if (typeof navigator !== "undefined") {
      const lang = navigator.language.toLowerCase();
      if (lang.startsWith("zh")) setLocaleState("zh");
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      localStorage.setItem("unforce-locale", l);
    }
  }, []);

  return (
    <I18nContext.Provider value={{ locale, t: dict[locale], setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
