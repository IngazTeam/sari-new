import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { WorkspaceState } from "@/components/merchant/WorkspaceState";
import { AssistantOptionReview } from "@/components/merchant/AssistantOptionReview";
import { AssistantOptionRecovery } from "@/components/merchant/AssistantOptionRecovery";
import { useReviewedAssistantOption } from "@/hooks/useReviewedAssistantOption";
import { assistantLanguages } from "@shared/assistant-options";
type LanguageCode = (typeof assistantLanguages)[number];
const readLanguage = (value: Record<string, any>) => ({
  language: (value.language ?? "ar") as LanguageCode,
});
const input = (
  draft: { language: LanguageCode },
  expectedRevision: string
) => ({
  kind: "language" as const,
  language: draft.language,
  expectedRevision,
});
export default function LanguageSettings() {
  return (
    <KnowledgeWorkspaceScope slot="assistant-language">
      {key => <LanguageWorkspace key={key} scope={key} />}
    </KnowledgeWorkspaceScope>
  );
}
function LanguageWorkspace({ scope }: { scope: string }) {
  const { t } = useTranslation();
  const form = useReviewedAssistantOption(
    "language",
    readLanguage,
    input,
    scope
  );
  const languages = [
    { code: "ar", name: t("languageSettingsPage.text17"), flag: "🇸🇦" },
    { code: "en", name: "English", flag: "🇬🇧" },
    { code: "fr", name: "Français", flag: "🇫🇷" },
    { code: "tr", name: "Türkçe", flag: "🇹🇷" },
    { code: "es", name: "Español", flag: "🇪🇸" },
    { code: "it", name: "Italiano", flag: "🇮🇹" },
    { code: "both", name: t("botSettingsPage.langBoth"), flag: "🌐" },
  ];
  const sampleMessages = {
    ar: {
      welcome: t("languageSettingsPage.text19"),
      product: t("languageSettingsPage.text20"),
      order: t("languageSettingsPage.text21"),
      thanks: t("languageSettingsPage.text22"),
    },
    en: {
      welcome:
        "Hello! I'm Sari, your smart assistant. How can I help you today?",
      product: "We have amazing products, you can check our full catalog",
      order:
        "Perfect! I'll register your order now. Can you provide the delivery address?",
      thanks:
        "Thank you! Your order has been received and we'll contact you soon 🎉",
    },
    fr: {
      welcome:
        "Bonjour ! Je suis Sari, votre assistant intelligent. Comment puis-je vous aider aujourd'hui ?",
      product:
        "Nous avons des produits incroyables, vous pouvez consulter notre catalogue complet",
      order:
        "Parfait ! Je vais enregistrer votre commande maintenant. Pouvez-vous fournir l'adresse de livraison ?",
      thanks:
        "Merci ! Votre commande a été reçue et nous vous contacterons bientôt 🎉",
    },
    tr: {
      welcome:
        "Merhaba! Ben Sari, akıllı asistanınız. Bugün size nasıl yardımcı olabilirim?",
      product: "Harika ürünlerimiz var, tam kataloğumuzu inceleyebilirsiniz",
      order:
        "Mükemmel! Şimdi siparişinizi kaydedeceğim. Teslimat adresini verebilir misiniz?",
      thanks:
        "Teşekkürler! Siparişiniz alındı ve yakında sizinle iletişime geçeceğiz 🎉",
    },
    es: {
      welcome:
        "¡Hola! Soy Sari, tu asistente inteligente. ¿Cómo puedo ayudarte hoy?",
      product:
        "Tenemos productos increíbles, puedes ver nuestro catálogo completo",
      order:
        "¡Perfecto! Voy a registrar tu pedido ahora. ¿Puedes proporcionar la dirección de entrega?",
      thanks:
        "¡Gracias! Tu pedido ha sido recibido y te contactaremos pronto 🎉",
    },
    it: {
      welcome:
        "Ciao! Sono Sari, il tuo assistente intelligente. Come posso aiutarti oggi?",
      product:
        "Abbiamo prodotti fantastici, puoi vedere il nostro catalogo completo",
      order:
        "Perfetto! Registrerò il tuo ordine ora. Puoi fornire l'indirizzo di consegna?",
      thanks:
        "Grazie! Il tuo ordine è stato ricevuto e ti contatteremo presto 🎉",
    },
  };

  if (!form.draft || !form.base)
    return form.query.isError ? (
      <WorkspaceState kind="error" onRetry={() => void form.query.refetch()} />
    ) : (
      <p role="status">{t("common.loading")}</p>
    );
  const language = form.draft.language;
  const previewLanguages = language === "both" ? ["ar", "en"] : [language];
  const name = (code: string) =>
    languages.find(item => item.code === code)?.name || code;
  const labels = {
    welcome: t("languageSettingsPage.text10"),
    product: t("languageSettingsPage.text11"),
    order: t("languageSettingsPage.text12"),
    thanks: t("languageSettingsPage.text13"),
  };
  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">
          {t("languageSettingsPage.text2")}
        </h1>
        <p className="text-muted-foreground">
          {t("assistantSectionsUx.languageScope")}
        </p>
      </header>
      {!form.canManage && (
        <p role="note" className="rounded-xl border p-4 text-sm">
          {t("virtualTeamReview.readOnly")}
        </p>
      )}
      {form.query.isError && (
        <WorkspaceState
          kind="error"
          inline
          onRetry={() => void form.query.refetch()}
        />
      )}
      <AssistantOptionRecovery
        recovery={form.recovery}
        storageFailed={form.storageFailed}
        submitted={form.submitted && !form.busy}
        canRestore={form.canManage && !form.busy}
        onRestore={form.restore}
        onDiscard={form.discardRecovery}
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <form
          className="min-w-0 space-y-4"
          onSubmit={e => {
            e.preventDefault();
            void form.save();
          }}
        >
          <fieldset
            disabled={form.editingDisabled}
            className="min-w-0 space-y-3 rounded-xl border bg-card p-4 sm:p-6"
          >
            <legend className="px-2 font-semibold">
              {t("languageSettingsPage.text4")}
            </legend>
            {languages.map(item => (
              <label
                key={item.code}
                className={
                  "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-4 " +
                  (language === item.code ? "border-primary bg-primary/5" : "")
                }
              >
                <input
                  type="radio"
                  name="assistant-language"
                  value={item.code}
                  checked={language === item.code}
                  onChange={() =>
                    form.setDraft({ language: item.code as LanguageCode })
                  }
                />
                <span aria-hidden="true" className="text-xl">
                  {item.flag}
                </span>
                <span className="font-medium">{item.name}</span>
              </label>
            ))}
          </fieldset>
          {form.conflict && (
            <div className="space-y-3 rounded-xl border p-4">
              <p role="alert">{t("assistantOptionUx.conflict")}</p>
              {!form.latest && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={form.busy}
                  onClick={() => void form.loadReview()}
                >
                  {t("virtualTeamReview.load")}
                </Button>
              )}
              {form.latest && (
                <AssistantOptionReview
                  key={form.latest.revision}
                  base={form.base}
                  draft={form.draft}
                  latest={form.latest.draft}
                  labels={{ language: t("languageSettingsPage.text4") }}
                  display={(_, value) => name(value)}
                  disabled={!form.canManage || form.busy}
                  onApply={form.acceptReview}
                />
              )}
            </div>
          )}
          {form.error && !form.submitted && (
            <p role="alert" className="text-sm text-destructive">
              {t("assistantOptionUx.failed")}
            </p>
          )}
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <p role="status" className="text-sm text-muted-foreground">
              {t(
                form.dirty
                  ? "assistantOptionUx.unsaved"
                  : "assistantSectionsUx.saved"
              )}
            </p>
            <Button
              type="submit"
              className="min-h-11 w-full"
              disabled={form.editingDisabled || form.conflict || !form.dirty}
            >
              {t(form.busy ? "common.loading" : "languageSettingsPage.text7")}
            </Button>
          </div>
        </form>
        <section className="min-w-0 space-y-4">
          <h2 className="text-lg font-semibold">
            {t("languageSettingsPage.text8")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("assistantOptionUx.languagePreview")}
          </p>
          {previewLanguages.map(code => (
            <Card key={code}>
              <CardHeader>
                <CardTitle className="text-base">{name(code)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(
                  sampleMessages[code as keyof typeof sampleMessages] ||
                    sampleMessages.ar
                ).map(([key, text]) => (
                  <div key={key} className="rounded-xl border bg-muted/30 p-3">
                    <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                      {labels[key as keyof typeof labels]}
                    </h3>
                    <p
                      lang={code}
                      dir={code === "ar" ? "rtl" : "ltr"}
                      className="whitespace-pre-wrap text-start text-sm leading-7 [overflow-wrap:anywhere]"
                    >
                      {text}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </div>
  );
}
