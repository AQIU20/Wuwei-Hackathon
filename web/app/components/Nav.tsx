"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { MagneticButton } from "./MagneticButton";

export function Nav() {
  const { t } = useI18n();
  const pathname = usePathname();

  const links = [
    { href: "/", label: t.nav.home },
    { href: "/agent", label: t.nav.agent },
    { href: "/dev", label: t.nav.dev },
    { href: "/dev/docs", label: t.nav.docs },
  ];

  return (
    <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 pt-8 lg:px-10">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo-orange.svg" alt="无为创造" className="h-9 w-auto" />
          <span className="font-display text-lg font-medium tracking-tight">
            无为创造 <span className="text-black/50">Unforce Make</span>
          </span>
        </Link>
      </motion.div>

      <motion.nav
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="hidden items-center gap-8 font-mono text-xs uppercase tracking-[0.18em] text-black/50 md:flex"
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={
              pathname === l.href
                ? "text-gray-900"
                : "hover:text-gray-900 transition-colors"
            }
          >
            {l.label}
          </Link>
        ))}
      </motion.nav>

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="flex items-center gap-3"
      >
        <LanguageToggle />
        <div className="hidden sm:block">
          <Link href="/agent">
            <MagneticButton className="!px-5 !py-2.5 text-xs">
              {t.nav.cta}
            </MagneticButton>
          </Link>
        </div>
      </motion.div>
    </header>
  );
}
