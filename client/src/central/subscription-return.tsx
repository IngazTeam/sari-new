import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { TRPCClient } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";
import type { CentralLanguage } from "../../../shared/central/catalog";
import { trpc } from "@/lib/trpc";
import { PaymentReturnWorkspace } from "@/components/merchant/PaymentReturnWorkspace";

/** Uses the public site's transport, with isolated copy and no tenant/session state. */
export async function mountSubscriptionReturn(
  box: HTMLElement,
  lang: CentralLanguage,
  api: TRPCClient<AppRouter>
) {
  const copy =
    lang === "en"
      ? await import("../locales/en.json")
      : await import("../locales/ar.json");
  const language = createInstance();
  await language.use(initReactI18next).init({
    lng: lang,
    fallbackLng: lang,
    supportedLngs: ["ar", "en"],
    resources: {
      [lang]: {
        translation: { paymentReturnUx: copy.default.paymentReturnUx },
      },
    },
    interpolation: { escapeValue: false },
  });
  if (!box.isConnected) return;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  box.classList.add("pr-public-host");
  const container = box.closest("#central-transaction");
  container?.classList.remove("public-order");
  container?.classList.add("pr-subscription-return");
  box.removeAttribute("role");
  const root = createRoot(box);
  root.render(
    <I18nextProvider i18n={language}>
      <trpc.Provider client={api} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <PaymentReturnWorkspace
            kind="public"
            headingLevel={2}
            fullPageNavigation
          />
        </QueryClientProvider>
      </trpc.Provider>
    </I18nextProvider>
  );
  const dispose = () => {
    root.unmount();
    void queryClient.cancelQueries();
    queryClient.clear();
    window.removeEventListener("pagehide", onPageHide);
  };
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) dispose();
  };
  window.addEventListener("pagehide", onPageHide);
  return dispose;
}
