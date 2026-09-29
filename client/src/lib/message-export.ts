import { messageLabels } from "@/lib/message-labels";
import type { readMessageWorkspace } from "../../../server/message-workspace";
import { insightCsv } from "@shared/insight-csv";
export type MessageSnapshot = Awaited<ReturnType<typeof readMessageWorkspace>>;
export type MessageReport = {
  title: string;
  metadata: (string | number)[][];
  sections: {
    title: string;
    columns: string[];
    rows: (string | number)[][];
    note: string;
  }[];
};
export function messageReport(
  snapshot: MessageSnapshot,
  t: (key: string) => string
): MessageReport {
  const labels = messageLabels(t);
  const label = (key: keyof typeof labels) => labels[key],
    missing = label("unavailable");
  const ratio = (v: number | null) =>
    v === null ? missing : `${Number(v.toFixed(1))}%`;
  return {
    title: label("title"),
    metadata: [
      [label("tenant"), snapshot.merchantId],
      [label("from"), snapshot.from],
      [label("through"), snapshot.through],
      [label("zone"), snapshot.timeZone],
      [label("definition"), label("windowNote")],
    ],
    sections: [
      {
        title: label("messages"),
        columns: [label("metric"), label("count")],
        note: label("messageNote"),
        rows: [
          [label("total"), snapshot.messages.total],
          [label("incoming"), snapshot.messages.incoming],
          [label("outgoing"), snapshot.messages.outgoing],
          [label("activeConversations"), snapshot.messages.activeConversations],
        ],
      },
      {
        title: label("types"),
        columns: [label("type"), label("count"), label("share")],
        note: label("messageNote"),
        rows: snapshot.messages.byType.map(row => [
          label(row.kind),
          row.count,
          ratio(row.share),
        ]),
      },
      {
        title: label("daily"),
        columns: [label("date"), label("count")],
        note: label("windowNote"),
        rows: snapshot.daily.map(row => [row.date, row.count]),
      },
      {
        title: label("hourly"),
        columns: [label("hour"), label("count")],
        note: label("hourNote"),
        rows: snapshot.hourly.map(row => [
          `${String(row.hour).padStart(2, "0")}:00`,
          row.count,
        ]),
      },
      {
        title: label("sentiment"),
        columns: [label("type"), label("count"), label("share")],
        note: label("sentimentNote"),
        rows: [
          ...snapshot.sentiment.distribution.map(row => [
            label(row.kind),
            row.count,
            ratio(row.share),
          ]),
          [label("unclassified"), snapshot.sentiment.unclassified, missing],
          [
            label("coverage"),
            snapshot.sentiment.classified,
            ratio(snapshot.sentiment.classificationCoverage),
          ],
        ],
      },
      {
        title: label("confidence"),
        columns: [label("metric"), label("value")],
        note: label("confidenceNote"),
        rows: [
          [
            label("averageConfidence"),
            ratio(snapshot.sentiment.confidence.average),
          ],
          [label("validConfidence"), snapshot.sentiment.confidence.validCount],
          [
            label("invalidConfidence"),
            snapshot.sentiment.confidence.invalidCount,
          ],
        ],
      },
      {
        title: label("products"),
        columns: [
          label("product"),
          label("mentions"),
          label("rawPrice"),
          label("priceUnit"),
          label("currency"),
        ],
        note: label("productExportNote"),
        rows: snapshot.products.rows.map(row => [
          row.productName,
          row.mentionCount,
          row.price,
          row.priceUnit,
          row.currency,
        ]),
      },
      {
        title: label("orders"),
        columns: [label("metric"), label("value")],
        note: label("orderNote"),
        rows: [
          [label("newConversations"), snapshot.orderAssociation.total],
          [label("matchedConversations"), snapshot.orderAssociation.positive],
          [label("associationShare"), ratio(snapshot.orderAssociation.ratio)],
          [label("salesProficiency"), label("unmeasured")],
        ],
      },
    ],
  };
}
export function messageReportRows(report: MessageReport) {
  return [
    [report.title],
    ...report.metadata,
    ...report.sections.flatMap(section => [
      [],
      [section.title],
      [section.note],
      section.columns,
      ...section.rows,
    ]),
  ];
}
export async function messageWorkbook(report: MessageReport, rtl: boolean) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  book.creator = "Sary";
  const metadata = book.addWorksheet("Snapshot", {
    views: [{ rightToLeft: rtl }],
  });
  metadata.addRows([[report.title], ...report.metadata]);
  report.sections.forEach((section, index) => {
    const sheet = book.addWorksheet(`${index + 1}`, {
      views: [{ rightToLeft: rtl }],
    });
    sheet.addRows([
      [section.title],
      [section.note],
      [],
      section.columns,
      ...section.rows,
    ]);
    sheet.getRow(4).font = { bold: true };
  });
  book.worksheets.forEach(sheet => {
    sheet.columns.forEach(column => {
      column.width = 30;
    });
    sheet.eachRow(row => {
      row.alignment = { wrapText: true, vertical: "top" };
    });
    sheet.getRow(1).font = { bold: true, size: 16 };
  });
  return book.xlsx.writeBuffer();
}
export async function messagePDF(
  report: MessageReport,
  rtl: boolean,
  fontBase64: string
) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF();
  doc.addFileToVFS("SaryArabic.ttf", fontBase64);
  doc.addFont("SaryArabic.ttf", "SaryArabic", "normal");
  doc.setFont("SaryArabic");
  const width = doc.internal.pageSize.getWidth();
  let y = 18;
  doc.setFontSize(18);
  doc.text(report.title, rtl ? width - 14 : 14, y, {
    align: rtl ? "right" : "left",
  });
  y += 9;
  const table = (head: string[], rows: (string | number)[][]) => {
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14, bottom: 16 },
      head: head.length ? [rtl ? [...head].reverse() : head] : [],
      body: rows.map(row => (rtl ? [...row].reverse() : row)),
      styles: {
        font: "SaryArabic",
        fontStyle: "normal",
        fontSize: 9,
        cellPadding: 3,
        minCellWidth: 20,
        overflow: "linebreak",
        halign: rtl ? "right" : "left",
        textColor: [32, 36, 56],
      },
      headStyles: {
        fillColor: [81, 69, 205],
        textColor: [255, 255, 255],
        fontStyle: "normal",
      },
      alternateRowStyles: { fillColor: [247, 247, 252] },
      rowPageBreak: "avoid",
    });
    y =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 10;
  };
  table([], report.metadata);
  for (const section of report.sections) {
    if (y > 245) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(13);
    doc.text(section.title, rtl ? width - 14 : 14, y, {
      align: rtl ? "right" : "left",
    });
    y += 7;
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(section.note, width - 28);
    doc.text(lines, rtl ? width - 14 : 14, y, {
      align: rtl ? "right" : "left",
    });
    y += lines.length * 4.5 + 4;
    table(section.columns, section.rows);
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`${i} / ${pages}`, width / 2, 289, { align: "center" });
  }
  return doc.output("arraybuffer");
}
let fontPromise: Promise<string> | undefined;
async function arabicFont() {
  fontPromise ??= fetch("/central/fonts/IBMPlexSansArabic-Regular.ttf")
    .then(async response => {
      if (!response.ok) throw Error("Font unavailable");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 2_000_000)
        throw Error("Invalid font");
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(
          ...Array.from(bytes.subarray(i, i + 8192))
        );
      return btoa(binary);
    })
    .catch(error => {
      fontPromise = undefined;
      throw error;
    });
  return fontPromise;
}
export async function messageExportBlob(
  report: MessageReport,
  format: "csv" | "xlsx" | "pdf",
  rtl: boolean
) {
  if (format === "csv")
    return new Blob([insightCsv(messageReportRows(report))], {
      type: "text/csv;charset=utf-8",
    });
  if (format === "xlsx")
    return new Blob([new Uint8Array(await messageWorkbook(report, rtl))], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  return new Blob([await messagePDF(report, rtl, await arabicFont())], {
    type: "application/pdf",
  });
}
