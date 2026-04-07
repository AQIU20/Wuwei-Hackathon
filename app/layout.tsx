import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

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
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full relative">
        <div className="noise" aria-hidden />
        {children}
      </body>
    </html>
  );
}
