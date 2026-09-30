import {
  templateListInput,
  templateWriteInput,
  type TemplateRecord,
  type TemplateReceipt,
  type TemplateWorkspace,
} from "../../../shared/quotation-templates";
export const templatePreviewId = 9000058;
export const templatePreviewScope = `${templatePreviewId}:${templatePreviewId}:quotation-templates`;
export const templateModes = {
  data: "بيانات توضيحية",
  empty: "بلا قوالب",
  large: "سجل قديم مرقم",
  limit: "الوصول إلى حد الإضافة",
  loading: "جارٍ التحميل",
  error: "تعذر القراءة",
  forbidden: "دون صلاحية قراءة",
  viewer: "قراءة فقط",
  conflict: "تعارض عند الحفظ",
  lost: "حُفظ الطلب وضاعت الاستجابة",
} as const;
export type TemplateMode = keyof typeof templateModes;
const fail = (code: string): never => {
  throw Object.assign(Error(code), { data: { code } });
};
/** Memory-only interaction fixture. Opaque revision tokens are illustrative, not server digests. */
export class TemplatePreviewModel {
  mode: TemplateMode = "data";
  revision = 0;
  private listeners = new Set<() => void>();
  private rows = new Map<number, TemplateRecord>();
  private counter = 100;
  private token = 100;
  private receipts = new Map<
    string,
    { input: string; value: TemplateReceipt }
  >();
  private conflicts = new Set<number>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  changed() {
    this.revision++;
    this.listeners.forEach(fn => fn());
  }
  constructor() {
    this.reset();
  }
  private digest() {
    return (++this.token).toString(16).padStart(64, "0");
  }
  reset() {
    this.rows.clear();
    this.receipts.clear();
    this.conflicts.clear();
    this.counter = 100;
    this.mode = "data";
    for (let i = 1; i <= 27; i++) {
      const long = i === 27;
      this.rows.set(i, {
        id: i,
        merchantId: templatePreviewId,
        name:
          i === 1
            ? "قالب الشروط العامة"
            : i === 2
              ? "قالب الخدمات"
              : `قالب توضيحي ${i}`,
        headerImageUrl: null,
        termsText: long
          ? "نص قديم طويل · ".repeat(400).slice(0, 5001)
          : `نص تجريبي للقالب ${i}.\nراجع شروط هذا العرض وأسعاره وصلاحيته قبل إرساله.`,
        footerText: "نسعد بخدمتك. هذا محتوى توضيحي للموك أب.",
        isDefault: i === 1,
        digest: this.digest(),
        createdAt: "2026-09-30T00:00:00Z",
        truncated: long,
        editable: !long,
      });
    }
    this.changed();
  }
  setMode(mode: TemplateMode) {
    if (!Object.hasOwn(templateModes, mode))
      throw Error("Invalid template mode");
    this.mode = mode;
    this.changed();
  }
  access(write = false) {
    if (this.mode === "error") fail("INTERNAL_SERVER_ERROR");
    if (this.mode === "forbidden" || (write && this.mode === "viewer"))
      fail("FORBIDDEN");
  }
  private visible() {
    const count =
      this.mode === "empty"
        ? 0
        : this.mode === "large"
          ? 27
          : this.mode === "limit"
            ? 20
            : 6;
    return [...this.rows.values()].filter(
      row => row.id <= count || row.id >= 100
    );
  }
  workspace(raw: unknown): TemplateWorkspace {
    this.access();
    const input = templateListInput.parse(raw),
      all = this.visible(),
      filtered = all
        .filter(r =>
          r.name.toLocaleLowerCase().includes(input.search.toLocaleLowerCase())
        )
        .sort(
          (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.id - b.id
        ),
      pages = Math.max(1, Math.ceil(filtered.length / 20)),
      page = Math.min(pages, input.page);
    return structuredClone({
      merchantId: templatePreviewId,
      selection: input,
      page,
      pageSize: 20,
      total: all.length,
      filtered: filtered.length,
      pages,
      limit: 20,
      canManage: this.mode !== "viewer",
      items: filtered.slice((page - 1) * 20, page * 20),
    });
  }
  detail(id: number) {
    this.access();
    const row = this.visible().find(r => r.id === id);
    return row ? structuredClone(row) : null;
  }
  receipt(requestId: string) {
    this.access(true);
    return structuredClone(this.receipts.get(requestId)?.value ?? null);
  }
  write(raw: unknown): TemplateReceipt {
    this.access(true);
    const input = templateWriteInput.parse(raw),
      encoded = JSON.stringify(input),
      prior = this.receipts.get(input.requestId);
    if (prior) {
      if (prior.input !== encoded) fail("CONFLICT");
      return structuredClone(prior.value);
    }
    let row: TemplateRecord | undefined,
      resultDigest: string | null = null,
      recordId: number;
    if (input.action === "create") {
      if (this.visible().length >= 20) fail("PRECONDITION_FAILED");
      recordId = this.counter++;
      row = {
        ...input.fields,
        id: recordId,
        merchantId: templatePreviewId,
        digest: this.digest(),
        createdAt: new Date().toISOString(),
        editable: true,
        truncated: false,
      };
    } else {
      row = this.rows.get(input.id);
      if (!row || !this.visible().some(r => r.id === input.id))
        fail("NOT_FOUND");
      recordId = input.id;
      if (this.mode === "conflict" && !this.conflicts.has(recordId)) {
        this.conflicts.add(recordId);
        row.termsText = "تعديل خارجي تجريبي يحتاج مراجعتك.\n" + row.termsText;
        row.digest = this.digest();
        this.changed();
      }
      if (row.truncated || row.digest !== input.expectedDigest)
        fail("CONFLICT");
      if (input.action === "update")
        row = { ...row, ...input.fields, digest: this.digest() };
    }
    if (input.action === "delete") this.rows.delete(recordId);
    else {
      if (row!.isDefault)
        for (const other of this.rows.values()) {
          if (other.id !== recordId && other.isDefault) {
            other.isDefault = false;
            other.digest = this.digest();
          }
        }
      this.rows.set(recordId, row!);
      resultDigest = row!.digest;
    }
    const value: TemplateReceipt = {
      version: "quotation-template-receipt.v1",
      merchantId: templatePreviewId,
      actorId: templatePreviewId,
      requestId: input.requestId,
      action: input.action,
      recordId,
      digest: resultDigest,
      committedAt: new Date().toISOString(),
    };
    this.receipts.set(input.requestId, { input: encoded, value });
    this.changed();
    if (this.mode === "lost") fail("TIMEOUT");
    return structuredClone(value);
  }
}
