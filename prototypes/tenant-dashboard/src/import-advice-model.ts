import {
  productFileAdviceStart,
  productFileAdviceRead,
  productFileAdviceReceipt,
} from "../../../shared/product-file-advice";
import {
  prepareProductFileAdvice,
  parseProductFileAdvice,
} from "../../../server/product-file-advice";
import { importPreviewId } from "./import-model";
export const adviceModes = {
  ready: "اقتراحات مع شواهد",
  emptyAdvice: "لا نصائح مدعومة",
  long: "اقتراحات ونصوص طويلة",
  processing: "التحليل قيد المعالجة",
  failed: "نتيجة تحليل مرفوضة",
  uncertain: "نتيجة غير مؤكدة",
  lostReply: "اكتمل التحليل وفُقد الرد",
  rejected: "الطلب لم يصل",
  readError: "فشل قراءة التحليل",
  wrongTenant: "نتيجة لتيننت آخر",
  wrongRequest: "نتيجة لطلب آخر",
  missing: "مرجع تحليل مفقود",
} as const;
export type AdviceMode = keyof typeof adviceModes;
type Receipt = ReturnType<typeof productFileAdviceReceipt.parse>;
const failure = (code: string) =>
  Object.assign(Error(code), { data: { code } });
/** Local deterministic suggestions only. No LLM, network, products or knowledge writes. */
export class ImportAdviceStore {
  mode: AdviceMode = "ready";
  starts = 0;
  private generation = 0;
  private entries = new Map<string, { input: string; receipt: Receipt }>();
  private hidden = new Set<string>();
  constructor(private changed: () => void = () => {}) {}
  setMode = (mode: AdviceMode) => {
    if (Object.hasOwn(adviceModes, mode)) {
      this.mode = mode;
      this.changed();
    }
  };
  reset = () => {
    this.generation++;
    this.entries.clear();
    this.hidden.clear();
    this.starts = 0;
    this.mode = "ready";
    this.changed();
  };
  start = async (raw: unknown) => {
    const input = productFileAdviceStart.parse(raw),
      fingerprint = JSON.stringify(input),
      previous = this.entries.get(input.requestId);
    if (previous) {
      if (previous.input !== fingerprint) throw failure("CONFLICT");
      return structuredClone(previous.receipt);
    }
    const generation = this.generation,
      mode = this.mode;
    if (mode === "rejected") throw failure("BAD_REQUEST");
    const context = await prepareProductFileAdvice({
      file: input.file,
      intent: input.intent,
      language: input.language,
    });
    if (generation !== this.generation) throw failure("CONFLICT");
    // Mirror the server's same-request reservation after asynchronous parsing.
    const concurrent = this.entries.get(input.requestId);
    if (concurrent) {
      if (concurrent.input !== fingerprint) throw failure("CONFLICT");
      return structuredClone(concurrent.receipt);
    }
    const row = context.source.rows.find(r =>
        r.cells.some(c => c.value.trim())
      ),
      cell =
        row?.cells.find(c => c.value.trim()) ??
        context.source.headers.find(c => c.value.trim());
    const evidence = cell
      ? [
          {
            row: row?.number ?? 0,
            column: cell.column,
            quote: cell.value.slice(0, 200).trim(),
          },
        ]
      : [];
    const ar = input.language === "ar",
      suffix =
        mode === "long"
          ? (ar
              ? " راجع التفاصيل مع العميل قبل تقديم العرض."
              : " Review details with the customer before making an offer."
            ).repeat(10)
          : "";
    const proposal = {
      businessType: "unknown",
      mapping: context.preview.headers.map(h => ({
        column: h.column,
        field: h.field,
      })),
      summary:
        evidence.length && mode !== "emptyAdvice"
          ? {
              text:
                (ar
                  ? "مثال محلي: راجع العنصر المقتبس وتأكد من اكتمال وصفه قبل البيع."
                  : "Local example: review the quoted item and complete its description before selling.") +
                suffix,
              evidence,
            }
          : null,
      sellingTips:
        evidence.length && mode !== "emptyAdvice"
          ? [
              {
                text: ar
                  ? "اقتراح تجريبي: اسأل العميل عن احتياجه قبل التوصية بهذا العنصر."
                  : "Example suggestion: ask about the customer's needs before recommending this item.",
                evidence,
              },
            ]
          : [],
      crossSellSuggestions: [],
    };
    const result = parseProductFileAdvice(JSON.stringify(proposal), context),
      now = new Date().toISOString();
    const receipt = productFileAdviceReceipt.parse({
      actorId: importPreviewId,
      merchantId: importPreviewId,
      requestId: input.requestId,
      fileName: result.fileName,
      fileDigest: result.fileDigest,
      sampleDigest: result.sampleDigest,
      state: "completed",
      failure: null,
      startedAt: now,
      finishedAt: now,
      result,
    });
    this.entries.set(input.requestId, { input: fingerprint, receipt });
    this.starts++;
    if (mode === "lostReply") this.hidden.add(input.requestId);
    this.changed();
    if (mode === "lostReply") throw failure("TIMEOUT");
    return structuredClone(receipt);
  };
  read = (raw: unknown) => {
    const { requestId } = productFileAdviceRead.parse(raw);
    if (this.mode === "missing") throw failure("NOT_FOUND");
    if (this.mode === "readError" || this.hidden.has(requestId))
      throw failure("INTERNAL_SERVER_ERROR");
    const entry = this.entries.get(requestId);
    if (!entry) throw failure("NOT_FOUND");
    const r = structuredClone(entry.receipt);
    if (this.mode === "wrongTenant") r.merchantId = 1;
    if (this.mode === "wrongRequest")
      r.requestId = "00000000-0000-4000-8000-000000000094";
    if (["processing", "failed", "uncertain"].includes(this.mode)) {
      r.state = this.mode as "processing" | "failed" | "uncertain";
      r.result = null;
      r.failure =
        this.mode === "failed"
          ? "invalid_result"
          : this.mode === "uncertain"
            ? "provider_unknown"
            : null;
      if (this.mode === "processing") r.finishedAt = null;
    }
    return productFileAdviceReceipt.parse(r);
  };
  refresh = async () => {
    this.hidden.clear();
    this.changed();
  };
}
