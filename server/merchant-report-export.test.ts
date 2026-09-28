import { describe, expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { reportRows, reportWorkbook, type ReportDocument } from '../client/src/lib/report-export';

describe('export the displayed report without another analytics request',()=>{
  const report:ReportDocument={title:'تقرير العملاء',period:'آخر 7 أيام',note:'تراكمي دون تحويل العملة',metrics:[{label:'العملاء',value:2}],tableTitle:'أعلى العملاء',columns:['الاسم','رقم الهاتف','المشتريات'],rows:[['ليان','0500000000',3],['=HYPERLINK("https://invalid.test")','+966500000000',1]]};
  it('retains selected period, scope, metrics, columns and rows',()=>{
    const rows=reportRows(report);expect(rows).toContainEqual([report.period]);expect(rows).toContainEqual([report.note]);expect(rows).toContainEqual(['العملاء',2]);expect(rows.slice(-2)).toEqual(report.rows);
  });
  it('round-trips Arabic, phone leading zeros, and hostile formula text as literal strings',async()=>{
    const bytes=await reportWorkbook(report,true);const book=new Workbook();await book.xlsx.load(bytes);
    const sheet=book.worksheets[0];expect(sheet.views[0].rightToLeft).toBe(true);
    const rows:any[]=[];sheet.eachRow(row=>rows.push(row.values));
    const phone=rows.find(row=>row[1]==='ليان');expect(phone[2]).toBe('0500000000');expect(phone[3]).toBe(3);
    const hostile=rows.find(row=>String(row[1]).startsWith('=HYPERLINK'));expect(typeof hostile[1]).toBe('string');
    expect(sheet.getCell('A1').value).toBe('تقرير العملاء');
  });
});
