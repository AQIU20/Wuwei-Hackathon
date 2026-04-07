import { I18nProvider } from "@/lib/i18n";
import { DocsPage } from "../../components/DocsPage";
import { Shell } from "../../components/Shell";

export default function Docs() {
  return (
    <I18nProvider>
      <Shell>
        <DocsPage />
      </Shell>
    </I18nProvider>
  );
}
