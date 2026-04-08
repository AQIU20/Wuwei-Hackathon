"use client";

import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Nav } from "./Nav";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="relative z-[3] min-h-screen bg-white">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[900px]" />
      <Nav />
      {children}
      <Footer />
    </main>
  );
}
