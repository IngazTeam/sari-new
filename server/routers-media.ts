/**
 * Media Library Router Module
 * Handles file upload, listing, and deletion for merchant media assets
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from 'zod';
import { router, protectedProcedure } from './_core/trpc';
import { TRPCError } from '@trpc/server';
import crypto from 'node:crypto';
import { getMerchantByUserId } from './db';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_STORAGE_BYTES = 50 * 1024 * 1024; // 50MB per merchant

const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
];

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

// ═══════════════════════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════════════════════

async function getMerchantId(ctx: any): Promise<number> {
  const merchant = await getMerchantByUserId(ctx.user.id);
  if (!merchant) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
  }
  return merchant.id;
}

// ═══════════════════════════════════════════════════════════════
// Router
// ═══════════════════════════════════════════════════════════════

export const mediaRouter = router({
  /** Upload a media file */
  upload: protectedProcedure
    .input(z.object({
      fileBase64: z.string().max(7_500_000), // ~5.6MB base64 = ~4.2MB raw
      originalName: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(100),
      category: z.enum(['product', 'promotion', 'template', 'general']).default('general'),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await getMerchantId(ctx);

      // SEC: MIME whitelist
      const normalizedMime = input.mimeType.toLowerCase().trim();
      if (!ALLOWED_MIMES.includes(normalizedMime)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'نوع الملف غير مسموح. الأنواع المدعومة: JPEG, PNG, WebP, GIF, PDF',
        });
      }

      // Decode and validate size
      const buffer = Buffer.from(input.fileBase64, 'base64');
      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `حجم الملف كبير جداً (${sizeMB}MB). الحد الأقصى 5MB`,
        });
      }

      // Check storage quota
      const mediaDb = await import('./db/media');
      const stats = await mediaDb.getMediaStats(merchantId);
      if (stats.totalSizeBytes + buffer.length > MAX_STORAGE_BYTES) {
        const usedMB = (stats.totalSizeBytes / (1024 * 1024)).toFixed(1);
        const limitMB = (MAX_STORAGE_BYTES / (1024 * 1024)).toFixed(0);
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `تم الوصول لحد التخزين (${usedMB}MB من ${limitMB}MB). احذف ملفات قديمة لتوفير مساحة.`,
        });
      }

      // Generate unique filename
      const ext = MIME_TO_EXT[normalizedMime] || 'bin';
      const randomStr = crypto.randomBytes(6).toString('hex');
      const timestamp = Date.now();
      const fileName = `media/${merchantId}/${input.category}/${timestamp}-${randomStr}.${ext}`;

      // Upload to storage
      const { storagePut } = await import('./storage');
      const { url } = await storagePut(fileName, buffer, normalizedMime);

      // Save to DB
      const mediaItem = await mediaDb.createMediaItem({
        merchantId,
        fileName,
        originalName: input.originalName,
        mimeType: normalizedMime,
        fileSize: buffer.length,
        url,
        category: input.category,
      });

      console.log(`[Media] Uploaded ${input.originalName} (${(buffer.length / 1024).toFixed(1)}KB) for merchant ${merchantId}`);

      return {
        id: mediaItem.id,
        url: mediaItem.url,
        fileName: mediaItem.originalName,
        fileSize: mediaItem.fileSize,
        category: mediaItem.category,
      };
    }),

  /** List media items */
  list: protectedProcedure
    .input(z.object({
      category: z.enum(['product', 'promotion', 'template', 'general']).optional(),
      limit: z.number().min(1).max(500).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const merchantId = await getMerchantId(ctx);
      const mediaDb = await import('./db/media');
      return mediaDb.getMediaByMerchant(
        merchantId,
        input?.category,
        input?.limit || 100
      );
    }),

  /** Delete a media item */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await getMerchantId(ctx);
      const mediaDb = await import('./db/media');

      // Verify ownership
      const item = await mediaDb.getMediaById(input.id, merchantId);
      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الملف غير موجود' });
      }

      await mediaDb.deleteMediaItem(input.id, merchantId);
      console.log(`[Media] Deleted ${item.originalName} for merchant ${merchantId}`);
      return { success: true };
    }),

  /** Get storage stats */
  getStats: protectedProcedure
    .query(async ({ ctx }) => {
      const merchantId = await getMerchantId(ctx);
      const mediaDb = await import('./db/media');
      const stats = await mediaDb.getMediaStats(merchantId);

      return {
        ...stats,
        maxStorageBytes: MAX_STORAGE_BYTES,
        usagePercent: Math.round((stats.totalSizeBytes / MAX_STORAGE_BYTES) * 100),
      };
    }),
});

export type MediaRouter = typeof mediaRouter;
