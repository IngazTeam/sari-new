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
import { productSheetRouter } from './routers-product-sheet';
const majorPriceSchema = z.number().refine(value => {
  try { majorToMinor(value); return true; } catch { return false; }
}, 'Price must be nonnegative with at most two decimal places');
import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import {
  createProduct,
  getGoogleIntegration,
  getMerchantById,
  getProductById,
  getProductsByMerchantId,
  updateGoogleIntegration,
  updateProduct,
} from './db';

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
    sheetImport: productSheetRouter,
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
