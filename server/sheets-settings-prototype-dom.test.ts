import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { MessageChannel } from "node:worker_threads";
import { JSDOM, VirtualConsole } from "jsdom";
let dom: JSDOM, w: any, errors: Error[];
const text = () => w.document.getElementById("main").textContent as string;
const button = (name: string) =>
  Array.from(w.document.querySelectorAll("#main button")).find(
    (b: any) => b.textContent.trim() === name
  ) as any;
async function click(name: string) {
  const b = button(name);
  expect(b, name).toBeTruthy();
  expect(b.disabled, name).not.toBe(true);
  b.click();
  await new Promise(r => setTimeout(r, 20));
}
async function choose(selector: string, value: string) {
  const el = w.document.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
}
describe("built settings prototype with actual workspace", () => {
  beforeEach(async () => {
    errors = [];
    const vc = new VirtualConsole();
    vc.on("jsdomError", e => errors.push(e));
    const base = "prototypes/tenant-dashboard/site/";
    dom = new JSDOM(readFileSync(base + "index.html", "utf8"), {
      url: "http://127.0.0.1:4329/#/page/merchant/sheets/settings",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole: vc,
    });
    w = dom.window;
    w.structuredClone = structuredClone;
    w.TextEncoder = TextEncoder;
    w.TextDecoder = TextDecoder;
    w.scrollTo = () => {};
    Object.defineProperty(w, "crypto", { value: webcrypto });
    w.MessageChannel = class extends MessageChannel {
      constructor() {
        super();
        this.port1.unref();
        this.port2.unref();
      }
    };
    w.fetch = vi.fn(() => {
      throw Error("Prototype must not fetch");
    });
    for (const script of Array.from(
      w.document.querySelectorAll("script[src]")
    ) as any[])
      runInContext(
        readFileSync(base + script.getAttribute("src"), "utf8"),
        dom.getInternalVMContext()
      );
    await vi.waitFor(() => expect(text()).toContain("Google Sheets"));
  });
  afterEach(() => {
    w.ImportPreview?.unmount();
    w.ProductPreview?.unmount();
    w.CustomerPreview?.unmount();
    w.ReportPreview?.unmount();
    w.OrderPreview?.unmount();
    w.QuotationPreview?.unmount();
    dom.window.close();
    expect(errors).toEqual([]);
    expect(w.fetch).not.toHaveBeenCalled();
  });


  const mode = (value: string) => choose('.pp-controls label:nth-of-type(1) select', value);
  const box=async(text:string)=>{
    const label=Array.from(w.document.querySelectorAll('.pw-workspace label')).find((el:any)=>el.textContent.trim()===text) as any;
    expect(label,text).toBeTruthy();label.querySelector('input').click();await new Promise(r=>setTimeout(r,20));
  };
  it('connects only through the local account chooser, creates once and opens the local template',async()=>{
    await click('ربط حساب Google');expect(text()).toContain('اختيار حساب تجريبي');
    await click('إلغاء ربط المثال');expect(text()).toContain('لم يُربط حساب Google');
    await click('ربط حساب Google');await click('إكمال ربط المثال');
    expect(button('إنشاء ملف البيانات').disabled).toBe(true);
    w.document.querySelector('.ds-consent input').click();await new Promise(r=>setTimeout(r,20));
    await click('إنشاء ملف البيانات');expect(text()).toContain('إنشاء ملفات محلية: 1');
    const link=w.document.querySelector('.pw-workspace a[target]');link.focus();link.click();await new Promise(r=>setTimeout(r,20));
    expect(w.document.querySelectorAll('#settings-local-destination h3')).toHaveLength(4);
    expect(w.document.activeElement.textContent).toContain('ملف المثال');
    await click('إغلاق الملف المحلي');expect(w.document.activeElement).toBe(link);
    await choose('.pp-controls label:nth-of-type(2) select','en');
    expect(text()).toContain('Connect Google Sheets');expect(text()).not.toMatch(/sheetsSettingsUx\.|sheetsOAuth\./);
  });
  it('restores lost reply and receipt across navigation without repeating creation',async()=>{
    await mode('lostReply');w.document.querySelector('.ds-consent input').click();await new Promise(r=>setTimeout(r,20));
    await click('إنشاء ملف البيانات');expect(text()).toContain('إنشاء ملفات محلية: 1');
    w.location.hash='#/page/merchant/data-sync';await vi.waitFor(()=>expect(text()).toContain('تصدير المخزون'));
    w.location.hash='#/page/merchant/sheets/settings';await vi.waitFor(()=>expect(text()).toContain('آخر محاولة لإعداد الوجهة'));
    expect(text()).toContain('إنشاء ملفات محلية: 1');expect(button('إنشاء ملف البيانات')).toBeUndefined();
  });
  it.each(['loading','offline','readError','forbidden','session','wrongTenant','malformed'])('prevents writes in %s',async value=>{
    await mode(value);expect(button('ربط حساب Google')).toBeUndefined();
    expect(button('إنشاء ملف البيانات')).toBeUndefined();expect(text()).toContain('إنشاء ملفات محلية: 0');
  });
  it('shows created receipt recovery and distinguishes previous destination',async()=>{
    await mode('created');await click('استكمال اعتماد الملف المحفوظ');expect(text()).toContain('إنشاء ملفات محلية: 0');
    await mode('oldReceipt');expect(text()).toContain('هذا إيصال سابق');
    expect(w.document.querySelectorAll('.pw-workspace a[target]')).toHaveLength(2);
  });
  it('saves only reviewed report changes and requires confirmation before disconnecting',async()=>{
    await mode('ready');await box('التقرير اليومي');expect(button('حفظ خيارات التقارير').disabled).toBe(true);
    await box('أوافق على إنشاء التقارير المختارة وإرسالها تلقائيًا.');await click('حفظ خيارات التقارير');
    expect(text()).toContain('حفظ تقارير: 1');expect(button('حفظ خيارات التقارير').disabled).toBe(true);
    await click('فصل الاتصال');expect(button('تأكيد الفصل').disabled).toBe(true);
    await box('راجعت أثر الفصل وأوافق عليه.');await click('تأكيد الفصل');
    expect(text()).toContain('لم يُربط حساب Google');expect(text()).toContain('فصل: 1');
  });
  it('blocks recreation of an uncertain attempt until explicit review',async()=>{
    await mode('uncertain');expect(button('إنشاء ملف البيانات').disabled).toBe(true);
    await click('مراجعة النتيجة يدويًا');expect(button('تسجيل المراجعة').disabled).toBe(true);
    await box('راجعت Google وأفهم أثر بدء محاولة جديدة.');await click('تسجيل المراجعة');
    expect(text()).toContain('سُجلت مراجعتك للمحاولة دون إنشاء جديد');expect(text()).toContain('إنشاء ملفات محلية: 0');
  });
});
