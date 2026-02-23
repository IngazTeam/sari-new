/**
 * Products Router Module
 * Handles product CRUD operations, CSV/Excel import, and Google Sheets sync
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

// Header mapping: supports English and Arabic column headers
const HEADER_MAP: Record<string, string> = {
    'name': 'name', 'الاسم': 'name', 'اسم المنتج': 'name', 'product name': 'name', 'اسم': 'name',
    'description': 'description', 'الوصف': 'description', 'وصف': 'description', 'وصف المنتج': 'description',
    'price': 'price', 'السعر': 'price', 'سعر': 'price',
    'imageurl': 'imageUrl', 'image': 'imageUrl', 'الصورة': 'imageUrl', 'رابط الصورة': 'imageUrl', 'صورة': 'imageUrl',
    'stock': 'stock', 'المخزون': 'stock', 'الكمية': 'stock', 'كمية': 'stock', 'quantity': 'stock',
    'category': 'category', 'التصنيف': 'category', 'تصنيف': 'category', 'الفئة': 'category',
};

function normalizeHeader(header: string): string | null {
    const normalized = header.trim().toLowerCase().replace(/\s+/g, ' ');
    return HEADER_MAP[normalized] || null;
}

export const productsRouter = router({
    // List products for merchant
    list: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        return await db.getProductsByMerchantId(merchant.id);
    }),

    // Create product
    create: protectedProcedure
        .input(z.object({
            name: z.string().min(1),
            description: z.string().optional(),
            price: z.number().positive(),
            currency: z.enum(['SAR', 'USD']).optional(),
            imageUrl: z.string().url().optional(),
            stock: z.number().int().min(0).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const productId = await db.createProduct({
                merchantId: merchant.id,
                ...input,
                currency: input.currency || merchant.currency || 'SAR',
            });
            return { success: true, productId };
        }),

    // Update product
    update: protectedProcedure
        .input(z.object({
            productId: z.number(),
            name: z.string().min(1).optional(),
            description: z.string().optional(),
            price: z.number().positive().optional(),
            currency: z.enum(['SAR', 'USD']).optional(),
            imageUrl: z.string().url().optional(),
            stock: z.number().int().min(0).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            // Verify product belongs to this merchant (prevent IDOR)
            const product = await db.getProductById(input.productId);
            if (!product || product.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this product' });
            }

            const { productId, ...updates } = input;
            await db.updateProduct(productId, updates);
            return { success: true };
        }),

    // Delete product
    delete: protectedProcedure
        .input(z.object({ productId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            // Verify product belongs to this merchant (prevent IDOR)
            const product = await db.getProductById(input.productId);
            if (!product || product.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this product' });
            }

            await db.deleteProduct(input.productId);
            return { success: true };
        }),

    // Upload CSV
    uploadCSV: protectedProcedure
        .input(z.object({
            csvData: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            // Parse CSV data
            const lines = input.csvData.split('\n').filter(line => line.trim());
            if (lines.length < 2) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'CSV file is empty or invalid' });
            }

            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            let successCount = 0;
            let errorCount = 0;

            for (let i = 1; i < lines.length; i++) {
                try {
                    const values = lines[i].split(',').map(v => v.trim());
                    const product: any = {};

                    headers.forEach((header, index) => {
                        if (values[index]) {
                            product[header] = values[index];
                        }
                    });

                    if (product.name && product.price) {
                        await db.createProduct({
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

            return {
                success: true,
                imported: successCount,
                failed: errorCount,
                total: lines.length - 1
            };
        }),

    // Upload Excel (.xlsx) — accepts base64-encoded file
    uploadExcel: protectedProcedure
        .input(z.object({
            fileBase64: z.string(),
            fileName: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const ExcelJS = (await import('exceljs')).default;
            const workbook = new ExcelJS.Workbook();
            const buffer = Buffer.from(input.fileBase64, 'base64');
            await workbook.xlsx.load(buffer);

            const worksheet = workbook.worksheets[0];
            if (!worksheet) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الملف لا يحتوي على بيانات' });
            }

            // Read headers from first row
            const headerRow = worksheet.getRow(1);
            const columnMap: Record<number, string> = {};
            headerRow.eachCell((cell, colNumber) => {
                const val = cell.value?.toString().trim();
                if (val) {
                    const mapped = normalizeHeader(val);
                    if (mapped) {
                        columnMap[colNumber] = mapped;
                    }
                }
            });

            if (!Object.values(columnMap).includes('name')) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الملف لا يحتوي على عمود الاسم (name أو الاسم)' });
            }

            let successCount = 0;
            let errorCount = 0;
            const errors: string[] = [];
            const preview: { name: string; price: number; description: string }[] = [];

            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // skip header

                const product: Record<string, any> = {};
                row.eachCell((cell, colNumber) => {
                    const key = columnMap[colNumber];
                    if (key) {
                        product[key] = cell.value?.toString().trim() || '';
                    }
                });

                if (product.name) {
                    preview.push({
                        name: product.name,
                        price: parseFloat(product.price) || 0,
                        description: product.description || '',
                    });
                }
            });

            // Actually import products
            for (const item of preview) {
                try {
                    const idx = preview.indexOf(item);
                    const row: Record<string, any> = {};
                    // Re-read from worksheet
                    const wsRow = worksheet.getRow(idx + 2);
                    wsRow.eachCell((cell, colNumber) => {
                        const key = columnMap[colNumber];
                        if (key) {
                            row[key] = cell.value?.toString().trim() || '';
                        }
                    });

                    if (row.name && (row.price || parseFloat(row.price) === 0)) {
                        await db.createProduct({
                            merchantId: merchant.id,
                            name: row.name,
                            description: row.description || null,
                            price: parseFloat(row.price) || 0,
                            imageUrl: row.imageUrl || null,
                            stock: row.stock ? parseInt(row.stock) : null,
                            category: row.category || null,
                        });
                        successCount++;
                    } else {
                        errorCount++;
                        errors.push(`سطر ${idx + 2}: اسم أو سعر مفقود`);
                    }
                } catch (error: any) {
                    errorCount++;
                    errors.push(`سطر ${preview.indexOf(item) + 2}: ${error.message}`);
                }
            }

            return {
                success: true,
                imported: successCount,
                failed: errorCount,
                total: preview.length,
                errors: errors.slice(0, 10), // Return first 10 errors
                preview: preview.slice(0, 5), // Return first 5 items as preview
            };
        }),

    // Sync products from linked Google Sheet
    syncFromGoogleSheets: protectedProcedure
        .mutation(async ({ ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const integration = await db.getGoogleIntegration(merchant.id, 'sheets');
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
            const existingProducts = await db.getProductsByMerchantId(merchant.id);
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
                        await db.updateProduct(existingId, data);
                        updated++;
                    } else {
                        // Create new product
                        await db.createProduct({
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
            await db.updateGoogleIntegration(integration.id, {
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) return { connected: false };

        const integration = await db.getGoogleIntegration(merchant.id, 'sheets');
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

