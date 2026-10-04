import { z } from "zod";
import {
  sheetsConversationExportInput,
  sheetsConversationExportReceipt,
} from "../../../shared/sheets-conversation-export";
export function sheetsExportPreviewRows(
  merchantId: number,
  now: string,
  mode: string,
  input: unknown
) {
  const selection = z
    .object({
      page: z.number().int().min(1).max(100000),
      pageSize: z.literal(25),
      search: z.string().max(200),
    })
    .strict()
    .parse(input);
  const rows = Array.from({ length: mode === "empty" ? 0 : 65 }, (_, i) => ({
    id: i + 1,
    merchantId,
    customerName: "عميل تجريبي · Customer " + (i + 1),
    customerPhone:
      "999" +
      String(merchantId).padStart(3, "0") +
      String(i + 1).padStart(5, "0"),
  }));
  const matched = rows.filter(row =>
    (row.customerName + " " + row.customerPhone)
      .toLowerCase()
      .includes(selection.search.toLowerCase())
  );
  return {
    merchantId,
    items: matched.slice((selection.page - 1) * 25, selection.page * 25),
    page: selection.page,
    pageSize: 25,
    total: matched.length,
    totalPages: Math.ceil(matched.length / 25),
    checkedAt: now,
  };
}
export function sheetsExportPreviewReceipt(
  actorId: number,
  merchantId: number,
  mode: string,
  raw: unknown
) {
  const input = sheetsConversationExportInput.parse(raw);
  if (
    [
      "empty",
      "unlinked",
      "oauth-disabled",
      "credentials-invalid",
      "destination-missing",
    ].includes(mode) ||
    input.expectedSpreadsheetId !== "local-preview-" + merchantId ||
    input.conversationIds.some(id => id > 65)
  )
    throw { data: { code: "BAD_REQUEST" } };
  return sheetsConversationExportReceipt.parse({
    success: true,
    actorId,
    merchantId,
    spreadsheetId: input.expectedSpreadsheetId,
    conversationCount: input.conversationIds.length,
    messageCount: input.conversationIds.length * 3,
    message: "Local simulation only",
  });
}
