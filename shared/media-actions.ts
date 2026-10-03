import { z } from 'zod';
import { mediaId, mediaCategories, mediaMimes } from './media-workspace';
export const mediaRequestKey = z.string().uuid();
export const mediaReceiptInput = z.object({ requestKey: mediaRequestKey }).strict();
export const mediaUploadInput = z.object({ requestKey: mediaRequestKey, originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(mediaMimes), category: z.enum(mediaCategories), fileBase64: z.string().min(4).max(6990508) }).strict();
export const mediaRemoveInput = z.object({ requestKey: mediaRequestKey, id: mediaId, revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const mediaRequestResult = z.object({ actorId: mediaId, merchantId: mediaId, requestKey: mediaRequestKey,
  state: z.enum(['missing', 'uploading', 'uploaded', 'removed', 'cancelled']), kind: z.enum(['upload', 'remove']).nullable(),
  assetId: mediaId.nullable(), originalName: z.string().max(500).nullable(), fileSize: z.number().int().nonnegative().safe().nullable(),
  category: z.enum(mediaCategories).nullable(), url: z.string().max(8192).nullable(),
  checkedAt: z.string().datetime(), closedBy: mediaId.nullable(), storageDeletion: z.literal('not_attempted'),
}).strict();
export type MediaRequestResult = z.infer<typeof mediaRequestResult>;
export type MediaUploadInput = z.infer<typeof mediaUploadInput>;

export function mediaFileName(name: string): string {
  return name.normalize('NFKC').replace(/[<>"'`&;\\\/]/g, '').replace(/\.\./g, '')
    .replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 255) || 'unnamed';
}
