type SensorBlockId = "env-001" | "hr-002" | "hcho-01" | "imu-01";
type OnlineBlockId =
  | SensorBlockId
  | "vision-01"
  | "voice-01"
  | "light-03"
  | "vibe-02";

type LightMode = "solid" | "blink" | "breath" | "off";
type HapticPattern = "gentle" | "alert" | "heartbeat" | "double-tap";
type VoiceStyle = "calm" | "neutral" | "warm";

type OnlineBlock = {
  id: OnlineBlockId;
  capability:
    | "environment"
    | "heart-rate"
    | "formaldehyde"
    | "camera"
    | "voice"
    | "led-strip"
    | "haptics"
    | "posture";
  rssi: number;
  status: "online";
  via: "mqtt" | "udp" | "websocket";
};

const onlineBlocks: OnlineBlock[] = [
  {
    id: "env-001",
    capability: "environment",
    rssi: -52,
    status: "online",
    via: "mqtt",
  },
  {
    id: "hr-002",
    capability: "heart-rate",
    rssi: -60,
    status: "online",
    via: "mqtt",
  },
  {
    id: "hcho-01",
    capability: "formaldehyde",
    rssi: -58,
    status: "online",
    via: "mqtt",
  },
  {
    id: "vision-01",
    capability: "camera",
    rssi: -47,
    status: "online",
    via: "udp",
  },
  {
    id: "voice-01",
    capability: "voice",
    rssi: -49,
    status: "online",
    via: "websocket",
  },
  {
    id: "light-03",
    capability: "led-strip",
    rssi: -55,
    status: "online",
    via: "mqtt",
  },
  {
    id: "vibe-02",
    capability: "haptics",
    rssi: -61,
    status: "online",
    via: "mqtt",
  },
  {
    id: "imu-01",
    capability: "posture",
    rssi: -57,
    status: "online",
    via: "mqtt",
  },
];

function createMockEnvelope<TTool extends string, TPayload>(
  tool: TTool,
  payload: TPayload,
) {
  return {
    ok: true,
    mock: true,
    tool,
    transport: "websocket-mock" as const,
    requestId: `mock-${tool}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export async function mockReadSensors(input: { blocks: SensorBlockId[] }) {
  const now = Date.now();
  const readings: Partial<Record<SensorBlockId, Record<string, unknown>>> = {};

  for (const id of input.blocks) {
    switch (id) {
      case "env-001":
        readings[id] = {
          temperature_c: 29.4,
          humidity_pct: 72,
          comfort: "warm_humid",
          timestamp: now,
        };
        break;
      case "hr-002":
        readings[id] = {
          bpm: 86,
          hrv_ms: 42,
          status: "steady",
          timestamp: now,
        };
        break;
      case "hcho-01":
        readings[id] = {
          hcho_mg_m3: 0.09,
          air_quality: "needs_attention",
          timestamp: now,
        };
        break;
      case "imu-01":
        readings[id] = {
          posture: "slightly slouched",
          tilt_deg: 14,
          stability: "stable",
          timestamp: now,
        };
        break;
    }
  }

  return createMockEnvelope("readSensors", {
    blocks: input.blocks,
    readings,
  });
}

export async function mockSetLight(input: {
  mode: LightMode;
  r?: number;
  g?: number;
  b?: number;
  duration_ms?: number;
}) {
  return createMockEnvelope("setLight", {
    block: "light-03",
    sent: {
      channel: "ws://host/blocks/light-03",
      event: "actuator.command",
      payload: input,
    },
    state: {
      mode: input.mode,
      color:
        input.mode === "off"
          ? null
          : {
              r: input.r ?? 255,
              g: input.g ?? 180,
              b: input.b ?? 90,
            },
      duration_ms: input.duration_ms ?? null,
    },
  });
}

export async function mockTriggerHaptic(input: {
  pattern: HapticPattern;
  duration_ms: number;
}) {
  return createMockEnvelope("triggerHaptic", {
    block: "vibe-02",
    sent: {
      channel: "ws://host/blocks/vibe-02",
      event: "actuator.command",
      payload: input,
    },
    state: {
      active: true,
      pattern: input.pattern,
      duration_ms: input.duration_ms,
    },
  });
}

export async function mockSpeak(input: {
  text: string;
  voice: VoiceStyle;
}) {
  return createMockEnvelope("speak", {
    block: "voice-01",
    sent: {
      channel: "ws://host/blocks/voice-01",
      event: "voice.speak",
      payload: input,
    },
    playback: {
      status: "queued",
      estimated_duration_ms: Math.max(900, input.text.length * 90),
    },
  });
}

export async function mockListOnlineBlocks() {
  return createMockEnvelope("listOnlineBlocks", {
    blocks: onlineBlocks,
  });
}
