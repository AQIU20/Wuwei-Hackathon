import { I18nProvider } from "@/lib/i18n";
import { Shell } from "../../components/Shell";
import { DocsComingSoon } from "./DocsComingSoon";

export default function Page() {
  return (
    <I18nProvider>
      <Shell>
        <DocsComingSoon />
      </Shell>
    </I18nProvider>
  );
}
