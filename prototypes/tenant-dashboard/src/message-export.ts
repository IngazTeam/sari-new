import {
  messageReport,
  messageReportRows,
  messagePDF,
  messageWorkbook,
  type MessageSnapshot,
} from "../../../client/src/lib/message-export";
import { insightCsv } from "../../../shared/insight-csv";
import ar from "../../../client/src/locales/ar.json";
declare const MESSAGE_PREVIEW_FONT: string;
export async function exportSnapshot(
  snapshot: MessageSnapshot,
  format: "csv" | "pdf" | "xlsx"
) {
  const report = messageReport(
    snapshot,
    key =>
      ar.messageWorkspace[
        key.replace("messageWorkspace.", "") as keyof typeof ar.messageWorkspace
      ]
  );
  report.metadata.unshift([
    "مصدر البيانات",
    "مثال تصميم محلي، لا يمثل نتائج متجر حقيقي",
  ]);
  if (format === "csv")
    return new Blob([insightCsv(messageReportRows(report))], {
      type: "text/csv;charset=utf-8",
    });
  if (format === "pdf")
    return new Blob([await messagePDF(report, true, MESSAGE_PREVIEW_FONT)], {
      type: "application/pdf",
    });
  return new Blob([new Uint8Array(await messageWorkbook(report, true))], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
