import { describe, expect, it } from "vitest";
import { Workbook } from "exceljs";
import {
  messageReport,
  messageReportRows,
  messageWorkbook,
} from "../client/src/lib/message-export";
import { insightCsv } from "../shared/insight-csv";
import { messageWorkspaceFixture } from "./tests/helpers/message-workspace-fixture";
import ar from "../client/src/locales/ar.json";
const t = (key: string) =>
  key.split(".").reduce((value: any, k) => value?.[k], ar) as string;
describe("complete displayed message snapshot export", () => {
  it("includes every source section, all dates and hours, current price units, and evidence limitations", () => {
    const snapshot = messageWorkspaceFixture(),
      report = messageReport(snapshot, t),
      rows = messageReportRows(report);
    expect(report.sections).toHaveLength(8);
    expect(rows).toContainEqual([ar.messageWorkspace.tenant, 20]);
    expect(rows).toContainEqual([
      ar.messageWorkspace.through,
      snapshot.through,
    ]);
    expect(report.sections[2].rows).toHaveLength(7);
    expect(report.sections[3].rows).toHaveLength(24);
    expect(report.sections[4].rows).toContainEqual([
      ar.messageWorkspace.unclassified,
      2,
      ar.messageWorkspace.unavailable,
    ]);
    expect(report.sections[6].rows[0]).toEqual([
      snapshot.products.rows[0].productName,
      3,
      1250,
      "minor",
      "SAR",
    ]);
    expect(report.sections[7].note).toContain("الملغاة");
    expect(rows).toContainEqual([
      ar.messageWorkspace.salesProficiency,
      ar.messageWorkspace.unmeasured,
    ]);
  });
  it("preserves unavailable ratios and zero confidence independently of counts", () => {
    const snapshot = messageWorkspaceFixture();
    snapshot.sentiment.confidence.average = 0;
    snapshot.orderAssociation.ratio = null;
    const report = messageReport(snapshot, t);
    expect(report.sections[5].rows[0][1]).toBe("0%");
    expect(report.sections[7].rows[2][1]).toBe(ar.messageWorkspace.unavailable);
  });
  it("round trips Arabic and formula-looking product text as XLSX strings", async () => {
    const report = messageReport(messageWorkspaceFixture(), t);
    const bytes = await messageWorkbook(report, true),
      book = new Workbook();
    await book.xlsx.load(bytes);
    expect(book.worksheets).toHaveLength(9);
    expect(book.worksheets.every(sheet => sheet.views[0].rightToLeft)).toBe(
      true
    );
    const products = book.worksheets[7];
    expect(products.getCell("A5").value).toBe(report.sections[6].rows[0][0]);
    expect(products.getCell("C5").value).toBe(1250);
    expect(products.getCell("A6").value).toBe(
      '=HYPERLINK("https://invalid.test")'
    );
  });
  it("keeps formula-looking CSV text inert and includes full rather than clipped names", () => {
    const csv = insightCsv(
      messageReportRows(messageReport(messageWorkspaceFixture(), t))
    );
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("إظهار المنتج كاملًا");
    expect(csv).toContain(ar.messageWorkspace.sentimentNote);
  });
});
