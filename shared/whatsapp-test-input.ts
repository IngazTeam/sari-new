import { z } from 'zod';
const credentials = {
  instanceId: z.string().regex(/^\d{5,30}$/),
  token: z.string().regex(/^[A-Za-z0-9_-]{8,512}$/),
};
export const whatsappConnectionTestInput = z.object(credentials).strict();
const phoneNumber = z.string().regex(/^[1-9]\d{7,14}$/);
export const whatsappTextTestInput = z.object({ ...credentials, phoneNumber, message: z.string().trim().min(1).max(4096) }).strict();
export const whatsappImageTestInput = z.object({ ...credentials, phoneNumber,
  imageUrl: z.string().max(2048).refine(value => {
    try {
      const url = new URL(value), host = url.hostname.toLowerCase();
      return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
        !/[\s\u0000-\u001f\\]/.test(value) && /^[a-z0-9.-]+\.[a-z]{2,63}$/.test(host) &&
        !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host);
    } catch { return false; }
  }), caption: z.string().max(1024).optional(),
}).strict();
export type WhatsAppTestCredentials = z.infer<typeof whatsappConnectionTestInput>;
