/**
 * Products Router Module
 * Handles product CRUD operations, CSV/Excel import, and Google Sheets sync
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  createKnowledgeDoc,
  createProduct,
  deleteProduct,
  getGoogleIntegration,
  getKnowledgeDocByMerchantId,
  getMerchantByUserId,
  getProductById,
  getProductCountByMerchantId,
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

// SEC-04: In-memory rate limit for smart import (per merchant)
const smartImportRateLimit: Record<string, { count: number; resetAt: number }> = {};

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

/**
 * Smart header detection: if no column matches 'name' from the HEADER_MAP,
 * auto-assign the best candidate for name/price and merge remaining
 * columns into 'description'. This ensures NO file is ever rejected.
 */

// Headers that indicate this is a service/course file (not physical products)
const SERVICE_INDICATORS = /مدة|ساعات|أيام|مدرب|محاضر|اعتماد|accredited|instructor|duration|hours|days|trainer|شهادة|certificate|ورشة|workshop|دورة|برنامج|تدريب/i;

// Headers that are metadata (skip in description, keep for AI analysis)
const METADATA_HEADERS = /is_free|is_published|is_accredited|created_at|تاريخ الإنشاء|updated_at|id|#|الرقم|رقم/i;

function smartMapHeaders(
    rawHeaders: { colNumber: number; value: string }[]
): { columnMap: Record<number, string>; autoDetected: boolean; rawHeaderNames: Record<number, string>; isServiceFile: boolean } {
    const columnMap: Record<number, string> = {};
    const rawHeaderNames: Record<number, string> = {};

    // Check if this looks like a service/course file
    const headerText = rawHeaders.map(h => h.value).join(' ');
    const isServiceFile = SERVICE_INDICATORS.test(headerText);

    // Phase 1: try HEADER_MAP matches
    for (const h of rawHeaders) {
        rawHeaderNames[h.colNumber] = h.value;
        const mapped = normalizeHeader(h.value);
        if (mapped) {
            columnMap[h.colNumber] = mapped;
        }
    }

    // If we found 'name', we're good — standard mode
    if (Object.values(columnMap).includes('name')) {
        // Map remaining unmapped columns as 'extra_N' for description merge
        for (const h of rawHeaders) {
            if (!columnMap[h.colNumber]) {
                columnMap[h.colNumber] = `extra_${h.colNumber}`;
            }
        }
        return { columnMap, autoDetected: false, rawHeaderNames, isServiceFile };
    }

    // Phase 2: Smart fallback — scan ALL headers for best name/price candidates
    let bestNameCol = -1;
    let bestPriceCol = -1;
    
    for (const h of rawHeaders) {
        const val = h.value.trim().toLowerCase();
        // Skip metadata columns for name assignment
        if (METADATA_HEADERS.test(val)) continue;
        
        // Price detection: look for numeric-indicating headers
        if (bestPriceCol === -1 && /سعر|price|cost|رسوم|مبلغ|amount|fees|تكلفة|قيمة/i.test(val)) {
            bestPriceCol = h.colNumber;
        }
        // Name detection: first non-metadata, non-price text column
        else if (bestNameCol === -1 && !METADATA_HEADERS.test(val)) {
            bestNameCol = h.colNumber;
        }
    }

    // If no name found at all, take literal first column
    if (bestNameCol === -1 && rawHeaders.length > 0) {
        bestNameCol = rawHeaders[0].colNumber;
    }

    // Assign detected columns
    for (const h of rawHeaders) {
        if (h.colNumber === bestNameCol) {
            columnMap[h.colNumber] = 'name';
        } else if (h.colNumber === bestPriceCol) {
            columnMap[h.colNumber] = 'price';
        } else {
            columnMap[h.colNumber] = `extra_${h.colNumber}`;
        }
    }

    return { columnMap, autoDetected: true, rawHeaderNames, isServiceFile };
}

/**
 * Build a rich description from extra columns for a given row.
 * Skips metadata fields (is_published, created_at, etc.) for cleaner output.
 * Example: "المدرب: أحمد | المدة: 5 ساعات | الموقع: الرياض"
 */
function buildExtraDescription(
    row: Record<string, string>,
    rawHeaderNames: Record<number, string>,
    columnMap: Record<number, string>
): string {
    const parts: string[] = [];
    if (row.description) parts.push(row.description);

    for (const [colStr, field] of Object.entries(columnMap)) {
        if (field.startsWith('extra_') && row[field]) {
            const colNumber = parseInt(colStr);
            const headerLabel = rawHeaderNames[colNumber] || field;
            // Skip metadata fields from the visible description
            if (METADATA_HEADERS.test(headerLabel)) continue;
            // Skip empty/boolean-only values
            const val = row[field].trim();
            if (!val || val === 'لا' || val === 'نعم' || val === '0' || val === '1') continue;
            parts.push(`${headerLabel}: ${val}`);
        }
    }
    return parts.join(' | ');
}

/**
 * Build rows for Google Sheets from parsed data.
 * Preserves original column headers in the sheet for merchant editing.
 */
function buildSheetRows(
    allRows: Record<string, string>[],
    rawHeaderNames: Record<number, string>,
    columnMap: Record<number, string>
): string[][] {
    // Build header row from original column names
    const headerCols = Object.entries(rawHeaderNames)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([, name]) => name);

    const rows: string[][] = [headerCols];

    // Build data rows
    for (const row of allRows) {
        const dataRow: string[] = [];
        const sortedCols = Object.entries(columnMap)
            .sort(([a], [b]) => parseInt(a) - parseInt(b));
        for (const [, field] of sortedCols) {
            dataRow.push(row[field] || '');
        }
        rows.push(dataRow);
    }

    return rows;
}

export const productsRouter = router({
    // List products for merchant — PERF-03 FIX: server-side pagination + search
    list: protectedProcedure
        .input(z.object({
            page: z.number().min(1).default(1),
            pageSize: z.number().min(1).max(100).default(50),
            search: z.string().max(200).optional(),
        }).optional())
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const page = input?.page ?? 1;
            const pageSize = input?.pageSize ?? 50;
            const search = input?.search?.trim() || undefined;
            const offset = (page - 1) * pageSize;

            const [items, total] = await Promise.all([
                getProductsByMerchantId(merchant.id, { limit: pageSize, offset, search }),
                getProductCountByMerchantId(merchant.id, { search }),
            ]);

            return {
                items,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
            };
        }),

    // Create product (with advanced fields)
    create: protectedProcedure
        .input(z.object({
            name: z.string().min(1),
            description: z.string().optional(),
            price: z.number().min(0),
            currency: z.enum(['SAR', 'USD']).optional(),
            imageUrl: z.string().url().optional().or(z.literal('')),
            stock: z.number().int().min(0).optional(),
            category: z.string().optional(),
            categoryId: z.number().optional(),
            // Advanced fields
            sku: z.string().max(100).optional(),
            barcode: z.string().max(100).optional(),
            compareAtPrice: z.number().optional(),
            costPrice: z.number().optional(),
            weight: z.string().max(20).optional(),
            trackInventory: z.number().optional(),
            lowStockAlert: z.number().min(0).max(99999).optional(),
            images: z.string().max(5000).optional(),
            tags: z.string().max(500).optional(),
            productType: z.enum(['physical', 'digital', 'service']).optional(),
            status: z.enum(['active', 'draft', 'archived']).optional(),
            // Variants (optional — sent as JSON)
            variants: z.array(z.object({
                name: z.string(),
                sku: z.string().optional(),
                price: z.number().optional(),
                compareAtPrice: z.number().optional(),
                costPrice: z.number().optional(),
                stock: z.number().optional(),
                barcode: z.string().optional(),
                weight: z.string().optional(),
                imageUrl: z.string().optional(),
                options: z.string().optional(),
            })).max(100).optional(),
            // Options (optional)
            options: z.array(z.object({
                name: z.string(),
                values: z.string(),
            })).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const { variants, options, ...productData } = input;
            const hasVariants = (variants && variants.length > 0) ? 1 : 0;

            const productId = await createProduct({
                merchantId: merchant.id,
                ...productData,
                imageUrl: productData.imageUrl || undefined,
                currency: productData.currency || merchant.currency || 'SAR',
                hasVariants,
            });

            if (!productId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create product' });

            // Import product-specific DB functions
            const prodDb = await import('./db/products');

            // Create options if provided
            if (options && options.length > 0) {
                for (let i = 0; i < options.length; i++) {
                    await prodDb.createOption({
                        productId: (productId as any).id,
                        merchantId: merchant.id,
                        name: options[i].name,
                        values: options[i].values,
                        sortOrder: i,
                    });
                }
            }

            // Create variants if provided
            if (variants && variants.length > 0) {
                for (let i = 0; i < variants.length; i++) {
                    await prodDb.createVariant({
                        productId: (productId as any).id,
                        merchantId: merchant.id,
                        name: variants[i].name,
                        sku: variants[i].sku,
                        price: variants[i].price,
                        compareAtPrice: variants[i].compareAtPrice,
                        costPrice: variants[i].costPrice,
                        stock: variants[i].stock ?? 0,
                        barcode: variants[i].barcode,
                        weight: variants[i].weight,
                        imageUrl: variants[i].imageUrl,
                        options: variants[i].options,
                        sortOrder: i,
                    });
                }
            }

            return { success: true, productId: (productId as any).id };
        }),

    // Update product (with advanced fields)
    update: protectedProcedure
        .input(z.object({
            productId: z.number(),
            name: z.string().min(1).optional(),
            description: z.string().optional(),
            price: z.number().min(0).optional(),
            currency: z.enum(['SAR', 'USD']).optional(),
            imageUrl: z.string().optional(),
            stock: z.number().int().min(0).optional(),
            category: z.string().optional(),
            categoryId: z.number().nullable().optional(),
            sku: z.string().optional(),
            barcode: z.string().optional(),
            compareAtPrice: z.number().nullable().optional(),
            costPrice: z.number().nullable().optional(),
            weight: z.string().optional(),
            trackInventory: z.number().optional(),
            lowStockAlert: z.number().optional(),
            images: z.string().optional(),
            tags: z.string().optional(),
            productType: z.enum(['physical', 'digital', 'service']).optional(),
            status: z.enum(['active', 'draft', 'archived']).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            // Verify product belongs to this merchant (prevent IDOR)
            const product = await getProductById(input.productId);
            if (!product || product.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this product' });
            }

            const { productId, ...updates } = input;
            await updateProduct(productId, updates as any);
            return { success: true };
        }),

    // Delete product
    delete: protectedProcedure
        .input(z.object({ productId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const product = await getProductById(input.productId);
            if (!product || product.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this product' });
            }

            await deleteProduct(input.productId);
            return { success: true };
        }),

    // Bulk delete products
    bulkDelete: protectedProcedure
        .input(z.object({
            productIds: z.array(z.number()).min(1).max(500),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            let deleted = 0;
            for (const productId of input.productIds) {
                const product = await getProductById(productId);
                if (product && product.merchantId === merchant.id) {
                    await deleteProduct(productId);
                    deleted++;
                }
            }
            return { success: true, deleted };
        }),

    // Get product with variants and options
    getById: protectedProcedure
        .input(z.object({ productId: z.number() }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
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

    addVariant: protectedProcedure
        .input(z.object({
            productId: z.number(),
            name: z.string(),
            sku: z.string().optional(),
            price: z.number().optional(),
            compareAtPrice: z.number().optional(),
            costPrice: z.number().optional(),
            stock: z.number().optional(),
            barcode: z.string().optional(),
            weight: z.string().optional(),
            imageUrl: z.string().optional(),
            options: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
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
            });

            // Mark product as having variants
            if (!product.hasVariants) {
                await updateProduct(input.productId, { hasVariants: 1 } as any);
            }

            return variant;
        }),

    updateVariant: protectedProcedure
        .input(z.object({
            variantId: z.number(),
            productId: z.number(),
            name: z.string().optional(),
            sku: z.string().optional(),
            price: z.number().nullable().optional(),
            compareAtPrice: z.number().nullable().optional(),
            costPrice: z.number().nullable().optional(),
            stock: z.number().optional(),
            barcode: z.string().optional(),
            weight: z.string().optional(),
            imageUrl: z.string().optional(),
            options: z.string().optional(),
            isActive: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
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
            const { variantId, productId, ...data } = input;
            await prodDb.updateVariant(variantId, data as any);
            return { success: true };
        }),

    deleteVariant: protectedProcedure
        .input(z.object({ variantId: z.number(), productId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
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
                await updateProduct(input.productId, { hasVariants: 0 } as any);
            }

            return { success: true };
        }),

    // ============================================
    // Category CRUD
    // ============================================

    listCategories: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const prodDb = await import('./db/products');
        return await prodDb.getCategoriesByMerchantId(merchant.id);
    }),

    createCategory: protectedProcedure
        .input(z.object({
            name: z.string().min(1),
            nameEn: z.string().optional(),
            parentId: z.number().nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const prodDb = await import('./db/products');
            return await prodDb.createCategory({
                merchantId: merchant.id,
                ...input,
            });
        }),

    updateCategory: protectedProcedure
        .input(z.object({
            id: z.number(),
            name: z.string().optional(),
            nameEn: z.string().optional(),
            parentId: z.number().nullable().optional(),
            isActive: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
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

    deleteCategory: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
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

    getLowStock: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const prodDb = await import('./db/products');
        const products = await prodDb.getLowStockProducts(merchant.id);
        const variants = await prodDb.getLowStockVariants(merchant.id);
        return { products, variants, total: products.length + variants.length };
    }),

    // Upload CSV
    uploadCSV: protectedProcedure
        .input(z.object({
            csvData: z.string().max(5_000_000, 'الحد الأقصى لحجم الملف 5 ميجابايت'),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            // FIX #7: Proper CSV parsing that handles quoted values with commas
            function parseCSVLine(line: string): string[] {
                const result: string[] = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                result.push(current.trim());
                return result;
            }

            const lines = input.csvData.split('\n').filter(line => line.trim());
            if (lines.length < 2) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'CSV file is empty or invalid' });
            }

            // FIX #14: Limit import size
            if (lines.length > 5001) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الحد الأقصى للاستيراد 5000 منتج' });
            }

            const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
            let successCount = 0;
            let errorCount = 0;

            for (let i = 1; i < lines.length; i++) {
                try {
                    const values = parseCSVLine(lines[i]);
                    const product: any = {};

                    headers.forEach((header, index) => {
                        if (values[index]) {
                            product[header] = values[index];
                        }
                    });

                    if (product.name && product.price) {
                        await createProduct({
                            merchantId: merchant.id,
                            name: product.name,
                            description: product.description || null,
                            price: parseFloat(product.price),
                            imageUrl: product.imageurl || product.image || null,
                            stock: product.stock ? parseInt(product.stock) : null,
                        });
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    errorCount++;
                }
            }

            // Log to Sari Brain activity
            try {
                const { logBrainActivity } = await import('./routers-sari-brain');
                await logBrainActivity(merchant.id, 'products_imported', `تم استيراد ${successCount} منتج من ملف CSV`, { count: successCount, failed: errorCount });
            } catch (e) { /* skip */ }

            return {
                success: true,
                imported: successCount,
                failed: errorCount,
                total: lines.length - 1
            };
        }),

    // Upload Excel (.xlsx) — Smart import with auto-column detection + bot brain feeding
    uploadExcel: protectedProcedure
        .input(z.object({
            fileBase64: z.string().max(15_000_000, 'الحد الأقصى لحجم الملف 10 ميجابايت'),
            fileName: z.string().max(255).transform(s => s.replace(/[<>:"/\\|?*]/g, '_')),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const ExcelJS = (await import('exceljs')).default;
            const workbook = new ExcelJS.Workbook();
            const buffer = Buffer.from(input.fileBase64, 'base64');
            await workbook.xlsx.load(buffer);

            const worksheet = workbook.worksheets[0];
            if (!worksheet) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الملف لا يحتوي على بيانات' });
            }

            // Step 1: Smart header detection
            const headerRow = worksheet.getRow(1);
            const rawHeaders: { colNumber: number; value: string }[] = [];
            headerRow.eachCell((cell, colNumber) => {
                const val = cell.value?.toString().trim();
                if (val) {
                    rawHeaders.push({ colNumber, value: val });
                }
            });

            if (rawHeaders.length === 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الملف لا يحتوي على أعمدة' });
            }

            const { columnMap, autoDetected, rawHeaderNames, isServiceFile } = smartMapHeaders(rawHeaders);

            let successCount = 0;
            let errorCount = 0;
            const errors: string[] = [];
            const preview: { name: string; price: number; description: string }[] = [];

            // Step 2: Parse all rows
            const allParsedRows: Record<string, string>[] = [];
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return;

                const product: Record<string, string> = {};
                row.eachCell((cell, colNumber) => {
                    const key = columnMap[colNumber];
                    if (key) {
                        product[key] = cell.value?.toString().trim() || '';
                    }
                });

                if (product.name) {
                    allParsedRows.push(product);
                }
            });

            // FIX #14: Limit import size
            if (allParsedRows.length > 5000) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الحد الأقصى للاستيراد 5000 منتج' });
            }

            if (allParsedRows.length === 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الملف لا يحتوي على صفوف بيانات' });
            }

            // Step 3: Import products to DB (AI reads products from DB automatically)
            for (let i = 0; i < allParsedRows.length; i++) {
                const row = allParsedRows[i];
                try {
                    // Build rich description from extra columns
                    const richDescription = buildExtraDescription(row, rawHeaderNames, columnMap);

                    await createProduct({
                        merchantId: merchant.id,
                        name: row.name,
                        description: richDescription || null,
                        price: parseFloat(row.price) || 0,
                        imageUrl: row.imageUrl || null,
                        stock: row.stock ? parseInt(row.stock) : null,
                        category: row.category || null,
                        // Auto-detect product type: service for courses/services files
                        ...(isServiceFile ? { productType: 'service' as const } : {}),
                    });
                    successCount++;

                    if (preview.length < 5) {
                        preview.push({
                            name: row.name,
                            price: parseFloat(row.price) || 0,
                            description: richDescription.substring(0, 100),
                        });
                    }
                } catch (error: any) {
                    errorCount++;
                    errors.push(`سطر ${i + 2}: ${error.message}`);
                }
            }
            // Step 4: AI File Understanding — GPT-4 analyzes the full file content
            // This gives the bot DEEP understanding, not just name+price
            try {
                // Build raw text representation of the entire file
                const rawLines: string[] = [];
                rawLines.push(`ملف: ${input.fileName}`);
                rawLines.push(`الأعمدة: ${rawHeaders.map(h => h.value).join(' | ')}`);
                rawLines.push('---');
                for (let i = 0; i < Math.min(allParsedRows.length, 200); i++) {
                    const row = allParsedRows[i];
                    const parts: string[] = [];
                    for (const h of rawHeaders) {
                        const field = columnMap[h.colNumber];
                        if (field && row[field]) {
                            parts.push(`${h.value}: ${row[field]}`);
                        }
                    }
                    rawLines.push(parts.join(' | '));
                }
                const rawFileText = rawLines.join('\n').substring(0, 15000)
                    // SEC-01: Sanitize cell content to prevent prompt injection
                    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
                    .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
                    .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
                    .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
                    .replace(/new\s+instructions?\s*:/gi, '[filtered]:')
                    .replace(/do\s+not\s+follow/gi, '[filtered]')
                    .replace(/override\s+(system|all|your)/gi, '[filtered]');

                // Send to GPT-4 for deep understanding
                const { invokeLLM } = await import('./_core/llm');
                const aiResult = await invokeLLM({
                    merchantId: merchant.id,
                    messages: [
                        {
                            role: 'system',
                            content: `أنت محلل بيانات تجارية. مهمتك تحليل ملف مرفوع من تاجر وتحويله لملخص مبيعات ذكي يستخدمه بوت مبيعات واتساب.

قواعد التحليل:
1. حدد نوع النشاط (منتجات، دورات، خدمات، مطعم، إلخ)
2. لخّص كل عنصر بطريقة تساعد البوت على البيع والتوجيه
3. حدد نقاط البيع القوية (USPs) لكل عنصر
4. اقترح عبارات يستخدمها البوت عند ترشيح هذا المنتج/الخدمة
5. حدد العلاقات بين العناصر (مثلاً: "إذا اهتم العميل بدورة التسويق، رشح له دورة المبيعات")
6. اكتب بالعربية وباللهجة السعودية

شكل المخرج:
=== نوع النشاط ===
[وصف مختصر]

=== الملخص العام ===
[ملخص شامل لما يقدمه التاجر]

=== تفاصيل العناصر ===
لكل عنصر:
• الاسم: [...]
• السعر: [...]
• أبرز المميزات: [...]
• عبارة بيعية مقترحة: [...]

=== فرص البيع المتقاطع ===
[اقتراحات ربط بين المنتجات/الخدمات]`
                        },
                        {
                            role: 'user',
                            content: `حلل هذا الملف وحوّله لملخص مبيعات ذكي:\n\n${rawFileText}`
                        }
                    ],
                    maxTokens: 3000,
                });

                const aiSummary = typeof aiResult.choices[0]?.message?.content === 'string'
                    ? aiResult.choices[0].message.content
                    : '';

                if (aiSummary && aiSummary.length > 50) {
                    // Store as knowledge document for the bot
                    const existingDoc = await getKnowledgeDocByMerchantId(merchant.id);
                    if (existingDoc) {
                        // Append AI analysis to existing knowledge
                        const combined = (existingDoc.extractedText || '') + 
                            '\n\n=== تحليل ذكي لملف المنتجات ===\n' + aiSummary;
                        await updateKnowledgeDoc(existingDoc.id, {
                            extractedText: combined.substring(0, 100000),
                        });
                    } else {
                        // Create new knowledge doc with AI analysis
                        await createKnowledgeDoc({
                            merchantId: merchant.id,
                            fileName: input.fileName,
                            fileType: 'docx', // Closest match in enum
                            fileSize: buffer.length,
                            extractedText: aiSummary,
                            extractionStatus: 'completed',
                        });
                    }
                    console.log(`[Products] ✅ AI analyzed ${input.fileName}: ${aiSummary.length} chars of sales intelligence`);
                }
            } catch (aiErr) {
                // Don't fail import if AI analysis fails
                console.warn('[Products] AI file analysis failed (non-blocking):', aiErr);
            }

            // Step 5: Auto-create Google Sheet (always, per user preference)
            let sheetCreated = false;
            let spreadsheetUrl = '';
            let existingSheetWarning = '';
            try {
                const integration = await getGoogleIntegration(merchant.id, 'sheets');
                if (integration && integration.isActive) {
                    const sheets = await import('./_core/googleSheets');

                    // Check if a sheet already exists
                    if (integration.sheetId) {
                        existingSheetWarning = 'تم تحديث الشيت الحالي بالبيانات الجديدة';
                        // Clear existing data and write new
                        try {
                            await sheets.writeToSheet(
                                merchant.id,
                                integration.sheetId,
                                'Sheet1!A1',
                                buildSheetRows(allParsedRows, rawHeaderNames, columnMap)
                            );
                            spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${integration.sheetId}`;
                            sheetCreated = true;
                        } catch {
                            // If update fails, create new sheet
                            existingSheetWarning = '';
                        }
                    }

                    if (!sheetCreated) {
                        // Create new spreadsheet
                        const sheetName = `منتجات ${merchant.businessName || 'متجري'} - ساري`;
                        const createResult = await sheets.createSpreadsheet(merchant.id, sheetName);

                        if (createResult.success && createResult.spreadsheetId) {
                            await sheets.writeToSheet(
                                merchant.id,
                                createResult.spreadsheetId,
                                'Sheet1!A1',
                                buildSheetRows(allParsedRows, rawHeaderNames, columnMap)
                            );
                            spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${createResult.spreadsheetId}`;
                            sheetCreated = true;
                        }
                    }
                }
            } catch (error) {
                console.error('[Products] Error creating Google Sheet:', error);
            }

            // Log to Sari Brain activity
            try {
                const { logBrainActivity } = await import('./routers-sari-brain');
                await logBrainActivity(merchant.id, 'products_imported', `تم استيراد ${successCount} منتج من ملف Excel`, { count: successCount, failed: errorCount, autoDetected });
            } catch (e) { /* skip */ }

            return {
                success: true,
                imported: successCount,
                failed: errorCount,
                total: allParsedRows.length,
                errors: errors.slice(0, 10),
                preview: preview.slice(0, 5),
                autoDetected,
                sheetCreated,
                spreadsheetUrl,
                existingSheetWarning,
                message: autoDetected
                    ? `تم التعرف تلقائياً على الأعمدة واستيراد ${successCount} عنصر`
                    : `تم استيراد ${successCount} منتج بنجاح`,
            };
        }),

    // ════════════════════════════════════════════════════════════════
    // GPT Smart Import — AI analyzes ANY file and adds items correctly
    // ════════════════════════════════════════════════════════════════
    smartImport: protectedProcedure
        .input(z.object({
            fileBase64: z.string().max(15_000_000, 'الحد الأقصى لحجم الملف 10 ميجابايت'),
            fileName: z.string().max(255).transform(s => s.replace(/[<>:"/\\|?*]/g, '_')),
            importType: z.enum(['auto', 'products', 'services']).default('auto'),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            // SEC-04: Rate limit — max 10 smart imports per hour per merchant
            // (Using a simple in-memory counter; production should use Redis)
            const now = Date.now();
            const rateKey = `smartImport_${merchant.id}`;
            if (!smartImportRateLimit[rateKey]) smartImportRateLimit[rateKey] = { count: 0, resetAt: now + 3600000 };
            if (now > smartImportRateLimit[rateKey].resetAt) {
                smartImportRateLimit[rateKey] = { count: 0, resetAt: now + 3600000 };
            }
            if (smartImportRateLimit[rateKey].count >= 10) {
                throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'تجاوزت الحد الأقصى للاستيراد الذكي (10 مرات/ساعة). حاول لاحقاً.' });
            }
            smartImportRateLimit[rateKey].count++;

            // Step 1: Parse file content to raw text
            const ExcelJS = (await import('exceljs')).default;
            const workbook = new ExcelJS.Workbook();
            const buffer = Buffer.from(input.fileBase64, 'base64');
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
                    let safePrice = parseFloat(item.price) || 0;
                    if (!isFinite(safePrice) || safePrice < 0) safePrice = 0;
                    safePrice = Math.round(Math.min(safePrice, 99999999)); // Max ~1M SAR

                    await createProduct({
                        merchantId: merchant.id,
                        name: safeName,
                        description: fullDescription.substring(0, 5000) || null,
                        price: safePrice,
                        category: safeCategory,
                        productType: productType as any,
                    });
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
    syncFromGoogleSheets: protectedProcedure
        .mutation(async ({ ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
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
                        await updateProduct(existingId, data);
                        updated++;
                    } else {
                        // Create new product
                        await createProduct({
                            merchantId: merchant.id,
                            ...data,
                        });
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
    getSheetSyncStatus: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
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

