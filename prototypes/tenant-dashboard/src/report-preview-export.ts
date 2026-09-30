import {
  reportWorkbook as workbook,
  type ReportDocument,
} from "../../../client/src/lib/report-export";
import { reportMode, waitReportExport } from "./report-preview-state";
export async function reportWorkbook(report: ReportDocument, rtl: boolean) {
  if (reportMode === "exportError")
    throw Error("Simulated local export failure");
  if (reportMode === "exportSlow") await waitReportExport();
  return workbook(report, rtl);
}
