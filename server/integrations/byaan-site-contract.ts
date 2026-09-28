import { z } from 'zod';

/** Complete, bounded public CMS snapshot; never accept silent truncation. */
export const byaanSiteSnapshot = z.object({
  title: z.string().trim().min(1).max(255).refine(value => !/[\u0000-\u001f\u007f<>]/.test(value)),
  content: z.string().max(50_000).refine(value => !/[\u0000\u0008\u000b\u000c\u007f]/.test(value)),
}).strict();
