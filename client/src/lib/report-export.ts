export type ReportDocument = {
  title: string;
  period: string;
  note: string;
  metrics: { label: string; value: string | number }[];
  tableTitle: string;
  columns: string[];
  rows: (string | number)[][];
};

export function reportRows(report: ReportDocument): (string | number)[][] {
  return [
    [report.title],
    [report.period],
    [report.note],
    [],
    ...report.metrics.map(m => [m.label, m.value]),
    [],
    [report.tableTitle],
    report.columns,
    ...report.rows,
  ];
}

export async function reportWorkbook(report: ReportDocument, rtl: boolean) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Report", {
    views: [{ rightToLeft: rtl }],
  });
  sheet.addRows(reportRows(report));
  sheet.columns.forEach(column => {
    column.width = 30;
  });
  sheet.getRow(1).font = { bold: true, size: 18 };
  sheet.eachRow(row => {
    row.alignment = { wrapText: true, vertical: "top" };
  });
  // Text is assigned as a string, never as an Excel formula object.
  return workbook.xlsx.writeBuffer();
}
