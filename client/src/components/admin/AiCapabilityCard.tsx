import { useTranslation } from "react-i18next";
import type { AiCapabilityManifest } from "../../../../shared/ai-capabilities";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AiCapabilityCard({
  manifest,
  loading,
  failed,
  refreshing,
  onRefresh,
}: {
  manifest?: AiCapabilityManifest;
  loading: boolean;
  failed: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const names = {
    text: t("merchantUx.aiCapabilities.text"),
    structured: t("merchantUx.aiCapabilities.structured"),
    transcription: t("merchantUx.aiCapabilities.transcription"),
    embedding: t("merchantUx.aiCapabilities.embedding"),
  };
  const states = {
    configured: t("merchantUx.aiCapabilities.configured"),
    missing: t("merchantUx.aiCapabilities.missing"),
    unreadable: t("merchantUx.aiCapabilities.unreadable"),
    disabled: t("merchantUx.aiCapabilities.disabled"),
  };
  const detail = {
    text: t("merchantUx.aiCapabilities.textScope"),
    structured: t("merchantUx.aiCapabilities.structuredScope"),
    transcription: t("merchantUx.aiCapabilities.transcriptionScope"),
    embedding: t("merchantUx.aiCapabilities.embeddingScope"),
  };
  return (
    <Card data-ai-capabilities>
      <CardHeader>
        <CardTitle>{t("merchantUx.aiCapabilities.title")}</CardTitle>
        <CardDescription>
          {t("merchantUx.aiCapabilities.scope")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 min-w-0">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 whitespace-normal"
          disabled={loading || refreshing}
          onClick={onRefresh}
        >
          {t("merchantUx.aiCapabilities.refresh")}
        </Button>
        {loading ? (
          <p role="status">{t("merchantUx.aiCapabilities.loading")}</p>
        ) : failed || !manifest ? (
          <p role="alert">{t("merchantUx.aiCapabilities.failed")}</p>
        ) : (
          <>
            <p data-ai-mode className="font-medium">
              {manifest.mode === "mixed"
                ? t("merchantUx.aiCapabilities.mixed")
                : t("merchantUx.aiCapabilities.openai")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("merchantUx.aiCapabilities.budget")}
            </p>
            <ul className="grid gap-3 md:grid-cols-2">
              {manifest.rows.map(row => (
                <li
                  data-ai-capability={row.capability}
                  key={row.capability}
                  className="min-w-0 rounded-lg border p-4 space-y-2"
                >
                  <h3 className="font-semibold">{names[row.capability]}</h3>
                  <p dir="ltr" className="[overflow-wrap:anywhere]">
                    {row.provider === "zahypi" ? "ZahyPi" : "OpenAI"} ·{" "}
                    {row.model}
                  </p>
                  <p data-ai-capability-state className="text-sm font-medium">
                    {states[row.state]}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {detail[row.capability]}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              {t("merchantUx.aiCapabilities.certification")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
