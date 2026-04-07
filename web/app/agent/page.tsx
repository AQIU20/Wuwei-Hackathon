import { I18nProvider } from "@/lib/i18n";
import { AgentPanel } from "../components/AgentPanel";
import { Shell } from "../components/Shell";

export default function AgentPage() {
  return (
    <I18nProvider>
      <Shell>
        <section className="relative mx-auto max-w-7xl px-6 pt-12 pb-20 lg:px-10">
          <AgentPanel />
        </section>
      </Shell>
    </I18nProvider>
  );
}
