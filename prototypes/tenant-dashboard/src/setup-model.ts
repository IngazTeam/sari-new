import {
  setupCompletionInput,
  setupCompletionReceipt,
  setupReviewInput,
  setupCatalogConflicts,
  type SetupCompletionReceipt,
} from "../../../shared/setup-completion";
import { setupProgressInput } from "../../../shared/setup-progress";
import { setupTemplatePreview } from "../../../shared/setup-template";
export const setupScope = { actorId: 981481, merchantId: 981482 };
export const setupModes = {
  normal: "تجربة طبيعية",
  loading: "تحميل المسودة",
  readError: "فشل قراءة المسودة",
  saveError: "فشل حفظ المسودة",
  saveLost: "حفظ المسودة وفقد الرد",
  templateEmpty: "لا توجد قوالب",
  templateError: "فشل قراءة القوالب",
  websiteError: "فشل اقتراحات الموقع",
  websiteLimit: "تجاوز حد تحليل الموقع",
  reviewError: "فشل المراجعة",
  duplicate: "اسم موجود في الكتالوج",
  locked: "الكتالوج مرتبط بمصدر خارجي",
  retired: "القالب لم يعد متاحًا",
  completeError: "فشل الاعتماد قبل الحفظ",
  completeLost: "اعتماد محفوظ ورد مفقود",
  recoveryError: "فشل قراءة الإيصال",
} as const;
export type SetupMode = keyof typeof setupModes;
export function setupFixture() {
  return {
    businessType: "both",
    businessName: "متجر نواة التجريبي",
    phone: "+966500000001",
    address: "",
    description: "",
    workingHoursType: "custom",
    workingHours: {
      sunday: { open: "09:00", close: "17:00", isOpen: true },
      friday: { open: "09:00", close: "17:00", isOpen: false },
    },
    botTone: "friendly",
    botLanguage: "ar",
    welcomeMessage: "",
    products: [
      { id: "manual-1", name: "حقيبة قماش", price: "49.50", currency: "SAR" },
    ],
    services: [
      {
        id: "manual-service",
        name: "استشارة اختيار هدية",
        price: "25.00",
        durationMinutes: 45,
      },
    ],
  };
}
const fail = (code = "INTERNAL_SERVER_ERROR"): never => {
  throw Object.assign(Error("Local setup simulation"), { data: { code } });
};
const copy = <T>(value: T): T => structuredClone(value);
export class SetupModel {
  mode: SetupMode = "normal";
  version = 0;
  private revision = 1;
  private listeners = new Set<() => void>();
  private payload = {
    currentStep: 3,
    completedSteps: [] as number[],
    wizardData: setupFixture() as Record<string, unknown>,
  };
  private completed = false;
  private reviewed: {
    digest: string;
    fields: string;
    revision: number;
  } | null = null;
  private receipts = new Map<
    string,
    { input: string; receipt: SetupCompletionReceipt }
  >();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.version;
  changed = () => {
    this.version++;
    this.listeners.forEach(fn => fn());
  };
  setMode = (mode: SetupMode) => {
    this.mode = mode;
    this.changed();
  };
  progress = () => ({
    ...setupScope,
    currency: "SAR" as const,
    ...this.payload,
    wizardData: JSON.stringify(this.payload.wizardData),
    completedSteps: JSON.stringify(this.payload.completedSteps),
    draftUnreadable: false,
    isCompleted: this.completed ? 1 : 0,
    revision: this.revision,
    digest: this.revision.toString(16).padStart(64, "0"),
  });
  read = () => {
    if (this.mode === "readError") fail();
    return this.progress();
  };
  save = async (raw: unknown) => {
    const { expectedDigest, ...payload } = setupProgressInput.parse(raw);
    if (this.mode === "saveError") fail();
    if (this.completed) fail("CONFLICT");
    if (JSON.stringify(payload) === JSON.stringify(this.payload))
      return this.progress();
    if (expectedDigest !== this.progress().digest) fail("CONFLICT");
    this.payload = copy(payload);
    this.revision++;
    this.reviewed = null;
    // Query state stays unchanged until an explicit fresh read, as in the application.
    if (this.mode === "saveLost") fail();
    return this.progress();
  };
  remoteEdit = () => {
    this.payload = {
      ...this.payload,
      wizardData: {
        ...this.payload.wizardData,
        businessName: "نسخة أخرى من النشاط",
      },
    };
    this.revision++;
    this.reviewed = null;
  };
  review = async (raw: unknown) => {
    if (this.mode === "reviewError") fail();
    const { fields } = setupReviewInput.parse(raw);
    const conflicts = setupCatalogConflicts(fields, {
      products: this.mode === "duplicate" ? fields.products.slice(0, 1) : [],
      services: [],
    });
    const catalogLocked = this.mode === "locked",
      templateAvailable = !(this.mode === "retired" && fields.templateId);
    const digest = this.revision.toString(16).padStart(64, "a");
    const canComplete =
      !this.completed &&
      !catalogLocked &&
      templateAvailable &&
      conflicts.length === 0;
    this.reviewed = canComplete
      ? { digest, fields: JSON.stringify(fields), revision: this.revision }
      : null;
    return {
      ...setupScope,
      fields,
      currency: "SAR" as const,
      digest,
      alreadyCompleted: this.completed,
      catalogLocked,
      templateAvailable,
      conflicts,
      canComplete,
    };
  };
  complete = async (raw: unknown) => {
    const input = setupCompletionInput.parse(raw),
      old = this.receipts.get(input.requestId);
    if (old) {
      if (old.input !== JSON.stringify(input)) fail("CONFLICT");
      return copy(old.receipt);
    }
    if (this.mode === "completeError") fail();
    if (
      this.completed ||
      !this.reviewed ||
      this.reviewed.digest !== input.expectedDigest ||
      this.reviewed.revision !== this.revision ||
      this.reviewed.fields !== JSON.stringify(input.fields)
    )
      fail("CONFLICT");
    const fields = input.fields;
    const receipt = setupCompletionReceipt.parse({
      ...setupScope,
      requestId: input.requestId,
      confirmedAt: new Date().toISOString(),
      businessName: fields.businessName,
      currency: "SAR",
      products: fields.products.map((p, i) => ({
        id: 8100 + i,
        name: p.name,
        priceMinor: p.priceMinor,
        currency: p.currency,
      })),
      services: fields.services.map((s, i) => ({
        id: 9100 + i,
        name: s.name,
        priceMinor: s.priceMinor,
        durationMinutes: s.durationMinutes,
      })),
      templateId: fields.templateId ?? null,
      reviewedWebsite: fields.websiteAnalysis ?? null,
    });
    this.receipts.set(input.requestId, {
      input: JSON.stringify(input),
      receipt,
    });
    this.completed = true;
    if (this.mode === "completeLost") fail();
    return copy(receipt);
  };
  recover = async ({ requestId }: { requestId: string }) => {
    if (this.mode === "recoveryError") fail();
    return copy(this.receipts.get(requestId)?.receipt ?? null);
  };
  templates = (language: string) => {
    if (this.mode === "templateError") fail();
    return this.mode === "templateEmpty"
      ? []
      : [
          {
            id: 1,
            icon: "🎁",
            template_name:
              language === "en" ? "Gift shop example" : "مثال متجر هدايا",
            description:
              language === "en"
                ? "Local editable sample"
                : "منتج وخدمة قابلان للتعديل",
            suitable_for: "both",
            usage_count: 0,
          },
        ];
  };
  template = ({
    templateId,
    language,
  }: {
    templateId: number;
    language: string;
  }) => {
    if (this.mode === "templateError" || templateId !== 1) fail();
    return setupTemplatePreview({
      id: 1,
      is_active: 1,
      template_name:
        language === "en" ? "Gift shop example" : "مثال متجر هدايا",
      description: "",
      products: JSON.stringify([
        {
          name: language === "en" ? "Gift box" : "صندوق هدية",
          price: "39.95",
          currency: "SAR",
        },
      ]),
      services: JSON.stringify([
        {
          name: language === "en" ? "Gift wrapping" : "تغليف هدية",
          price: "10.00",
          durationMinutes: 15,
          category: "تغليف",
        },
      ]),
      working_hours: JSON.stringify({
        sunday: { open: "10:00", close: "18:00", isOpen: true },
      }),
      bot_personality: JSON.stringify({
        tone: "professional",
        language,
        welcomeMessage:
          language === "en"
            ? "Welcome to our gift shop"
            : "أهلًا بك في متجر الهدايا",
      }),
    });
  };
  website = async ({ websiteUrl }: { websiteUrl: string }) => {
    if (this.mode === "websiteError") fail();
    if (this.mode === "websiteLimit") fail("TOO_MANY_REQUESTS");
    return {
      success: true,
      websiteUrl,
      platform: "custom",
      siteType: "ecommerce",
      companyInfo: {
        name: "اسم مقترح من المثال",
        description: "وصف يحتاج مراجعتك",
        industry: "هدايا",
      },
      contactInfo: { phones: [], emails: [], address: "عنوان مقترح" },
      products: Array.from({ length: 23 }, (_, i) => ({
        name: `اقتراح ${i + 1}`,
        price: i === 0 ? 0 : 12.34 + i,
        currency: i === 1 ? "EUR" : "SAR",
        productUrl: `https://example.test/item/${i + 1}`,
      })),
      crawlStats: { pagesCrawled: 4 },
      faqs: [],
    };
  };
  reset = (kind: "normal" | "invalid" | "empty" = "normal") => {
    this.payload = {
      currentStep: 3,
      completedSteps: [],
      wizardData: setupFixture(),
    };
    if (kind === "empty")
      this.payload.wizardData = {
        ...setupFixture(),
        businessName: "",
        phone: "",
        products: [],
        services: [],
      };
    if (kind === "invalid")
      this.payload.wizardData = {
        ...setupFixture(),
        businessName: "س",
        phone: "123",
        botTone: "retired",
        botLanguage: "xx",
        welcomeMessage: { old: "value" },
        products: [{ name: "سعر يحتاج إصلاحًا", price: "", currency: "EUR" }],
      };
    this.completed = false;
    this.receipts.clear();
    this.reviewed = null;
    this.revision++;
    this.mode = "normal";
    this.changed();
  };
}
