"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Locale = "en" | "zh" | "ja";

export const dict = {
  en: {
    brand: "Unforce Make",
    nav: {
      home: "Home",
      agent: "Agent",
      memory: "Memory",
      dev: "Developers",
      docs: "Docs",
      cta: "Try Agent",
    },
    hero: {
      badge: "Team Unforce Make · Hackathon 2026",
      titleA: "Stack the blocks.",
      titleB: "Sense beyond yourself.",
      subtitle: "A wearable, stackable AI sensor platform — open source, fully yours.",
      desc: "Too much happens around you that you can't notice — because human senses have limits. We built AI-powered modular blocks you can wear or place anywhere. Snap them together, and let them pay attention for you.",
      primary: "Talk to the room",
      primaryHref: "/agent",
      secondary: "Developer docs",
      secondaryHref: "/dev",
      stats: [
        { k: "On you", v: "wearable" },
        { k: "Around you", v: "spatial" },
        { k: "Everywhere", v: "always-on" },
      ],
    },
    values: {
      eyebrow: "Why Unforce Make",
      cards: [
        {
          icon: "magnet",
          t: "Sense everything",
          d: "Temperature, heart rate, air quality, posture, sound, vision — 8 sensor types that snap together magnetically. From body to room, nothing goes unnoticed.",
        },
        {
          icon: "layers",
          t: "Everything in one place",
          d: "All sensors speak different protocols — MQTT, UDP, WebSocket. The Host unifies them into one stream that any app or AI can understand instantly.",
        },
        {
          icon: "brain",
          t: "Built for AI agents",
          d: "One AI that sees, hears, and understands your space — so you don't have to think about it.",
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
      lead: "Pick your modules. Build your scene.",
      items: [
        { src: "/scene-smart-cooking.png", alt: "Smart cooking assistant with voice-guided recipe and code" },
        { src: "/scene-bath-voice.png", alt: "Voice assistant for a relaxing bath experience" },
        { src: "/scene-sleep-health.png", alt: "Sleep health monitoring with heart rate tracking" },
        { src: "/scene-baby-remote.png", alt: "Remote baby monitoring with camera alerts" },
        { src: "/scene-mood-adjust.png", alt: "Mood detection that adjusts music and lighting" },
        { src: "/scene-movie-rec.png", alt: "Smart movie recommendation based on your vibe" },
        { src: "/scene-recipe-timer.png", alt: "Voice-guided recipe with timer while cooking" },
        { src: "/scene-sleep-alarm.png", alt: "Sleep quality tracking with smart alarm" },
        { src: "/scene-ambient-mood.png", alt: "Ambient music and lighting for the perfect mood" },
        { src: "/scene-meeting.png", alt: "Meeting schedule reminders at your desk" },
        { src: "/scene-sleep-tips.png", alt: "Sleep tips and smart alarm for better rest" },
        { src: "/scene-toddler-play.png", alt: "Playtime timer and nap reminder for toddlers" },
        { src: "/scene-balcony-air.png", alt: "Balcony air quality monitoring while reading" },
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
    contextMachine: {
      title: "The Context Machine",
      subtitle: "Leave your mark.",
      username: "Your name",
      usernamePlaceholder: "Enter a name for your card",
      sensorPalette: "Sensor Palette",
      stage: "Drop sensors here",
      generate: "Generate Card",
      generating: "Generating…",
      easterEggUnlock: "Unlocked",
      card: {
        title: "Moment Card",
        sensors: "Sensors",
        unlocked: "Unlocked",
      },
      waitlist: {
        title: "Join the Waitlist",
        desc: "Be the first to know when Unforce Make launches.",
        placeholder: "your@email.com",
        submit: "Join",
        success: "You're on the list!",
        duplicate: "You're already on the list!",
      },
      gallery: {
        title: "Community Gallery",
        empty: "No cards yet. Be the first!",
        post: "Post to Gallery",
        posted: "Posted!",
      },
      cta: {
        eyebrow: "Build your context",
        title: "What does your ideal room sense?",
        desc: "Drag, combine, and discover — then join the waitlist to bring it to life.",
        button: "Try the Context Machine",
      },
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
      ja: "日本語",
    },
  },
  zh: {
    brand: "无为创造",
    nav: {
      home: "首页",
      agent: "Agent",
      memory: "记忆",
      dev: "开发者",
      docs: "文档",
      cta: "试试 Agent",
    },
    hero: {
      badge: "无为创造 · 2026 黑客松",
      titleA: "拼出你的感官，",
      titleB: "感知没有边界。",
      subtitle: "可穿戴、可拼搭的 AI 感知积木平台 —— 开源，完全属于你。",
      desc: "生活里太多事，你来不及留意——因为你的感知本来就有限。我们做了一套 AI 感知积木，随身戴、随处放，模块自由拼，让它替你把该注意的都注意到。",
      primary: "和房间聊聊",
      primaryHref: "/agent",
      secondary: "开发者文档",
      secondaryHref: "/dev",
      stats: [
        { k: "随身", v: "可穿戴" },
        { k: "空间", v: "全覆盖" },
        { k: "无处不在", v: "始终感知" },
      ],
    },
    values: {
      eyebrow: "为什么选无为创造",
      cards: [
        {
          icon: "magnet",
          t: "感知一切",
          d: "温度、心率、空气质量、姿态、声音、视觉——8 种传感模块，磁吸拼接。从身体到空间，不漏掉任何细节。",
        },
        {
          icon: "layers",
          t: "一个入口，全部掌握",
          d: "传感器走 MQTT，摄像头走 UDP，麦克风走 WebSocket——Host 把所有数据统一成一个流，任何应用或 AI 都能直接读取。",
        },
        {
          icon: "brain",
          t: "为 AI 而生",
          d: "一个 AI，能看、能听、能理解你的空间——你不用操心。",
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
      lead: "选模块，拼场景。",
      items: [
        { src: "/scene-smart-cooking.png", alt: "智能烹饪助手，语音引导菜谱" },
        { src: "/scene-bath-voice.png", alt: "沐浴语音助手，放松享受" },
        { src: "/scene-sleep-health.png", alt: "睡眠健康监测，心率追踪" },
        { src: "/scene-baby-remote.png", alt: "宝宝远程看护，摄像头即时提醒" },
        { src: "/scene-mood-adjust.png", alt: "情绪感知，自动调整音乐和灯光" },
        { src: "/scene-movie-rec.png", alt: "根据你的状态智能推荐影片" },
        { src: "/scene-recipe-timer.png", alt: "语音食谱计时，做饭好帮手" },
        { src: "/scene-sleep-alarm.png", alt: "睡眠质量追踪与智能闹钟" },
        { src: "/scene-ambient-mood.png", alt: "氛围音乐灯光，打造完美心情" },
        { src: "/scene-meeting.png", alt: "会议日程提醒，高效办公" },
        { src: "/scene-sleep-tips.png", alt: "助眠建议与智能闹钟" },
        { src: "/scene-toddler-play.png", alt: "幼儿玩耍计时与午睡提醒" },
        { src: "/scene-balcony-air.png", alt: "阳台空气质量监测，惬意阅读" },
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
    contextMachine: {
      title: "语境制造机",
      subtitle: "留下你的足迹",
      username: "你的名字",
      usernamePlaceholder: "输入卡牌上的名字",
      sensorPalette: "传感器库",
      stage: "拖拽传感器到这里",
      generate: "生成卡牌",
      generating: "生成中…",
      easterEggUnlock: "已解锁",
      card: {
        title: "语境卡牌",
        sensors: "传感器",
        unlocked: "已解锁",
      },
      waitlist: {
        title: "加入等候名单",
        desc: "第一时间了解无为创造的发布动态。",
        placeholder: "your@email.com",
        submit: "加入",
        success: "你已加入名单！",
        duplicate: "你已经在名单中了！",
      },
      gallery: {
        title: "社区画廊",
        empty: "还没有卡牌，来做第一张吧！",
        post: "发布到画廊",
        posted: "已发布！",
      },
      cta: {
        eyebrow: "构建你的语境",
        title: "你的理想房间会感知什么？",
        desc: "拖拽、组合、探索——然后加入等候名单，让它成为现实。",
        button: "试试语境制造机",
      },
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
      ja: "日本語",
    },
  },
  ja: {
    brand: "Unforce Make",
    nav: {
      home: "ホーム",
      agent: "Agent",
      memory: "記憶",
      dev: "開発者",
      docs: "ドキュメント",
      cta: "Agentを試す",
    },
    hero: {
      badge: "Unforce Make · ハッカソン 2026",
      titleA: "ブロックを積む。",
      titleB: "感覚は、無限に。",
      subtitle: "あなたの空間が、あなたを理解しはじめる。",
      desc: "生活の中で気づけないことが多すぎる——人の感覚には限界があるから。AIセンサーブロックを身につけて、どこにでも置いて、自由に組み合わせる。あなたの代わりに、すべてを感じ取る。",
      primary: "部屋と話す",
      primaryHref: "/agent",
      secondary: "開発者ドキュメント",
      secondaryHref: "/dev",
      stats: [
        { k: "身につける", v: "ウェアラブル" },
        { k: "空間", v: "全方位" },
        { k: "どこでも", v: "常時感知" },
      ],
    },
    values: {
      eyebrow: "Unforce Makeの特徴",
      cards: [
        {
          icon: "magnet",
          t: "設定不要",
          d: "磁石でつなぐだけ。3秒で、空間がつながる。",
        },
        {
          icon: "layers",
          t: "すべてをひとつに",
          d: "カメラも、マイクも、センサーも——ひとつのAPIで、すべてが語りかける。",
        },
        {
          icon: "brain",
          t: "AIと話す空間",
          d: "見て、聞いて、感じて。あなたの部屋が、はじめて「わかる」ようになる。",
        },
      ],
    },
    modules: {
      eyebrow: "ブロック",
      title: "8種類のモジュール、3カテゴリ",
      categories: {
        stream: "ストリーム (ESP32-S3)",
        sensor: "センサー (ESP32-C3)",
        actuator: "アクチュエータ (ESP32-C3)",
      },
      items: [
        { id: "vision", name: "ビジョン", cat: "stream", proto: "UDP :5600", desc: "JPEG映像フレーム" },
        { id: "voice", name: "ボイス", cat: "stream", proto: "WebSocket :8765", desc: "双方向オーディオ" },
        { id: "env", name: "環境", cat: "sensor", proto: "MQTT", desc: "温度＆湿度" },
        { id: "hr", name: "心拍", cat: "sensor", proto: "MQTT", desc: "BPM & HRV" },
        { id: "hcho", name: "ホルムアルデヒド", cat: "sensor", proto: "MQTT", desc: "HCHO濃度" },
        { id: "imu", name: "姿勢", cat: "sensor", proto: "MQTT", desc: "IMU加速度＆ジャイロ" },
        { id: "light", name: "LEDストリップ", cat: "actuator", proto: "MQTT", desc: "WS2812カラー制御" },
        { id: "vibe", name: "ハプティクス", cat: "actuator", proto: "MQTT", desc: "振動モーター" },
      ],
    },
    scenes: {
      eyebrow: "ブロックのある暮らし",
      title: "すぐに使えるシーン",
      lead: "モジュールを選んで、シーンを作ろう。",
      items: [
        { src: "/scene-smart-cooking.png", alt: "スマート調理アシスタント" },
        { src: "/scene-bath-voice.png", alt: "入浴ボイスアシスタント" },
        { src: "/scene-sleep-health.png", alt: "睡眠健康モニタリング" },
        { src: "/scene-baby-remote.png", alt: "赤ちゃんリモート見守り" },
        { src: "/scene-mood-adjust.png", alt: "気分検知＆自動調整" },
        { src: "/scene-movie-rec.png", alt: "映画スマートおすすめ" },
        { src: "/scene-recipe-timer.png", alt: "音声レシピ＆タイマー" },
        { src: "/scene-sleep-alarm.png", alt: "睡眠品質＆スマートアラーム" },
        { src: "/scene-ambient-mood.png", alt: "アンビエント音楽＆照明" },
        { src: "/scene-meeting.png", alt: "会議スケジュールリマインダー" },
        { src: "/scene-sleep-tips.png", alt: "快眠アドバイス＆アラーム" },
        { src: "/scene-toddler-play.png", alt: "幼児遊び＆お昼寝リマインダー" },
        { src: "/scene-balcony-air.png", alt: "バルコニー空気品質モニター" },
      ],
    },
    team: {
      eyebrow: "チーム",
      title: "",
      desc: "",
    },
    agent: {
      header: "Unforce Agent · オンライン",
      ready: "クラウドAgent · コーディング + ハードウェア",
      placeholder: "部屋に何でも聞いてみて…",
      send: "送信",
      stop: "停止",
      suggestions: [
        "今、部屋の空気は大丈夫？",
        "読書中に姿勢を正すよう教えて",
        "照明をサンセットモードにして",
        "今のバイタルはどう？",
      ],
      thinking: "考え中…",
      signals: "ライブ信号",
      online: "オンラインブロック",
      metrics: {
        temp: "温度",
        humidity: "湿度",
        bpm: "心拍",
        hcho: "ホルムアルデヒド",
      },
      blockLabels: {
        environment: "環境",
        "heart-rate": "心拍",
        camera: "カメラ",
        voice: "ボイス",
        "led-strip": "LEDストリップ",
        haptics: "ハプティクス",
        posture: "姿勢",
        formaldehyde: "ホルムアルデヒド",
      },
      errorFallback: "Agentサーバーは現在利用できません。",
      proactive: {
        title: "プロアクティブインサイト",
        alerts: [
          { icon: "heart", text: "過去30分間の安静時心拍数が高め（平均92 bpm）。休憩をおすすめします。", severity: "warn" as const },
          { icon: "air", text: "ホルムアルデヒド濃度が上昇中 — 過去1時間で0.09→0.12 mg/m³。換気をおすすめします。", severity: "warn" as const },
          { icon: "posture", text: "55分間座りっぱなしです。ストレッチの時間です！", severity: "info" as const },
          { icon: "sleep", text: "昨夜のデータ（深い睡眠5.2h）から、午後3時以降に疲れを感じるかもしれません。20分の仮眠がおすすめです。", severity: "info" as const },
          { icon: "mood", text: "音声分析でエネルギー低下を検知。暖色モードに切り替えて気分を上げます。", severity: "action" as const },
        ],
      },
    },
    dev: {
      heroTitle: "開発者ハブ",
      heroDesc: "Unforce Makeプラットフォームで開発するために必要なすべて。",
      mqttCardTitle: "MQTT · CLI",
      pyCardTitle: "Agent · Python",
      topicsTitle: "MQTTトピック仕様",
      portsTitle: "ホストサービス",
      topics: [
        { t: "blocks/+/announce", d: "起動時にid / タイプ / 機能を報告" },
        { t: "blocks/+/status", d: "online · offline（自動LWT）" },
        { t: "blocks/+/data", d: "センサーテレメトリ（温度、IMU、心拍…）" },
        { t: "blocks/{id}/config", d: "Host → ブロックの作業設定" },
        { t: "blocks/{id}/command", d: "Agent/Host → アクチュエータコマンド" },
      ],
      services: [
        { port: ":1883", name: "MQTT Broker", tag: "Mosquitto · QoS 1 · LWT" },
        { port: ":5600", name: "UDP Server", tag: "ビジョンブロックJPEGフレーム" },
        { port: ":8765", name: "WebSocket", tag: "ボイスブロック双方向オーディオ" },
        { port: ":3000", name: "Host API", tag: "Agent＆フロントエンドゲートウェイ" },
      ],
      downloads: "ハードウェアリソース",
      downloadItems: [
        { name: "3Dモデル (.STEP)", desc: "エンクロージャ＆ドックCADファイル" },
        { name: "ファームウェアバイナリ", desc: "ビルド済みESP32-S3 / C3イメージ" },
        { name: "回路図", desc: "回路図＆BOM" },
      ],
      docsLink: "完全なプロトコルドキュメント →",
    },
    docs: {
      title: "プロトコル＆アーキテクチャ",
      desc: "Unforce Makeプラットフォームの完全な技術リファレンス。",
    },
    contextMachine: {
      title: "コンテキストマシン",
      subtitle: "あなたの足跡を残そう",
      username: "あなたの名前",
      usernamePlaceholder: "カードに表示する名前を入力",
      sensorPalette: "センサーパレット",
      stage: "ここにセンサーをドロップ",
      generate: "カードを生成",
      generating: "生成中…",
      easterEggUnlock: "アンロック済み",
      card: {
        title: "モーメントカード",
        sensors: "センサー",
        unlocked: "アンロック済み",
      },
      waitlist: {
        title: "ウェイトリストに参加",
        desc: "Unforce Makeのローンチ情報をいち早くお届けします。",
        placeholder: "your@email.com",
        submit: "参加",
        success: "リストに登録されました！",
        duplicate: "すでにリストに登録されています！",
      },
      gallery: {
        title: "コミュニティギャラリー",
        empty: "まだカードがありません。最初の一枚を作ろう！",
        post: "ギャラリーに投稿",
        posted: "投稿済み！",
      },
      cta: {
        eyebrow: "コンテキストを構築",
        title: "理想の部屋は何を感じる？",
        desc: "ドラッグ、組み合わせ、発見——そしてウェイトリストに参加して、現実にしよう。",
        button: "コンテキストマシンを試す",
      },
    },
    footer: {
      subtitle: "ハッカソン · 2026",
      blurb: "",
      github: "GitHub",
      docs: "ドキュメント",
      contact: "お問い合わせ",
    },
    lang: {
      label: "言語",
      en: "English",
      zh: "中文",
      ja: "日本語",
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
const LOCALE_STORAGE_KEY = "unforce-locale";
const LOCALE_EVENT = "unforce-locale-change";

function getStoredLocale(): Locale | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "zh" || stored === "en" || stored === "ja" ? stored : null;
}

function getPreferredLocale(): Locale {
  const stored = getStoredLocale();
  if (stored) {
    return stored;
  }

  if (typeof navigator !== "undefined") {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith("zh")) {
      return "zh";
    }
    if (lang.startsWith("ja")) {
      return "ja";
    }
  }

  return "en";
}

function subscribeToLocale(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LOCALE_STORAGE_KEY) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(LOCALE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(LOCALE_EVENT, onStoreChange);
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore<Locale>(
    subscribeToLocale,
    getPreferredLocale,
    () => 'en',
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : locale === "ja" ? "ja" : "en";
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCALE_STORAGE_KEY, l);
      window.dispatchEvent(new Event(LOCALE_EVENT));
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
