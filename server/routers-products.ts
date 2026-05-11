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
};

function normalizeHeader(header: string): string | null {
    const normalized = header.trim().toLowerCase().replace(/\s+/g, ' ');
    return HEADER_MAP[normalized] || null;
}

/**
 * Smart header detection: if no column matches 'name' from the HEADER_MAP,
 * auto-assign the first text column as 'name' and merge remaining unmapped
 * columns into 'description'. This ensures NO file is ever rejected.
 */
function smartMapHeaders(
    rawHeaders: { colNumber: number; value: string }[]
): { columnMap: Record<number, string>; autoDetected: boolean; rawHeaderNames: Record<number, string> } {
    const columnMap: Record<number, string> = {};
    const rawHeaderNames: Record<number, string> = {};

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
        return { columnMap, autoDetected: false, rawHeaderNames };
    }

    // Phase 2: Smart fallback — auto-detect columns
    // First column = name, first numeric-looking column = price, rest = extras for description
    let nameAssigned = false;
    for (const h of rawHeaders) {
        if (!nameAssigned) {
            columnMap[h.colNumber] = 'name';
            nameAssigned = true;
        } else if (!Object.values(columnMap).includes('price') && /سعر|price|cost|رسوم|مبلغ|amount/i.test(h.value)) {
            columnMap[h.colNumber] = 'price';
        } else {
            columnMap[h.colNumber] = `extra_${h.colNumber}`;
        }
    }

    return { columnMap, autoDetected: true, rawHeaderNames };
}

/**
 * Build a rich description from extra columns for a given row.
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
            parts.push(`${headerLabel}: ${row[field]}`);
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
            csvData: z.string().max(5_000_000, 'الحد الأقصى لحجم الملف 5 ميجابايت'),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
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

    // Upload Excel (.xlsx) — Smart import with auto-column detection + bot brain feeding
    uploadExcel: protectedProcedure
        .input(z.object({
            fileBase64: z.string().max(15_000_000, 'الحد الأقصى لحجم الملف 10 ميجابايت'),
            fileName: z.string().max(255).transform(s => s.replace(/[<>:"/\\|?*]/g, '_')),
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

            const { columnMap, autoDetected, rawHeaderNames } = smartMapHeaders(rawHeaders);

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

                    await db.createProduct({
                        merchantId: merchant.id,
                        name: row.name,
                        description: richDescription || null,
                        price: parseFloat(row.price) || 0,
                        imageUrl: row.imageUrl || null,
                        stock: row.stock ? parseInt(row.stock) : null,
                        category: row.category || null,
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
                const rawFileText = rawLines.join('\n').substring(0, 15000); // Cap for token limits

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
                    const existingDoc = await db.getKnowledgeDocByMerchantId(merchant.id);
                    if (existingDoc) {
                        // Append AI analysis to existing knowledge
                        const combined = (existingDoc.extractedText || '') + 
                            '\n\n=== تحليل ذكي لملف المنتجات ===\n' + aiSummary;
                        await db.updateKnowledgeDoc(existingDoc.id, {
                            extractedText: combined.substring(0, 100000),
                        });
                    } else {
                        // Create new knowledge doc with AI analysis
                        await db.createKnowledgeDoc({
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
                const integration = await db.getGoogleIntegration(merchant.id, 'sheets');
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

    // Legacy: Upload Excel AND create a Google Sheet (kept for backward compat, redirects to uploadExcel logic)
    uploadExcelAndCreateSheet: protectedProcedure
        .input(z.object({
            fileBase64: z.string().max(15_000_000, 'الحد الأقصى لحجم الملف 10 ميجابايت'),
            fileName: z.string().max(255).transform(s => s.replace(/[<>:"/\\|?*]/g, '_')),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            // Step 1: Parse Excel
            const ExcelJS = (await import('exceljs')).default;
            const workbook = new ExcelJS.Workbook();
            const buffer = Buffer.from(input.fileBase64, 'base64');
            await workbook.xlsx.load(buffer);

            const worksheet = workbook.worksheets[0];
            if (!worksheet) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الملف لا يحتوي على بيانات' });
            }

            // Read headers
            const headerRow = worksheet.getRow(1);
            const columnMap: Record<number, string> = {};
            headerRow.eachCell((cell, colNumber) => {
                const val = cell.value?.toString().trim();
                if (val) {
                    const mapped = normalizeHeader(val);
                    if (mapped) columnMap[colNumber] = mapped;
                }
            });

            if (!Object.values(columnMap).includes('name')) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الملف لا يحتوي على عمود الاسم' });
            }

            // Step 2: Import products to DB
            let successCount = 0;
            let errorCount = 0;
            const allRows: string[][] = [];

            // Build header for Google Sheet
            const sheetHeaders = ['الاسم', 'الوصف', 'السعر', 'التصنيف', 'الكمية', 'رابط الصورة'];
            allRows.push(sheetHeaders);

            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return;

                const product: Record<string, any> = {};
                row.eachCell((cell, colNumber) => {
                    const key = columnMap[colNumber];
                    if (key) product[key] = cell.value?.toString().trim() || '';
                });

                if (product.name) {
                    allRows.push([
                        product.name || '',
                        product.description || '',
                        product.price || '0',
                        product.category || '',
                        product.stock || '0',
                        product.imageUrl || '',
                    ]);
                }
            });

            // Import to DB
            for (let i = 1; i < allRows.length; i++) {
                try {
                    const [name, description, price, category, stock, imageUrl] = allRows[i];
                    if (name) {
                        await db.createProduct({
                            merchantId: merchant.id,
                            name,
                            description: description || null,
                            price: parseFloat(price) || 0,
                            category: category || null,
                            stock: stock ? parseInt(stock) : null,
                            imageUrl: imageUrl || null,
                        });
                        successCount++;
                    }
                } catch {
                    errorCount++;
                }
            }

            // Step 3: Try to create Google Sheet (if connected)
            let sheetCreated = false;
            let spreadsheetUrl = '';
            try {
                const integration = await db.getGoogleIntegration(merchant.id, 'sheets');
                if (integration && integration.isActive) {
                    const sheets = await import('./_core/googleSheets');

                    // Create new spreadsheet
                    const sheetName = `منتجات ${merchant.businessName || 'متجري'} - ساري`;
                    const createResult = await sheets.createSpreadsheet(merchant.id, sheetName);

                    if (createResult.success && createResult.spreadsheetId) {
                        // Write products to the sheet
                        await sheets.writeToSheet(
                            merchant.id,
                            createResult.spreadsheetId,
                            'Sheet1!A1',
                            allRows
                        );

                        // Rename Sheet1 to المنتجات
                        try {
                            const { google } = await import('googleapis');
                            const gAuth = await import('./_core/googleSheets');
                            // Update the sheet name via direct API is complex, skip for now
                        } catch {}

                        spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${createResult.spreadsheetId}`;
                        sheetCreated = true;
                    }
                }
            } catch (error) {
                console.error('[Products] Error creating Google Sheet:', error);
                // Don't fail the whole operation if sheet creation fails
            }

            return {
                success: true,
                imported: successCount,
                failed: errorCount,
                total: allRows.length - 1,
                sheetCreated,
                spreadsheetUrl,
                message: sheetCreated
                    ? `تم استيراد ${successCount} منتج وإنشاء Google Sheet للمزامنة التلقائية`
                    : `تم استيراد ${successCount} منتج. اربط Google Sheets لتفعيل المزامنة التلقائية`,
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

