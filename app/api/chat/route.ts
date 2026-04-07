import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";

export const maxDuration = 60;

const SYSTEM_PROMPT_EN = `You are the Unforce Make Agent — the brain of a modular IoT blocks platform built by team "unforce make" for a hackathon.

The platform consists of:
- Hardware blocks (ESP32-S3 for vision/voice streams, ESP32-C3 for sensors and actuators) that snap together with POGO-pin magnetic connectors
- A Python Host (MQTT broker, UDP server, WebSocket server, AI pipeline) routing all traffic
- You: the reasoning layer, connected to the Host via MQTT and WebSocket

Currently simulated blocks online: env-001 (temperature/humidity), hr-002 (heart rate), hcho-01 (formaldehyde), vision-01 (camera), voice-01 (microphone/speaker), light-03 (WS2812 LED strip), vibe-02 (haptic vibration), imu-01 (posture).

Be concise, warm, and concrete. When the user asks something that maps to a real-world action on a block, actually call the appropriate tool — don't just describe what you would do. When answering in Chinese, keep responses short and natural; when answering in English, match the user's tone. Never mention that this is a simulation unless directly asked.`;

export async function POST(req: Request) {
  const { messages, locale }: { messages: UIMessage[]; locale?: string } =
    await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    system:
      SYSTEM_PROMPT_EN +
      (locale === "zh"
        ? "\n\nThe current user is speaking Chinese. Reply in Simplified Chinese."
        : "\n\nThe current user is speaking English. Reply in English."),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      readSensors: tool({
        description:
          "Read current values from environment / heart-rate / formaldehyde / posture sensors on the blocks mesh.",
        inputSchema: z.object({
          blocks: z
            .array(
              z.enum(["env-001", "hr-002", "hcho-01", "imu-01"]),
            )
            .describe("Which sensor block IDs to read"),
        }),
        execute: async ({ blocks }) => {
          const readings: Record<string, unknown> = {};
          for (const id of blocks) {
            switch (id) {
              case "env-001":
                readings[id] = {
                  temperature_c: 29.4,
                  humidity_pct: 72,
                  timestamp: Date.now(),
                };
                break;
              case "hr-002":
                readings[id] = { bpm: 86, hrv_ms: 42, timestamp: Date.now() };
                break;
              case "hcho-01":
                readings[id] = {
                  hcho_mg_m3: 0.09,
                  timestamp: Date.now(),
                };
                break;
              case "imu-01":
                readings[id] = {
                  posture: "slightly slouched",
                  tilt_deg: 14,
                  timestamp: Date.now(),
                };
                break;
            }
          }
          return readings;
        },
      }),
      setLight: tool({
        description:
          "Control the WS2812 LED light block (light-03). Set a static color or a simple animation.",
        inputSchema: z.object({
          mode: z.enum(["solid", "blink", "breath", "off"]),
          r: z.number().int().min(0).max(255).optional(),
          g: z.number().int().min(0).max(255).optional(),
          b: z.number().int().min(0).max(255).optional(),
          duration_ms: z.number().int().positive().optional(),
        }),
        execute: async (input) => ({
          block: "light-03",
          sent: { topic: "blocks/light-03/command", payload: input },
          ok: true,
        }),
      }),
      triggerHaptic: tool({
        description:
          "Trigger a haptic pattern on the vibration block (vibe-02).",
        inputSchema: z.object({
          pattern: z.enum(["gentle", "alert", "heartbeat", "double-tap"]),
          duration_ms: z.number().int().positive().default(800),
        }),
        execute: async (input) => ({
          block: "vibe-02",
          sent: { topic: "blocks/vibe-02/command", payload: input },
          ok: true,
        }),
      }),
      speak: tool({
        description:
          "Speak a short line through the voice block (voice-01). Use the same language as the user.",
        inputSchema: z.object({
          text: z.string().min(1).max(160),
          voice: z.enum(["calm", "neutral", "warm"]).default("warm"),
        }),
        execute: async (input) => ({
          block: "voice-01",
          sent: { topic: "blocks/voice-01/command", payload: input },
          ok: true,
        }),
      }),
      listOnlineBlocks: tool({
        description:
          "List every block currently registered with the Host, with its capability and link quality.",
        inputSchema: z.object({}),
        execute: async () => ({
          blocks: [
            { id: "env-001", capability: "environment", rssi: -52 },
            { id: "hr-002", capability: "heart-rate", rssi: -60 },
            { id: "hcho-01", capability: "formaldehyde", rssi: -58 },
            { id: "vision-01", capability: "camera", rssi: -47 },
            { id: "voice-01", capability: "voice", rssi: -49 },
            { id: "light-03", capability: "led-strip", rssi: -55 },
            { id: "vibe-02", capability: "haptics", rssi: -61 },
            { id: "imu-01", capability: "posture", rssi: -57 },
          ],
        }),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
