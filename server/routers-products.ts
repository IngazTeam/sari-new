/**
 * Products Router Module
 * Reviewed product writes/imports, variants/categories, and provider import tools
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { majorToMinor } from '../shared/product-money';
import { productCatalogInput } from '../shared/product-catalog';
import { readProductCatalog } from './product-catalog';
import { hasPermission } from './_core/permissions';
import { productEditorRouter } from './routers-product-editor';
import { productImportRouter } from './routers-product-import';
import { productFileAdviceRouter } from './routers-product-file-advice';
const majorPriceSchema = z.number().refine(value => {
  try { majorToMinor(value); return true; } catch { return false; }
}, 'Price must be nonnegative with at most two decimal places');
import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import { reserveApiRateLimit } from './api/distributed-rate-limit';
import {
  UploadValidationError,
  assertOfficeOpenXml,
  decodeCanonicalBase64Upload,
} from './security/upload-validation';
import {
  createKnowledgeDoc,
  createProduct,
  getGoogleIntegration,
  getKnowledgeDocByMerchantId,
  getMerchantById,
  getProductById,
  getProductsByMerchantId,
  updateGoogleIntegration,
  updateKnowledgeDoc,
  updateProduct,
} from './db';

// SEC-01: Sanitize GPT output to prevent stored XSS and prompt injection chains
function sanitizeGptOutput(text: string): string {
    if (!text || typeof text !== 'string') return '';
    return text
        // Strip HTML tags
        .replace(/<[^>]*>/g, '')
        // Strip script-like patterns
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        // Strip prompt injection attempts (GPT could echo user-injected content)
        .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
        .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
        .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
        .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
        .trim();
}

const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;

function decodeAndValidateSpreadsheet(fileBase64: string, fileName: string): Buffer {
  if (!/\.xlsx$/i.test(fileName)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'يدعم هذا المسار ملفات XLSX فقط.' });
  }
  try {
    const buffer = decodeCanonicalBase64Upload(fileBase64, MAX_SPREADSHEET_BYTES);
    assertOfficeOpenXml(buffer, 'xlsx');
    return buffer;
  } catch (error) {
    if (!(error instanceof UploadValidationError)) throw error;
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'ملف XLSX غير صالح أو يتجاوز حدود المعالجة الآمنة.' });
  }
}

async function assertSpreadsheetImportRateLimit(
  merchantId: number,
  namespace: 'merchant_smart_import',
  maxRequests: number,
): Promise<void> {
  const decision = await reserveApiRateLimit({
    namespace,
    identity: String(merchantId),
    maxRequests,
    windowMs: 60 * 60 * 1_000,
  });
  if (!decision.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'تم بلوغ حد استيراد الملفات مؤقتًا. حاول لاحقًا.',
    });
  }
}

// Header mapping: comprehensive support for Arabic/English column headers
// Covers: products, courses, services, real-estate, food, general exports
const HEADER_MAP: Record<string, string> = {
    // ═══ NAME variants ═══
    'name': 'name', 'الاسم': 'name', 'اسم المنتج': 'name', 'product name': 'name',
    'اسم': 'name', 'عنوان': 'name', 'title': 'name', 'المنتج': 'name',
    'اسم الدورة': 'name', 'course name': 'name', 'course title': 'name',
    'اسم الخدمة': 'name', 'service name': 'name', 'اسم البرنامج': 'name',
    'program name': 'name', 'اسم الباقة': 'name', 'package name': 'name',
    'العنوان': 'name', 'item': 'name', 'item name': 'name',
    'اسم العنصر': 'name', 'الصنف': 'name', 'المادة': 'name',
    'اسم المادة': 'name', 'subject': 'name', 'الدورة': 'name',
    'البرنامج': 'name', 'الباقة': 'name', 'الخدمة': 'name',
    'اسم الورشة': 'name', 'workshop': 'name', 'workshop name': 'name',

    // ═══ DESCRIPTION variants ═══
    'description': 'description', 'الوصف': 'description', 'وصف': 'description',
    'وصف المنتج': 'description', 'product description': 'description',
    'التفاصيل': 'description', 'details': 'description', 'تفاصيل': 'description',
    'وصف الدورة': 'description', 'course description': 'description',
    'وصف الخدمة': 'description', 'الملخص': 'description', 'summary': 'description',
    'نبذة': 'description', 'overview': 'description', 'محتوى': 'description',
    'المحتوى': 'description', 'content': 'description', 'notes': 'description',
    'ملاحظات': 'description',

    // ═══ PRICE variants ═══
    'price': 'price', 'السعر': 'price', 'سعر': 'price',
    'التكلفة': 'price', 'cost': 'price', 'رسوم': 'price', 'fees': 'price',
    'الرسوم': 'price', 'المبلغ': 'price', 'amount': 'price',
    'سعر الدورة': 'price', 'course price': 'price', 'سعر الخدمة': 'price',
    'unit price': 'price', 'سعر الوحدة': 'price', 'rate': 'price',
    'قيمة الاشتراك': 'price', 'subscription price': 'price',

    // ═══ IMAGE variants ═══
    'imageurl': 'imageUrl', 'image': 'imageUrl', 'الصورة': 'imageUrl',
    'رابط الصورة': 'imageUrl', 'صورة': 'imageUrl', 'image url': 'imageUrl',
    'photo': 'imageUrl', 'الشعار': 'imageUrl', 'logo': 'imageUrl',
    'thumbnail': 'imageUrl', 'صورة المنتج': 'imageUrl',

    // ═══ STOCK variants ═══
    'stock': 'stock', 'المخزون': 'stock', 'الكمية': 'stock', 'كمية': 'stock',
    'quantity': 'stock', 'عدد': 'stock', 'المقاعد': 'stock', 'seats': 'stock',
    'المتاح': 'stock', 'available': 'stock', 'عدد المقاعد': 'stock',

    // ═══ CATEGORY variants ═══
    'category': 'category', 'التصنيف': 'category', 'تصنيف': 'category',
    'الفئة': 'category', 'النوع': 'category', 'type': 'category',
    'القسم': 'category', 'department': 'category', 'section': 'category',
    'المجال': 'category', 'field': 'category', 'التخصص': 'category',
    'specialization': 'category',

    // ═══ SERVICE/COURSE-specific (mapped as extras for rich description) ═══
    'المدة': 'extra_duration', 'المدة (بالساعات)': 'extra_duration', 'المدة بالساعات': 'extra_duration',
    'duration': 'extra_duration', 'عدد الساعات': 'extra_duration', 'hours': 'extra_duration',
    'عدد الأيام': 'extra_days', 'days': 'extra_days', 'الأيام': 'extra_days',
    'المدرب': 'extra_instructor', 'اسم المدرب': 'extra_instructor', 'المحاضر': 'extra_instructor',
    'instructor': 'extra_instructor', 'trainer': 'extra_instructor', 'المدربة': 'extra_instructor',
    'الموقع': 'extra_location', 'المكان': 'extra_location', 'العنوان التفصيلي': 'extra_location',
    'location': 'extra_location', 'venue': 'extra_location', 'المدينة': 'extra_location',
    'تاريخ البدء': 'extra_start_date', 'start date': 'extra_start_date', 'تاريخ البداية': 'extra_start_date',
    'تاريخ الانتهاء': 'extra_end_date', 'end date': 'extra_end_date',
    'الحالة': 'extra_status', 'status': 'extra_status', 'الاعتماد': 'extra_accreditation',
    'is_accredited': 'extra_accreditation', 'معتمد': 'extra_accreditation', 'accredited': 'extra_accreditation',
    'is_free': 'extra_is_free', 'مجاني': 'extra_is_free',
    'is_published': 'extra_published', 'منشورة': 'extra_published',
    'تاريخ الإنشاء': 'extra_created', 'created_at': 'extra_created', 'created': 'extra_created',
    'اللغة': 'extra_language', 'language': 'extra_language',
    'المتطلبات': 'extra_requirements', 'requirements': 'extra_requirements', 'الشروط': 'extra_requirements',
    'الشهادة': 'extra_certificate', 'certificate': 'extra_certificate',
};

function normalizeHeader(header: string): string | null {
    const normalized = header.trim().toLowerCase().replace(/\s+/g, ' ');
    return HEADER_MAP[normalized] || null;
}

export const productsRouter = router({
    editor: productEditorRouter,
    importReview: productImportRouter,
    fileAdvice: productFileAdviceRouter,
    // List products for merchant — PERF-03 FIX: server-side pagination + search
    list: merchantProcedure
        .input(productCatalogInput)
        .query(async ({ ctx, input }) => {
            try {
                return { ...(await readProductCatalog(ctx.merchantId, input)),
                    canManage: hasPermission(ctx.merchantRole, 'products.manage') };
            } catch {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Product catalog unavailable' });
            }
        }),

    // Get product with variants and options
    getById: merchantProcedure
        .input(z.object({ productId: z.number() }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const product = await getProductById(input.productId);
            if (!product || product.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const prodDb = await import('./db/products');
            const variants = await prodDb.getVariantsByProductId(input.productId);
            const options = await prodDb.getOptionsByProductId(input.productId);

            return { ...product, variants, options };
        }),

    // ============================================
    // Variant CRUD
    // ============================================

    addVariant: permissionProcedure('products.manage')
        .input(z.object({
            productId: z.number(),
            name: z.string(),
            sku: z.string().optional(),
            price: majorPriceSchema.optional(),
            compareAtPrice: majorPriceSchema.optional(),
            costPrice: majorPriceSchema.optional(),
            stock: z.number().optional(),
            barcode: z.string().optional(),
            weight: z.string().optional(),
            imageUrl: z.string().optional(),
            options: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const product = await getProductById(input.productId);
            if (!product || product.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const prodDb = await import('./db/products');
            const variant = await prodDb.createVariant({
                ...input,
                merchantId: merchant.id,
                stock: input.stock ?? 0,
                sortOrder: 0,
            }, 'major');

            // Mark product as having variants
            if (!product.hasVariants) {
                await updateProduct(input.productId, { hasVariants: 1 } as any, 'major');
            }

            return variant;
        }),

    updateVariant: permissionProcedure('products.manage')
        .input(z.object({
            variantId: z.number(),
            productId: z.number(),
            name: z.string().optional(),
            sku: z.string().optional(),
            price: majorPriceSchema.nullable().optional(),
            compareAtPrice: majorPriceSchema.nullable().optional(),
            costPrice: majorPriceSchema.nullable().optional(),
            stock: z.number().optional(),
            barcode: z.string().optional(),
            weight: z.string().optional(),
            imageUrl: z.string().optional(),
            options: z.string().optional(),
            isActive: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const product = await getProductById(input.productId);
            if (!product || product.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const prodDb = await import('./db/products');
            // SEC-IDOR: Verify variant belongs to this product
            const variants = await prodDb.getVariantsByProductId(input.productId);
            const variant = variants.find(v => v.id === input.variantId);
            if (!variant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant not found for this product' });
            }
            const { variantId, productId, ...data } = input;
            if (variant.priceUnit !== 'minor' && data.price !== undefined) {
                data.compareAtPrice ??= null;
                data.costPrice ??= null;
            }
            await prodDb.updateVariant(variantId, data as any, 'major');
            return { success: true };
        }),

    deleteVariant: permissionProcedure('products.manage')
        .input(z.object({ variantId: z.number(), productId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const product = await getProductById(input.productId);
            if (!product || product.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const prodDb = await import('./db/products');
            // SEC-IDOR: Verify variant belongs to this product
            const variants = await prodDb.getVariantsByProductId(input.productId);
            if (!variants.find(v => v.id === input.variantId)) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant not found for this product' });
            }
            await prodDb.deleteVariant(input.variantId);

            // Check if product still has variants
            const remaining = await prodDb.getVariantsByProductId(input.productId);
            if (remaining.length === 0) {
                await updateProduct(input.productId, { hasVariants: 0 } as any, 'major');
            }

            return { success: true };
        }),

    // ============================================
    // Category CRUD
    // ============================================

    listCategories: merchantProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const prodDb = await import('./db/products');
        return await prodDb.getCategoriesByMerchantId(merchant.id);
    }),

    createCategory: permissionProcedure('products.manage')
        .input(z.object({
            name: z.string().min(1),
            nameEn: z.string().optional(),
            parentId: z.number().nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const prodDb = await import('./db/products');
            return await prodDb.createCategory({
                merchantId: merchant.id,
                ...input,
            });
        }),

    updateCategory: permissionProcedure('products.manage')
        .input(z.object({
            id: z.number(),
            name: z.string().optional(),
            nameEn: z.string().optional(),
            parentId: z.number().nullable().optional(),
            isActive: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            const prodDb = await import('./db/products');
            // SEC-IDOR: Verify category belongs to this merchant
            const cats = await prodDb.getCategoriesByMerchantId(merchant.id);
            if (!cats.find(c => c.id === input.id)) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }
            const { id, ...data } = input;
            await prodDb.updateCategory(id, data as any);
            return { success: true };
        }),

    deleteCategory: permissionProcedure('products.manage')
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            const prodDb = await import('./db/products');
            // SEC-IDOR: Verify category belongs to this merchant
            const cats = await prodDb.getCategoriesByMerchantId(merchant.id);
            if (!cats.find(c => c.id === input.id)) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }
            await prodDb.deleteCategory(input.id);
            return { success: true };
        }),

    // ============================================
    // Low Stock Alerts
    // ============================================

    getLowStock: merchantProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const prodDb = await import('./db/products');
        const products = await prodDb.getLowStockProducts(merchant.id);
        const variants = await prodDb.getLowStockVariants(merchant.id);
        return { products, variants, total: products.length + variants.length };
    }),

    // ════════════════════════════════════════════════════════════════
    // GPT Smart Import — AI analyzes ANY file and adds items correctly
    // ════════════════════════════════════════════════════════════════
    smartImport: permissionProcedure('products.manage')
        .input(z.object({
            fileBase64: z.string().max(15_000_000, 'الحد الأقصى لحجم الملف 10 ميجابايت'),
            fileName: z.string().max(255).transform(s => s.replace(/[<>:"/\\|?*]/g, '_')),
            importType: z.enum(['auto', 'products', 'services']).default('auto'),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            await assertSpreadsheetImportRateLimit(merchant.id, 'merchant_smart_import', 10);
            const buffer = decodeAndValidateSpreadsheet(input.fileBase64, input.fileName);

            // Step 1: Parse file content to raw text
            const ExcelJS = (await import('exceljs')).default;
            const workbook = new ExcelJS.Workbook();
            // @ts-ignore
            await workbook.xlsx.load(buffer);

            const worksheet = workbook.worksheets[0];
            if (!worksheet) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الملف لا يحتوي على بيانات' });
            }

            // Build raw text from file for GPT
            const rawLines: string[] = [];
            let rowCount = 0;
            worksheet.eachRow((row, rowNumber) => {
                if (rowCount >= 200) return; // Limit for token budget
                const cells: string[] = [];
                row.eachCell((cell) => {
                    const val = cell.value?.toString().trim();
                    if (val) cells.push(val);
                });
                if (cells.length > 0) {
                    rawLines.push(cells.join(' | '));
                    rowCount++;
                }
            });

            if (rawLines.length < 2) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الملف لا يحتوي على بيانات كافية' });
            }

            const rawFileText = rawLines.join('\n').substring(0, 12000)
                // SEC-01: Sanitize against prompt injection
                .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
                .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
                .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
                .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
                .replace(/new\s+instructions?\s*:/gi, '[filtered]:')
                .replace(/do\s+not\s+follow/gi, '[filtered]')
                .replace(/override\s+(system|all|your)/gi, '[filtered]');

            // Step 2: Send to GPT for structured analysis
            const { invokeLLM } = await import('./_core/llm');

            const typeHint = input.importType === 'products' ? 'هذا ملف منتجات (physical products).'
                : input.importType === 'services' ? 'هذا ملف خدمات/دورات تدريبية.'
                : 'حدد تلقائياً نوع الملف (منتجات أو خدمات).';

            const aiResult = await invokeLLM({
                merchantId: merchant.id,
                taskType: 'sari.catalog.file-extraction',
                messages: [
                    {
                        role: 'system',
                        content: `أنت محلل بيانات تجارية محترف. مهمتك تحليل ملف مرفوع من تاجر واستخراج البيانات بشكل منظم.

${typeHint}

أرجع JSON فقط بهذا الشكل بالضبط:
{
  "businessType": "products" أو "services",
  "businessSummary": "وصف مختصر لنشاط التاجر",
  "items": [
    {
      "name": "اسم العنصر (مطلوب)",
      "description": "وصف مفصل يساعد البوت على البيع",
      "price": 0,
      "category": "التصنيف إن وُجد",
      "duration": "المدة إن كانت خدمة/دورة",
      "instructor": "المدرب إن وُجد",
      "location": "الموقع إن وُجد",
      "isAccredited": false,
      "additionalInfo": "أي معلومات إضافية مفيدة للبوت"
    }
  ],
  "crossSellSuggestions": "اقتراحات بيع متقاطع بين العناصر",
  "sellingTips": "نصائح بيعية يستخدمها البوت"
}

قواعد مهمة:
1. استخرج كل العناصر من الملف
2. إذا كان السعر غير موجود، ضع 0
3. الوصف يجب أن يكون مفيداً للبوت البيعي (اكتب مميزات وعبارات بيعية)
4. إذا كان الملف يحتوي دورات/خدمات/ورش عمل → businessType = "services"
5. إذا كان الملف يحتوي منتجات/بضائع → businessType = "products"
6. أرجع JSON صالح فقط بدون أي نص إضافي`
                    },
                    {
                        role: 'user',
                        content: `حلل هذا الملف واستخرج البيانات:\n\nاسم الملف: ${input.fileName}\n\n${rawFileText}`
                    }
                ],
                maxTokens: 4000,
                responseFormat: { type: 'json_object' },
            });

            const aiContent = typeof aiResult.choices[0]?.message?.content === 'string'
                ? aiResult.choices[0].message.content
                : '';

            if (!aiContent || aiContent.length < 10) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل تحليل الملف بالذكاء الاصطناعي' });
            }

            // Step 3: Parse GPT response
            let parsed: any;
            try {
                parsed = JSON.parse(aiContent);
            } catch {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل في تحليل استجابة الذكاء الاصطناعي' });
            }

            if (!parsed.items || !Array.isArray(parsed.items) || parsed.items.length === 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'لم يتم العثور على عناصر في الملف' });
            }

            // Limit to 500 items
            const items = parsed.items.slice(0, 500);
            const isService = parsed.businessType === 'services';
            const productType = isService ? 'service' : 'physical';

            // Step 4: Insert items into DB
            let successCount = 0;
            let errorCount = 0;
            const preview: { name: string; price: number; description: string }[] = [];

            for (const item of items) {
                try {
                    // Build rich description
                    const descParts: string[] = [];
                    if (item.description) descParts.push(item.description);
                    if (item.duration) descParts.push(`المدة: ${item.duration}`);
                    if (item.instructor) descParts.push(`المدرب: ${item.instructor}`);
                    if (item.location) descParts.push(`الموقع: ${item.location}`);
                    if (item.isAccredited) descParts.push('✅ معتمد');
                    if (item.additionalInfo) descParts.push(item.additionalInfo);
                    const fullDescription = descParts.join(' | ');

                    // SEC-01: Sanitize GPT output to prevent stored XSS
                    const safeName = sanitizeGptOutput(item.name || 'بدون اسم').substring(0, 255);
                    const safeCategory = item.category ? sanitizeGptOutput(item.category).substring(0, 100) : null;

                    // SEC-02: Validate price is a safe number
                    const safePrice = Number(item.price);
                    if (item.price == null || item.price === '') throw new Error('Missing product price');
                    majorToMinor(safePrice); // Validate precision and range without rounding.

                    await createProduct({
                        merchantId: merchant.id,
                        name: safeName,
                        description: fullDescription.substring(0, 5000) || null,
                        price: safePrice,
                        category: safeCategory,
                        productType: productType as any,
                    }, 'major');
                    successCount++;

                    if (preview.length < 5) {
                        preview.push({
                            name: item.name,
                            price: parseFloat(item.price) || 0,
                            description: fullDescription.substring(0, 120),
                        });
                    }
                } catch (err: any) {
                    errorCount++;
                }
            }

            // Step 5: Save AI knowledge for bot
            // SEC-05: Sanitize knowledge text to prevent prompt injection chains
            try {
                const safeBusinessSummary = sanitizeGptOutput(parsed.businessSummary || '');
                const safeSellingTips = sanitizeGptOutput(parsed.sellingTips || '');
                const safeCrossSell = sanitizeGptOutput(parsed.crossSellSuggestions || '');
                const knowledgeText = [
                    `=== تحليل ذكي: ${input.fileName} ===`,
                    `نوع النشاط: ${parsed.businessType === 'services' ? 'خدمات/دورات' : 'منتجات'}`,
                    `الملخص: ${safeBusinessSummary}`,
                    '',
                    `=== العناصر (${items.length}) ===`,
                    ...items.map((item: any, i: number) =>
                        `${i + 1}. ${sanitizeGptOutput(item.name)} — ${item.price || 0} ر.س${item.description ? ' — ' + sanitizeGptOutput(item.description).substring(0, 200) : ''}`
                    ),
                    '',
                    `=== نصائح البيع ===`,
                    safeSellingTips,
                    '',
                    `=== البيع المتقاطع ===`,
                    safeCrossSell,
                ].join('\n');

                const existingDoc = await getKnowledgeDocByMerchantId(merchant.id);
                if (existingDoc) {
                    const combined = (existingDoc.extractedText || '') + '\n\n' + knowledgeText;
                    await updateKnowledgeDoc(existingDoc.id, {
                        extractedText: combined.substring(0, 100000),
                    });
                } else {
                    await createKnowledgeDoc({
                        merchantId: merchant.id,
                        fileName: input.fileName,
                        fileType: 'docx',
                        fileSize: buffer.length,
                        extractedText: knowledgeText,
                        extractionStatus: 'completed',
                    });
                }
                console.log(`[SmartImport] ✅ Knowledge saved: ${knowledgeText.length} chars`);
            } catch (kErr) {
                console.warn('[SmartImport] Knowledge save failed (non-blocking):', kErr);
            }

            // Step 6: Auto-upload to Google Sheet
            let sheetCreated = false;
            let spreadsheetUrl = '';
            try {
                const integration = await getGoogleIntegration(merchant.id, 'sheets');
                if (integration && integration.isActive) {
                    const sheets = await import('./_core/googleSheets');

                    // Build sheet data
                    const sheetHeaders = isService
                        ? ['الاسم', 'الوصف', 'السعر', 'المدة', 'المدرب', 'الموقع', 'التصنيف']
                        : ['الاسم', 'الوصف', 'السعر', 'الكمية', 'التصنيف', 'رابط الصورة'];

                    const sheetRows: string[][] = [sheetHeaders];
                    for (const item of items) {
                        if (isService) {
                            sheetRows.push([
                                item.name || '', item.description || '', String(item.price || 0),
                                item.duration || '', item.instructor || '', item.location || '', item.category || ''
                            ]);
                        } else {
                            sheetRows.push([
                                item.name || '', item.description || '', String(item.price || 0),
                                '', item.category || '', ''
                            ]);
                        }
                    }

                    const sheetLabel = isService ? 'خدمات' : 'منتجات';
                    const sheetName = `${sheetLabel} ${merchant.businessName || 'متجري'} - ساري`;

                    if (integration.sheetId) {
                        try {
                            await sheets.writeToSheet(merchant.id, integration.sheetId, 'Sheet1!A1', sheetRows);
                            spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${integration.sheetId}`;
                            sheetCreated = true;
                        } catch { /* fall through to create new */ }
                    }

                    if (!sheetCreated) {
                        const createResult = await sheets.createSpreadsheet(merchant.id, sheetName);
                        if (createResult.success && createResult.spreadsheetId) {
                            await sheets.writeToSheet(merchant.id, createResult.spreadsheetId, 'Sheet1!A1', sheetRows);
                            spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${createResult.spreadsheetId}`;
                            sheetCreated = true;
                        }
                    }
                }
            } catch (sheetErr) {
                console.error('[SmartImport] Google Sheet error (non-blocking):', sheetErr);
            }

            return {
                success: true,
                imported: successCount,
                failed: errorCount,
                total: items.length,
                businessType: parsed.businessType === 'services' ? 'services' : 'products',
                businessSummary: sanitizeGptOutput(parsed.businessSummary || '').substring(0, 500),
                preview,
                sheetCreated,
                spreadsheetUrl,
                sellingTips: sanitizeGptOutput(parsed.sellingTips || '').substring(0, 500),
                message: `تم تحليل الملف بالذكاء الاصطناعي واستيراد ${successCount} ${isService ? 'خدمة' : 'منتج'} بنجاح`,
            };
        }),

    // Sync products from linked Google Sheet
    syncFromGoogleSheets: permissionProcedure('products.manage')
        .mutation(async ({ ctx }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const integration = await getGoogleIntegration(merchant.id, 'sheets');
            if (!integration || !integration.isActive || !integration.sheetId) {
                throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'يجب ربط Google Sheets أولاً من صفحة التكاملات' });
            }

            const sheets = await import('./_core/googleSheets');
            const spreadsheetId = integration.sheetId;

            // Try reading from "المنتجات" or "Products" sheet
            let result = await sheets.readFromSheet(merchant.id, spreadsheetId, 'المنتجات!A1:F');
            if (!result.success || !result.values || result.values.length < 2) {
                result = await sheets.readFromSheet(merchant.id, spreadsheetId, 'Products!A1:F');
            }
            if (!result.success || !result.values || result.values.length < 2) {
                // Try Sheet1
                result = await sheets.readFromSheet(merchant.id, spreadsheetId, 'Sheet1!A1:F');
            }

            if (!result.success || !result.values || result.values.length < 2) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'لم يتم العثور على بيانات في الشيت. تأكد من وجود ورقة باسم "المنتجات" أو "Products" مع صف عنوان.'
                });
            }

            const rows = result.values;
            const headers = rows[0].map((h: string) => normalizeHeader(h?.toString().trim()));

            if (!headers.includes('name')) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الشيت لا يحتوي على عمود الاسم' });
            }

            // Get existing products for duplicate detection
            const existingProducts = await getProductsByMerchantId(merchant.id);
            const existing = new Map(existingProducts.map(p => [p.name.toLowerCase().trim(), p.id]));

            let created = 0;
            let updated = 0;
            let skipped = 0;

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const product: Record<string, any> = {};

                headers.forEach((header: string | null, idx: number) => {
                    if (header && row[idx]) {
                        product[header] = row[idx].toString().trim();
                    }
                });

                if (!product.name) {
                    skipped++;
                    continue;
                }

                const data = {
                    name: product.name,
                    description: product.description || null,
                    price: parseFloat(product.price) || 0,
                    imageUrl: product.imageUrl || null,
                    stock: product.stock ? parseInt(product.stock) : null,
                    category: product.category || null,
                };

                const existingId = existing.get(product.name.toLowerCase().trim());

                try {
                    if (existingId) {
                        // Update existing product
                        await updateProduct(existingId, data, 'major');
                        updated++;
                    } else {
                        // Create new product
                        await createProduct({
                            merchantId: merchant.id,
                            ...data,
                        }, 'major');
                        created++;
                    }
                } catch (error) {
                    skipped++;
                }
            }

            // Update last sync time
            await updateGoogleIntegration(integration.id, {
                lastSync: new Date().toISOString(),
            });

            return {
                success: true,
                created,
                updated,
                skipped,
                total: rows.length - 1,
                message: `تم المزامنة: ${created} جديد، ${updated} محدّث، ${skipped} تخطي`,
            };
        }),

    // Get Google Sheet sync status
    getSheetSyncStatus: merchantProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) return { connected: false };

        const integration = await getGoogleIntegration(merchant.id, 'sheets');
        if (!integration || !integration.isActive) {
            return { connected: false };
        }

        return {
            connected: true,
            sheetId: integration.sheetId,
            lastSync: integration.lastSync,
        };
    }),
});

export type ProductsRouter = typeof productsRouter;
