import { z } from 'zod';

export const mediaCategories = ['product', 'promotion', 'template', 'general'] as const;
export const mediaMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] as const;
export const mediaId = z.number().int().positive().max(2147483647);
const count = z.number().int().nonnegative().safe();
export const mediaWorkspaceInput = z.object({
  query: z.string().trim().max(100).default(''),
  category: z.enum(['all', ...mediaCategories]).default('all'),
  kind: z.enum(['all', 'image', 'pdf', 'other']).default('all'),
  sort: z.enum(['newest', 'oldest', 'name', 'largest']).default('newest'),
  page: z.number().int().min(1).max(1000000).default(1),
}).strict();
export type MediaSelection = z.infer<typeof mediaWorkspaceInput>;
export const mediaWorkspaceRow = z.object({
  id: mediaId, revision: z.string().regex(/^[a-f0-9]{64}$/),
  originalName: z.string().max(500).nullable(), fileName: z.string().max(500).nullable(),
  mimeType: z.string().max(100).nullable(), fileSize: count.nullable(),
  category: z.enum(mediaCategories).nullable(), kind: z.enum(['image', 'pdf', 'other']),
  url: z.string().max(8192).nullable(), previewUrl: z.string().max(8192).nullable(),
  createdAt: z.string().datetime().nullable(), canDelete: z.boolean(),
  issues: z.array(z.enum(['name', 'storage_key', 'mime', 'size', 'category', 'url', 'created'])),
}).strict();
export type MediaWorkspaceRow = z.infer<typeof mediaWorkspaceRow>;
export const mediaWorkspaceSchema = z.object({
  actorId: mediaId, merchantId: mediaId, checkedAt: z.string().datetime(), selection: mediaWorkspaceInput,
  currentPage: count, pageSize: z.literal(24), pages: count, total: count, matched: count,
  totalSizeBytes: count.nullable(), invalidSizeCount: count,
  maxFileBytes: z.literal(5242880), maxStorageBytes: z.literal(52428800),
  storageEvidence: z.literal('registered_metadata'), referenceEvidence: z.literal('not_scanned'),
  allowedUploadCategories: z.array(z.enum(mediaCategories)).max(4),
  counts: z.object({ product: count, promotion: count, template: count, general: count, other: count }).strict(),
  rows: z.array(mediaWorkspaceRow).max(24),
}).strict();
export type MediaWorkspace = z.infer<typeof mediaWorkspaceSchema>;

/** Browser navigation syntax only. No DNS, content, storage existence or reference proof. */
export function mediaLibraryUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192 || /[\s\x00-\x1f\x7f\\]/.test(value)) return null;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443'
        || !host.includes('.') || /[:\[\]]/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)
        || /\.(?:localhost|local|internal|test|invalid)$/.test(host) || host.endsWith('.')) return null;
    return url.href;
  } catch { return null; }
}
