import { I18nProvider } from "@/lib/i18n";
import { Shell } from "../components/Shell";
import { MemoryBrowser } from "../components/MemoryBrowser";

export default function MemoryPage() {
  return (
    <I18nProvider>
      <Shell>
        <section className="relative mx-auto max-w-7xl px-6 pt-12 pb-20 lg:px-10">
          <MemoryBrowser />
        </section>
      </Shell>
    </I18nProvider>
  );
}
