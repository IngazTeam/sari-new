/**
 * Media Library Router Module
 * Handles file upload, listing, and deletion for merchant media assets
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 * 
 * Security Hardening (PEN-MEDIA-01 through PEN-MEDIA-06):
 * - Magic bytes validation to prevent MIME spoofing
 * - Per-merchant upload/delete rate limiting
 * - Filename sanitization (path traversal + HTML stripping)
 * - S3 orphan file logging on deletion
 */

import { z } from 'zod';
import { router, protectedProcedure } from './_core/trpc';
import { TRPCError } from '@trpc/server';
import crypto from 'node:crypto';
import { getMerchantByUserId } from './db';
import { reserveApiRateLimit } from './api/distributed-rate-limit';
import {
  UploadValidationError,
  assertMediaSignature,
  decodeCanonicalBase64Upload,
} from './security/upload-validation';

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
// PEN-MEDIA-03/04 FIX: Rate Limiting
// ═══════════════════════════════════════════════════════════════

const deleteRateLimit: Record<number, number> = {};

function checkRateLimit(map: Record<number, number>, merchantId: number, cooldownMs: number, label: string): void {
  const now = Date.now();
  const last = map[merchantId] || 0;
  if (now - last < cooldownMs) {
    const waitSec = Math.ceil((cooldownMs - (now - last)) / 1000);
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `عدد الطلبات كثير. الرجاء الانتظار ${waitSec} ثانية قبل ${label}.`,
    });
  }
  map[merchantId] = now;
}

// ═══════════════════════════════════════════════════════════════
// PEN-MEDIA-05 FIX: Filename Sanitization
// ═══════════════════════════════════════════════════════════════

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>"'`&;\\\/]/g, '') // Strip HTML/path-dangerous chars
    .replace(/\.\./g, '')          // Strip directory traversal
    .replace(/[\x00-\x1F\x7F]/g, '') // Strip control characters
    .trim()
    .substring(0, 255) || 'unnamed';
}

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

      const uploadLimit = await reserveApiRateLimit({
        namespace: 'merchant_media_upload',
        identity: String(merchantId),
        maxRequests: 20,
        windowMs: 60 * 60 * 1_000,
      });
      if (!uploadLimit.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'تم بلوغ حد رفع الوسائط مؤقتًا. حاول لاحقًا.',
        });
      }

      // SEC: MIME whitelist
      const normalizedMime = input.mimeType.toLowerCase().trim();
      if (!ALLOWED_MIMES.includes(normalizedMime)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'نوع الملف غير مسموح. الأنواع المدعومة: JPEG, PNG, WebP, GIF, PDF',
        });
      }

      let buffer: Buffer;
      try {
        buffer = decodeCanonicalBase64Upload(input.fileBase64, MAX_FILE_SIZE_BYTES);
        assertMediaSignature(buffer, normalizedMime);
      } catch (error) {
        if (!(error instanceof UploadValidationError)) throw error;
        console.warn(`[Media] Upload content rejected. merchant=${merchantId} reason=${error.reason}`);
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'الملف غير صالح أو لا يتطابق مع نوعه المعلن.',
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

      // Generate unique filename (safe — no user input in path)
      const ext = MIME_TO_EXT[normalizedMime] || 'bin';
      const randomStr = crypto.randomBytes(6).toString('hex');
      const timestamp = Date.now();
      const fileName = `media/${merchantId}/${input.category}/${timestamp}-${randomStr}.${ext}`;

      // Upload to storage
      const { storagePut } = await import('./storage');
      const { url } = await storagePut(fileName, buffer, normalizedMime);

      // PEN-MEDIA-05 FIX: Sanitize originalName before DB storage
      const safeName = sanitizeFileName(input.originalName);

      // Save to DB
      const mediaItem = await mediaDb.createMediaItem({
        merchantId,
        fileName,
        originalName: safeName,
        mimeType: normalizedMime,
        fileSize: buffer.length,
        url,
        category: input.category,
      });

      console.log(`[Media] Uploaded ${safeName} (${(buffer.length / 1024).toFixed(1)}KB) for merchant ${merchantId}`);

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

      // PEN-MEDIA-04 FIX: Rate limit — max 1 delete per 1 second
      checkRateLimit(deleteRateLimit, merchantId, 1_000, 'حذف ملف آخر');

      const mediaDb = await import('./db/media');

      // Verify ownership
      const item = await mediaDb.getMediaById(input.id, merchantId);
      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الملف غير موجود' });
      }

      // PEN-MEDIA-02 FIX: Log orphaned S3 key for manual/automated cleanup
      console.log(`[Media] ORPHAN_CLEANUP_NEEDED: s3Key="${item.fileName}" merchant=${merchantId} originalName="${item.originalName}"`);

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
