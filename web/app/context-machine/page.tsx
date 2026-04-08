import { I18nProvider } from "@/lib/i18n";
import { Shell } from "../components/Shell";
import { ContextMachine } from "./ContextMachine";

export default function Page() {
  return (
    <I18nProvider>
      <Shell>
        <ContextMachine />
      </Shell>
    </I18nProvider>
  );
}
