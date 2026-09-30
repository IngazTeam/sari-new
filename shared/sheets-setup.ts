import { z } from "zod";
export const sheetsSetupInput = z
  .object({
    requestId: z.string().uuid(),
    expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
    reviewed: z.literal(true),
  })
  .strict();
export const sheetsSetupReceipt = z
  .object({
    requestId: z.string().uuid(),
    spreadsheetId: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),
    templateVersion: z.literal(1),
    confirmedAt: z.string().datetime(),
  })
  .strict();
export const sheetsSetupRead = z
  .object({ requestId: z.string().uuid().optional() })
  .strict();
export const sheetsSetupAcknowledge = z
  .object({ requestId: z.string().uuid(), reviewed: z.literal(true) })
  .strict();
export const sheetsSetupAttempt = z
  .object({
    merchantId: z.number().int().positive(),
    actorId: z.number().int().positive(),
    createdBy: z.number().int().positive(),
    requestId: z.string().uuid(),
    state: z.enum([
      "preparing",
      "dispatching",
      "uncertain",
      "created",
      "completed",
      "detached",
      "rejected",
      "acknowledged",
    ]),
    canAcknowledge: z.boolean(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    reason: z
      .enum(["authentication", "changed", "unavailable", "unconfirmed"])
      .nullable(),
    receipt: sheetsSetupReceipt.nullable(),
    spreadsheetId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,255}$/)
      .nullable(),
  })
  .strict();
export const sheetsSetupTabs = [
  {
    id: 1,
    title: "الطلبات",
    headers: [
      "رقم الطلب",
      "التاريخ",
      "الوقت",
      "اسم العميل",
      "رقم الجوال",
      "المنتجات",
      "الإجمالي",
      "الحالة",
      "رقم التتبع",
      "ملاحظات",
    ],
  },
  {
    id: 2,
    title: "العملاء المحتملين",
    headers: [
      "التاريخ",
      "اسم العميل",
      "رقم الجوال",
      "المصدر",
      "الحالة",
      "آخر تفاعل",
      "عدد الرسائل",
      "ملاحظات",
    ],
  },
  {
    id: 3,
    title: "المحادثات",
    headers: [
      "التاريخ",
      "الوقت",
      "اسم العميل",
      "رقم الجوال",
      "الاتجاه",
      "الرسالة",
    ],
  },
  {
    id: 4,
    title: "المخزون",
    headers: [
      "رقم المنتج",
      "اسم المنتج",
      "الفئة",
      "السعر",
      "الكمية المتاحة",
      "آخر تحديث",
    ],
  },
] as const;
export function sheetsSetupTitle(requestId: string) {
  return `ساري - بيانات المتجر · ${z.string().uuid().parse(requestId)}`;
}
export function sheetsSetupBody(requestId: string) {
  return {
    properties: { title: sheetsSetupTitle(requestId) },
    sheets: sheetsSetupTabs.map(tab => ({
      properties: {
        sheetId: tab.id,
        title: tab.title,
        sheetType: "GRID",
        rightToLeft: true,
        gridProperties: { rowCount: 1000, columnCount: 26, frozenRowCount: 1 },
      },
      data: [
        {
          startRow: 0,
          startColumn: 0,
          rowData: [
            {
              values: tab.headers.map(label => ({
                userEnteredValue: { stringValue: label },
                userEnteredFormat: { textFormat: { bold: true } },
              })),
            },
          ],
        },
      ],
    })),
  };
}
