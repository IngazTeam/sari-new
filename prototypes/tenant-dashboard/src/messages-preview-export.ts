import {
  messageReportRows,
  messagePDF,
  messageWorkbook,
  type MessageReport,
} from "../../../client/src/lib/message-export";
import { insightCsv } from "../../../shared/insight-csv";
import type { MessagesPreviewModel } from "./messages-preview-model";
export {
  messageReport,
  type MessageSnapshot,
} from "../../../client/src/lib/message-export";
declare const MESSAGES_PREVIEW_FONT: string;
let current: MessagesPreviewModel | undefined;
export function setExportModel(model: MessagesPreviewModel) {
  current = model;
}
export async function messageExportBlob(
  source: MessageReport,
  format: "csv" | "xlsx" | "pdf",
  rtl: boolean
) {
  if (!current) throw Error("Missing local export model");
  const model = current;
  await model.prepareExport();
  const report = {
    ...source,
    metadata: [
      [
        rtl ? "مصدر البيانات" : "Data source",
        rtl
          ? "مثال محلي لا يمثل نتائج متجر حقيقي"
          : "Local sample, not actual store results",
      ],
      ...source.metadata,
    ],
  };
  if (format === "csv")
    return new Blob([insightCsv(messageReportRows(report))], {
      type: "text/csv;charset=utf-8",
    });
  if (format === "xlsx")
    return new Blob([new Uint8Array(await messageWorkbook(report, rtl))], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  return new Blob([await messagePDF(report, rtl, MESSAGES_PREVIEW_FONT)], {
    type: "application/pdf",
  });
}
