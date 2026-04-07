import { I18nProvider } from "@/lib/i18n";
import { DevHub } from "../components/DevHub";
import { Shell } from "../components/Shell";

export default function DevPage() {
  return (
    <I18nProvider>
      <Shell>
        <DevHub />
      </Shell>
    </I18nProvider>
  );
}
