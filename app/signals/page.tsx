import { I18nProvider } from "@/lib/i18n";
import { Shell } from "../components/Shell";
import { SignalsDashboard } from "./SignalsDashboard";

export default function SignalsPage() {
  return (
    <I18nProvider>
      <Shell>
        <SignalsDashboard />
      </Shell>
    </I18nProvider>
  );
}
