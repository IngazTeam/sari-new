import { randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { resolveUser } from './_core/auth';
import { supportLimiter } from './_core/rateLimiter';
import { createSupportTicket, getMerchantByUserId, getPool } from './db';
import { sendEmail } from './reports/email-sender';
import { SUPPORT_LEAD_SOURCES } from '../shared/support-lead';

const SUPPORT_EMAIL = 'support@sary.live';
const STATUS_CACHE_MS = 30_000;
const STATUS_QUERY_TIMEOUT_MS = 2_500;

export const publicSupportRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(4_000),
  source: z.enum(SUPPORT_LEAD_SOURCES).optional().default('general'),
  website: z.string().max(200).optional().default(''),
  startedAt: z.number().int().positive().optional(),
}).strict();

type PublicServiceStatus = {
  status: 'operational' | 'degraded';
  checks: {
    web: 'operational';
    api: 'operational';
    database: 'operational' | 'unavailable';
  };
  checkedAt: string;
};

let statusCache: { expiresAt: number; value: PublicServiceStatus } | null = null;

export function escapeSupportHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function createSupportReference(ticketId?: number): string {
  return ticketId
    ? `SR-${ticketId}`
    : `SR-${randomBytes(6).toString('hex').toUpperCase()}`;
}

function requestMatchesHost(req: Request): boolean {
  const origin = req.get('origin');
  if (!origin) return true;

  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

function buildSupportEmail(input: z.infer<typeof publicSupportRequestSchema>, reference: string, merchantId?: number): string {
  const safeName = escapeSupportHtml(input.name);
  const safeEmail = escapeSupportHtml(input.email);
  const safeSubject = escapeSupportHtml(input.subject);
  const safeMessage = escapeSupportHtml(input.message).replaceAll('\n', '<br>');
  const safeSource = escapeSupportHtml(input.source);

  return `
    <h2>طلب دعم ${escapeSupportHtml(reference)}</h2>
    <p><strong>المصدر:</strong> ${merchantId ? `متجر #${merchantId}` : 'زائر عام'} / ${safeSource}</p>
    <p><strong>الاسم:</strong> ${safeName}</p>
    <p><strong>بريد الرد:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
    <p><strong>الموضوع:</strong> ${safeSubject}</p>
    <hr>
    <p>${safeMessage}</p>
  `;
}

async function getPublicServiceStatus(): Promise<PublicServiceStatus> {
  if (statusCache && statusCache.expiresAt > Date.now()) return statusCache.value;

  let database: PublicServiceStatus['checks']['database'] = 'unavailable';
  try {
    const pool = await getPool();
    if (pool) {
      await Promise.race([
        pool.query('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('status query timeout')), STATUS_QUERY_TIMEOUT_MS)),
      ]);
      database = 'operational';
    }
  } catch {
    database = 'unavailable';
  }

  const value: PublicServiceStatus = {
    status: database === 'operational' ? 'operational' : 'degraded',
    checks: { web: 'operational', api: 'operational', database },
    checkedAt: new Date().toISOString(),
  };
  statusCache = { expiresAt: Date.now() + STATUS_CACHE_MS, value };
  return value;
}

const publicSupportRouter = Router();

publicSupportRouter.get('/status', async (_req, res) => {
  const status = await getPublicServiceStatus();
  res.status(status.status === 'operational' ? 200 : 503).json(status);
});

publicSupportRouter.post('/support', supportLimiter, async (req, res) => {
  if (!requestMatchesHost(req)) {
    return res.status(403).json({ accepted: false, code: 'ORIGIN_REJECTED' });
  }

  const parsed = publicSupportRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ accepted: false, code: 'INVALID_REQUEST' });
  }

  const input = parsed.data;
  if (input.website) {
    return res.status(202).json({ accepted: true, reference: createSupportReference() });
  }

  let merchantId: number | undefined;
  let ticketId: number | undefined;

  try {
    const user = await resolveUser(req);
    if (user) {
      const merchant = await getMerchantByUserId(user.id);
      if (merchant) {
        merchantId = merchant.id;
        const ticket = await createSupportTicket({
          merchantId,
          subject: input.subject.replace(/[\r\n]+/g, ' '),
          message: `المصدر التسويقي: ${input.source}\nالاسم: ${input.name}\nبريد الرد: ${input.email}\n\n${input.message}`,
          status: 'open',
          priority: 'medium',
        });
        ticketId = ticket?.id;
      }
    }
  } catch {
    // Email delivery remains a safe fallback if merchant-ticket persistence is unavailable.
  }

  const reference = createSupportReference(ticketId);
  const delivered = await sendEmail({
    to: SUPPORT_EMAIL,
    subject: `[${reference}] ${input.subject.replace(/[\r\n]+/g, ' ')}`,
    html: buildSupportEmail(input, reference, merchantId),
  });

  if (!ticketId && !delivered) {
    return res.status(503).json({ accepted: false, code: 'SUPPORT_UNAVAILABLE' });
  }

  return res.status(201).json({ accepted: true, reference });
});

export default publicSupportRouter;
