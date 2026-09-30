import { z } from "zod";
import { SETUP_CATALOG_LIMIT, setupWebUrl } from "@shared/setup-catalog";
import { setupCompletionFields } from "@shared/setup-completion";
import { setupProgressInput } from "@shared/setup-progress";
import { setupWebsiteProduct } from "./setup-website-product";

const profileKeys = [
  "businessName",
  "phone",
  "address",
  "description",
  "businessType",
] as const;
export type SetupWebsiteProfileKey = (typeof profileKeys)[number];
const rawProduct = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    price: z.string(),
    currency: z.string(),
    category: z.string(),
    imageUrl: setupWebUrl,
    productUrl: setupWebUrl,
    websiteOriginalPrice: z.string(),
  })
  .strict();
export const setupWebsitePreview = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    sourceUrl: setupWebUrl.refine(Boolean),
    platform: z.enum([
      "salla",
      "zid",
      "shopify",
      "woocommerce",
      "custom",
      "unknown",
    ]),
    siteType: z.string(),
    industry: z.string(),
    profile: z
      .object({
        businessName: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        description: z.string().optional(),
        businessType: z.string().optional(),
      })
      .strict(),
    contact: z
      .object({
        phones: z.array(z.string()),
        emails: z.array(z.string()),
        whatsapp: z.string(),
        address: z.string(),
      })
      .strict(),
    products: z.array(rawProduct).max(500),
    pageCount: z.number().int().nonnegative().nullable(),
    faqCount: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .refine(
    value =>
      new TextEncoder().encode(JSON.stringify(value)).byteLength <= 700_000,
    "SETUP_WEBSITE_TOO_LARGE"
  );
export type SetupWebsitePreview = z.infer<typeof setupWebsitePreview>;
export type SetupWebsiteChoices = {
  catalog: "merge" | "replace" | "skip";
  productIds: string[];
  profile: SetupWebsiteProfileKey[];
};
export function readSetupWebsiteChoices(
  value: unknown,
  preview: SetupWebsitePreview | null
): SetupWebsiteChoices {
  const parsed = z
    .object({
      previewId: z.string(),
      catalog: z.enum(["merge", "replace", "skip"]),
      productIds: z.array(z.string()).max(500),
      profile: z.array(z.enum(profileKeys)).max(5),
    })
    .safeParse(value);
  if (
    preview &&
    parsed.success &&
    parsed.data.previewId === preview.id &&
    parsed.data.productIds.every(id =>
      preview.products.some(row => row.id === id)
    )
  )
    return {
      catalog: parsed.data.catalog,
      productIds: Array.from(new Set(parsed.data.productIds)),
      profile: Array.from(new Set(parsed.data.profile)),
    };
  return {
    catalog: "merge",
    productIds:
      preview && preview.products.length <= 100
        ? preview.products.map(row => row.id)
        : [],
    profile: [],
  };
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const string = (v: unknown) => (typeof v === "string" ? v : "");
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
export function setupWebsiteUrl(raw: string) {
  const value = raw.trim();
  return setupWebUrl.parse(
    /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`
  );
}
/** This is an extraction proposal. It does not establish verified knowledge or prices. */
export function buildSetupWebsitePreview(
  raw: unknown,
  sourceUrl: string,
  id: string
): SetupWebsitePreview {
  const source = record(raw),
    company = record(source.companyInfo),
    contact = record(source.contactInfo),
    crawl = record(source.crawlStats);
  if (source.success !== true || !Array.isArray(source.products))
    throw Error("SETUP_WEBSITE_INVALID");
  if (source.websiteUrl !== undefined && source.websiteUrl !== sourceUrl)
    throw Error("SETUP_WEBSITE_SOURCE_CHANGED");
  const profile: SetupWebsitePreview["profile"] = {};
  const values = {
    businessName: company.name,
    description: company.description,
    address: contact.address,
    phone: strings(contact.phones)[0],
    businessType:
      source.siteType === "services"
        ? "services"
        : source.siteType === "ecommerce"
          ? "store"
          : undefined,
  };
  for (const key of profileKeys)
    if (typeof values[key] === "string" && values[key] !== "")
      profile[key] = values[key];
  return setupWebsitePreview.parse({
    version: 1,
    id,
    sourceUrl,
    platform: ["salla", "zid", "shopify", "woocommerce", "custom"].includes(
      string(source.platform)
    )
      ? source.platform
      : "unknown",
    siteType: string(source.siteType),
    industry: string(company.industry),
    profile,
    contact: {
      phones: strings(contact.phones),
      emails: strings(contact.emails),
      whatsapp: string(contact.whatsappNumber),
      address: string(contact.address),
    },
    products: source.products.map((product, index) =>
      setupWebsiteProduct(product, `website-${id}-${index}`)
    ),
    pageCount:
      Number.isSafeInteger(crawl.totalPages) && Number(crawl.totalPages) >= 0
        ? crawl.totalPages
        : null,
    faqCount: Array.isArray(source.faqs) ? source.faqs.length : null,
  });
}
export function validSetupWebsiteProfile(
  key: SetupWebsiteProfileKey,
  value: unknown
) {
  return setupCompletionFields.shape[key].safeParse(value).success;
}
export function setupWebsitePatch(
  draft: Record<string, unknown>,
  raw: SetupWebsitePreview,
  choices: SetupWebsiteChoices
) {
  const preview = setupWebsitePreview.parse(raw);
  if (
    !["merge", "replace", "skip"].includes(choices.catalog) ||
    new Set(choices.productIds).size !== choices.productIds.length ||
    choices.productIds.some(id => !preview.products.some(row => row.id === id))
  )
    throw Error("SETUP_WEBSITE_INVALID_CHOICE");
  const patch: Record<string, unknown> = {
    websiteUrl: preview.sourceUrl,
    websiteAnalysis: {
      success: true,
      source: "website",
      status: "confirmed",
      confirmed: true,
      websiteUrl: preview.sourceUrl,
      platform: preview.platform,
      productCount: choices.catalog === "skip" ? 0 : choices.productIds.length,
      pageCount: preview.pageCount,
      faqCount: preview.faqCount,
    },
    websitePreview: preview,
    websitePreviewAppliedId: preview.id,
  };
  if (choices.catalog !== "skip") {
    if (
      choices.catalog === "merge" &&
      draft.products !== undefined &&
      !Array.isArray(draft.products)
    )
      throw Error("SETUP_WEBSITE_DRAFT_INVALID");
    const old =
      choices.catalog === "replace"
        ? []
        : (draft.products as unknown[] | undefined) || [];
    const existingIds = new Set(old.map(row => record(row).id));
    const selected = preview.products.filter(
      row => choices.productIds.includes(row.id) && !existingIds.has(row.id)
    );
    if (old.length + selected.length > SETUP_CATALOG_LIMIT)
      throw Error("SETUP_WEBSITE_LIMIT");
    patch.products = [...old, ...selected];
  }
  for (const key of choices.profile) {
    if (
      !profileKeys.includes(key) ||
      !validSetupWebsiteProfile(key, preview.profile[key])
    )
      throw Error("SETUP_WEBSITE_PROFILE_INVALID");
    patch[key] = preview.profile[key];
  }
  // Never spread stored suggestion objects into profile settings.
  patch.websiteProfileSuggestion = {
    sourceUrl: preview.sourceUrl,
    applied: choices.profile.length > 0,
    fields: choices.profile,
    values: Object.fromEntries(
      choices.profile.map(key => [key, preview.profile[key]])
    ),
  };
  if (
    !setupProgressInput.shape.wizardData.safeParse({ ...draft, ...patch })
      .success
  )
    throw Error("SETUP_WEBSITE_DRAFT_TOO_LARGE");
  return patch;
}
