import { z } from 'zod';
import { resolveSalesExperimentTurnInput } from './sales-experiment-turn-contract';

const id = z.number().int().positive().safe(), digest = z.string().regex(/^[a-f0-9]{64}$/);
const utc = z.string().datetime({ precision: 3 }).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
// Server-supplied context, before the current owned inbound. No public endpoint accepts this contract.
const contextMessage = z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(16000) }).strict();
export const generateSalesExperimentTurnInput = resolveSalesExperimentTurnInput.extend({
  requestId: z.string().uuid().transform(v => v.toLowerCase()),
  contextMessages: z.array(contextMessage).max(40).default([]).refine(v => Buffer.byteLength(JSON.stringify(v), 'utf8') <= 256000),
  reason: z.string().trim().min(30).max(3000), allowProviderCharge: z.literal(true), understandsNoCustomerMessage: z.literal(true),
}).strict();
export const readSalesExperimentGenerationInput = z.object({ generationId: id }).strict();
export const salesGenerationRecipe = Object.freeze({ version: 'sales-turn-generation.v1', temperature: 0.7, maxTokens: 1500, taskType: 'sari.reply' });
export const salesGenerationSnapshot = z.object({
  version: z.literal('sales-turn-generation-authorization.v1'), merchantId: id, actorUserId: id, turnId: id, turnDigest: digest,
  conversationId: id, incomingMessageId: id, promptDigest: digest, inputDigest: digest, contextDigest: digest,
  provider: z.enum(['openai', 'zahypi']), model: z.string().min(1).max(128), observedModel: z.string().min(1).max(128), routeDigest: digest,
  recipe: z.object({ version: z.literal('sales-turn-generation.v1'), temperature: z.literal(0.7), maxTokens: z.literal(1500), taskType: z.literal('sari.reply') }).strict(),
  authorizedAt: utc, observationEndsAt: utc, reason: z.string().min(30).max(3000),
  allowProviderCharge: z.literal(true), understandsNoCustomerMessage: z.literal(true), scope: z.literal('single_turn_generation_only'),
  dispatchAllowed: z.literal(false), exposureRecorded: z.literal(false),
}).strict().refine(v => Date.parse(v.authorizedAt) < Date.parse(v.observationEndsAt));
export type GenerateSalesExperimentTurnInput = z.input<typeof generateSalesExperimentTurnInput>;
