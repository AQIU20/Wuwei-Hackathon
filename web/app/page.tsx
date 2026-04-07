import { I18nProvider } from "@/lib/i18n";
import { Landing } from "./components/Landing";
import { Shell } from "./components/Shell";

export default function Page() {
  return (
    <I18nProvider>
      <Shell>
        <Landing />
      </Shell>
    </I18nProvider>
  );
}
