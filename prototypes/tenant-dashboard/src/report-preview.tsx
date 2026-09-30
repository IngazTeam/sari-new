import { createRoot, type Root } from "react-dom/client";
import { ReportsWorkspace } from "../../../client/src/components/merchant/ReportsWorkspace";
import {
  reportModes,
  reportPreviewScope,
  type ReportMode,
} from "./report-model";
import {
  useReportVersion,
  reportMode,
  reportLanguage,
  setReportMode,
  setReportLanguage,
  resetReport,
  releaseReportExports,
  reportHint,
  reportPublicAction,
} from "./report-preview-state";
import "./report-preview.css";
let root: Root | null = null;
export const handles = (p: { route: string }) =>
  p?.route === "/merchant/reports";
export const render = () => '<div id="report-prototype-root"></div>';
function Preview() {
  useReportVersion();
  return (
    <div dir={reportLanguage === "ar" ? "rtl" : "ltr"}>
      <aside className="rp-controls" aria-label="محاكاة التقارير">
        <p>
          موك أب بمكوّن التقارير الفعلي. جميع السجلات والعينات مصطنعة في
          الذاكرة؛ لا قراءة لتيننت أو اتصال بمزوّد. التصدير يولّد ملفًا محليًا
          من المثال المعروض.
        </p>
        <div>
          <label>
            حالة المثال
            <select
              value={reportMode}
              onChange={e => setReportMode(e.target.value as ReportMode)}
            >
              {Object.entries(reportModes).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            اللغة / Language
            <select
              value={reportLanguage}
              onChange={e => setReportLanguage(e.target.value)}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
          <button type="button" onClick={resetReport}>
            إعادة المثال
          </button>
          <button type="button" onClick={releaseReportExports}>
            إكمال التجهيز المؤجل
          </button>
        </div>
      </aside>
      {reportHint && (
        <p className="rp-controls" role="status">
          {reportHint}
        </p>
      )}
      <ReportsWorkspace scope={reportPreviewScope} />
    </div>
  );
}
export function mount() {
  const node = document.getElementById("report-prototype-root");
  if (!node) return;
  document.body.classList.add("rp-active");
  root = createRoot(node);
  root.render(<Preview />);
}
export function unmount() {
  root?.unmount();
  root = null;
  document.body.classList.remove("rp-active");
  releaseReportExports();
}
document.addEventListener(
  "click",
  event => {
    if (!document.body.classList.contains("rp-active")) return;
    const a = (event.target as Element)?.closest<HTMLAnchorElement>(
      'a[href^="/merchant/"],a[href="/login"],a[href="/support"]'
    );
    if (a) {
      event.preventDefault();
      const href = a.getAttribute("href")!;
      if (href === "/login" || href === "/support") reportPublicAction();
      else location.hash = "#/page" + href;
    }
  },
  true
);
