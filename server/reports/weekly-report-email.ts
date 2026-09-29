import {
  insightDate,
  insightStoredList,
  sentimentObservation,
} from "../../shared/insights-workspace";

type EmailReport = {
  weekStartDate: string;
  weekEndDate: string;
  totalConversations: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  topKeywords: string | null;
  topComplaints: string | null;
  recommendations: string | null;
};
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    char =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!
  );
const date = (value: string) =>
  insightDate(value)?.replace("T", " ").replace(".000Z", " UTC") ??
  "تاريخ غير متاح";
const pct = (value: number | null) =>
  value === null ? "غير متاح" : `${Number(value.toFixed(1))}%`;

/** One safe, fluid email view for both legacy report producers. Stored prose is always text. */
export function renderWeeklyReportEmail(
  report: EmailReport,
  businessName: string
) {
  const observation = sentimentObservation(report);
  const section = (title: string, raw: string | null) => {
    const stored = insightStoredList(raw);
    const content =
      stored.format === "list"
        ? `<ul>${stored.items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : stored.format === "legacy"
          ? `<p>نص محفوظ بصيغة قديمة:</p><p style="white-space:pre-wrap">${escapeHtml(stored.raw!)}</p>`
          : "<p>لا يوجد نص محفوظ في هذا التقرير.</p>";
    return `<section><h2>${title}</h2>${content}</section>`;
  };
  const negative =
    observation.valid && observation.total > 0
      ? (observation.negative / observation.total) * 100
      : null;
  const rows = [
    ["المحادثات في العينة المحفوظة", observation.total],
    ["مصنفة إيجابية", observation.positive],
    ["مصنفة سلبية", observation.negative],
    ["مصنفة محايدة", observation.neutral],
    ["غير مصنفة", observation.unclassified ?? "غير متاح"],
    ["حصة الإيجابي من العينة", pct(observation.positiveShare)],
    ["حصة السلبي من العينة", pct(negative)],
  ];
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تقرير المشاعر المحفوظ</title>
<style>body{margin:0;background:#f5f6fa;color:#202438;font:16px/1.8 Tahoma,Arial,sans-serif}*{box-sizing:border-box}h1{font-size:24px;margin:0}h2{font-size:18px;margin:24px 0 8px}p{margin:8px 0}td,th,li,p,h1{overflow-wrap:anywhere;word-break:break-word}th{text-align:right;font-weight:400}td{font-weight:700;text-align:left}li{margin:8px 0}ul{padding-inline-start:24px}section{border-top:1px solid #e6e8ef;margin-top:24px}a{color:#5145cd}@media(max-width:400px){.content{padding:16px!important}h1{font-size:21px}}</style></head>
<body><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:auto;background:white;border:1px solid #e6e8ef;border-radius:16px;table-layout:fixed"><tr><td class="content" style="padding:28px;text-align:right;font-weight:400">
<p style="color:#5145cd;font-weight:700">ساري · تقارير المحادثات</p><h1>تقرير المشاعر المحفوظ</h1><p>${escapeHtml(businessName)}</p><p dir="ltr" style="text-align:right;font-size:13px">${escapeHtml(date(report.weekStartDate))} — ${escapeHtml(date(report.weekEndDate))}</p>
<p style="background:#f3f1ff;border-radius:8px;padding:12px">هذه تصنيفات محفوظة للمراجعة، وليست قياسًا لرضا العملاء أو احتراف المبيعات. لا يحتوي هذا التقرير على دليل كامل لمصادر العينة وطريقة توليدها.</p>
${!observation.valid ? '<p role="alert">العدادات المحفوظة غير متسقة؛ لا يمكن حساب نسبة موثوقة منها.</p>' : observation.total === 0 ? "<p>العينة فارغة؛ لا توجد نسبة يمكن حسابها.</p>" : ""}
<table width="100%" style="table-layout:fixed;border-collapse:collapse">${rows.map(([label, value]) => `<tr><th scope="row" style="padding:8px;border-bottom:1px solid #e6e8ef">${label}</th><td style="padding:8px;border-bottom:1px solid #e6e8ef">${escapeHtml(String(value))}</td></tr>`).join("")}</table>
<p>الكلمات والشكاوى نصوص محفوظة؛ لا تثبت عدد تكرارها خلال الفترة. التوصيات اقتراحات تحتاج مراجعة بشرية.</p>
${section("الكلمات المحفوظة", report.topKeywords)}${section("الشكاوى المحفوظة", report.topComplaints)}${section("التوصيات المحفوظة", report.recommendations)}
<p style="margin-top:28px"><a href="https://sary.live/merchant/insights">فتح التقارير في لوحة ساري</a></p>
</td></tr></table></td></tr></table></body></html>`;
}
