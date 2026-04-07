"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

const Logo3D = dynamic(
  () => import("./Logo3D").then((m) => m.Logo3D),
  { ssr: false },
);

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="relative mx-auto mt-10 max-w-7xl border-t border-white/10 px-6 py-14 lg:px-10">
      <div className="flex flex-col items-center gap-8">
        {/* 3D Logo */}
        <Logo3D />

        <div className="text-center">
          <div className="font-display text-lg font-medium">
            无为创造 Unforce Make
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
            {t.footer.subtitle}
          </div>
        </div>

        <p className="max-w-md text-center text-sm text-white/40">
          {t.footer.blurb}
        </p>

        <div className="flex gap-6 font-mono text-xs uppercase tracking-[0.2em] text-white/50">
          <a
            href="https://github.com/yue-tsukiii/unforce-make"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            {t.footer.github}
          </a>
          <Link href="/dev/docs" className="hover:text-white transition-colors">
            {t.footer.docs}
          </Link>
          <a href="#" className="hover:text-white transition-colors">
            {t.footer.contact}
          </a>
        </div>
      </div>
    </footer>
  );
}
