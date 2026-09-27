import { readFile } from 'node:fs/promises';
import { aiPriceCardSaveInput } from '../shared/ai-price-contract';
import { saveAiPriceCard } from '../server/ai/price-admin';
import { closeDb } from '../server/db/connection';

try {
  const index = process.argv.indexOf('--file');
  if (index < 0 || !process.argv[index + 1]) throw new Error('Use --file <approved-price.json> [--apply --actor-id <active-admin-id>]');
  const content = await readFile(process.argv[index + 1], 'utf8');
  if (Buffer.byteLength(content) > 16_384) throw new Error('Price file exceeds limit');
  const card = aiPriceCardSaveInput.parse(JSON.parse(content));
  if (process.argv.includes('--apply')) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const actorIndex = process.argv.indexOf('--actor-id');
    const actorId = actorIndex < 0 ? NaN : Number(process.argv[actorIndex + 1]);
    if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new Error('An active admin actor ID is required');
    const result = await saveAiPriceCard(card, actorId);
    console.log(JSON.stringify({ mode: 'applied', provider: card.provider, model: card.model, version: card.version, ...result }));
  } else console.log(JSON.stringify({ mode: 'validated-only', card }));
} catch (error) {
  console.error('AI_PRICE_CONFIGURATION_FAILED', error instanceof Error ? error.name : 'UnknownError');
  process.exitCode = 1;
} finally { await closeDb(); }
