/**
 * .env loader — MUST be the first import in the app entry point.
 * Separated into its own module so esbuild evaluates it before all other modules.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

try {
  const __dirname2 = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(__dirname2, '../../.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  console.log('[ENV] Loaded .env file from', envPath);
} catch (e) {
  console.warn('[ENV] Could not load .env file:', (e as Error).message);
}
