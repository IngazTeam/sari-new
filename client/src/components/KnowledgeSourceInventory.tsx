import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { Button } from "./ui/button";
import type { KnowledgeSourceInventory as Inventory } from "../../../shared/knowledge-source-inventory";

export function KnowledgeSourceInventory({
  onOpen,
}: {
  onOpen: (kind: keyof Inventory) => void;
}) {
  const { t } = useTranslation();
  const result = trpc.sariBrain.getSourceInventory.useQuery(undefined, {
    retry: false,
    refetchOnMount: "always",
  });
  const cards = [
    {
      kind: "documents" as const,
      title: t("merchantUx.knowledgeSources.documents"),
      help: t("merchantUx.knowledgeSources.documentHelp"),
      action: t("merchantUx.knowledgeSources.openDocuments"),
      values: [
        [
          t("merchantUx.knowledgeSources.textReady"),
          result.data?.documents.textReady,
        ],
        [
          t("merchantUx.knowledgeSources.emptyExtraction"),
          result.data?.documents.empty,
        ],
        [
          t("merchantUx.knowledgeSources.pending"),
          result.data?.documents.pending,
        ],
        [
          t("merchantUx.knowledgeSources.processing"),
          result.data?.documents.processing,
        ],
        [
          t("merchantUx.knowledgeSources.failed"),
          result.data?.documents.failed,
        ],
      ],
    },
    {
      kind: "products" as const,
      title: t("merchantUx.knowledgeSources.products"),
      help: t("merchantUx.knowledgeSources.productHelp"),
      action: t("merchantUx.knowledgeSources.openProducts"),
      values: [
        [t("merchantUx.knowledgeSources.active"), result.data?.products.active],
      ],
    },
    {
      kind: "faqs" as const,
      title: t("merchantUx.knowledgeSources.faqs"),
      help: t("merchantUx.knowledgeSources.faqHelp"),
      action: t("merchantUx.knowledgeSources.openFaqs"),
      values: [
        [t("merchantUx.knowledgeSources.enabled"), result.data?.faqs.enabled],
        [t("merchantUx.knowledgeSources.archived"), result.data?.faqs.archived],
      ],
    },
    {
      kind: "pages" as const,
      title: t("merchantUx.knowledgeSources.pages"),
      help: t("merchantUx.knowledgeSources.pageHelp"),
      action: t("merchantUx.knowledgeSources.openPages"),
      values: [
        [t("merchantUx.knowledgeSources.enabled"), result.data?.pages.enabled],
        [
          t("merchantUx.knowledgeSources.withText"),
          result.data?.pages.withText,
        ],
      ],
    },
  ];
  return (
    <section
      className="space-y-4 min-w-0"
      aria-label={t("merchantUx.knowledgeSources.title")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">
            {t("merchantUx.knowledgeSources.title")}
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
            {t("merchantUx.knowledgeSources.help")}
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-11 h-auto whitespace-normal"
          disabled={result.isFetching}
          onClick={() => void result.refetch()}
        >
          {t("merchantUx.knowledgeSources.retry")}
        </Button>
      </div>
      {result.isError ? (
        <p role="alert">{t("merchantUx.knowledgeSources.error")}</p>
      ) : !result.data ? (
        <p role="status">{t("merchantUx.knowledgeSources.loading")}</p>
      ) : (
        <>
          {result.isFetching && (
            <p role="status">{t("merchantUx.knowledgeSources.refreshing")}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {cards.map(card => (
              <Card
                className="min-w-0 flex flex-col"
                key={card.kind}
                data-source-inventory={card.kind}
              >
                <CardHeader>
                  <CardTitle className="text-base leading-7">
                    {card.title}
                  </CardTitle>
                  <CardDescription className="leading-7">
                    {card.help}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 flex flex-1 flex-col">
                  <p>
                    <strong className="text-3xl tabular-nums">
                      {result.data![card.kind].total}
                    </strong>{" "}
                    <span>{t("merchantUx.knowledgeSources.saved")}</span>
                  </p>
                  <dl className="space-y-2 flex-1">
                    {card.values.map(([label, value]) => (
                      <div
                        className="flex justify-between items-start gap-3 text-sm"
                        key={label}
                      >
                        <dt className="min-w-0 leading-6">{label}</dt>
                        <dd className="tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <Button
                    variant="outline"
                    className="min-h-11 h-auto whitespace-normal"
                    onClick={() => onOpen(card.kind)}
                  >
                    {card.action}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
