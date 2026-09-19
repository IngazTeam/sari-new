import { readFile } from 'node:fs/promises';
import { aiPriceCardInput, saveAiPriceCard } from '../server/ai/budget-admin';
import { closeDb } from '../server/db/connection';

try {
  const index = process.argv.indexOf('--file');
  if (index < 0 || !process.argv[index + 1]) throw new Error('Use --file <approved-price.json> [--apply]');
  const content = await readFile(process.argv[index + 1], 'utf8');
  if (Buffer.byteLength(content) > 16_384) throw new Error('Price file exceeds limit');
  const card = aiPriceCardInput.parse(JSON.parse(content));
  if (process.argv.includes('--apply')) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    await saveAiPriceCard(card);
    console.log(JSON.stringify({ mode: 'applied', provider: card.provider, model: card.model, version: card.version }));
  } else console.log(JSON.stringify({ mode: 'validated-only', card }));
} catch (error) {
  console.error('AI_PRICE_CONFIGURATION_FAILED', error instanceof Error ? error.name : 'UnknownError');
  process.exitCode = 1;
} finally { await closeDb(); }
