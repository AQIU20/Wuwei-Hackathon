import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "无为创造 Unforce Make — Modular AI Blocks, Reimagined",
  description:
    "无为创造（Unforce Make）是一个模块化 IoT 积木平台：磁吸即插硬件、Python Host 统一调度 MQTT / UDP / WebSocket，以及理解整个空间的 AI Agent。",
  openGraph: {
    title: "无为创造 Unforce Make — Modular AI Blocks",
    description:
      "拼上积木，和房间说话。Snap the blocks together, talk to the room.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full relative">
        <div className="noise" aria-hidden />
        {children}
      </body>
    </html>
  );
}
