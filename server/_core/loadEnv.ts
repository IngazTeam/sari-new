/**
 * .env loader — MUST be the first import in the app entry point.
 * Separated into its own module so esbuild evaluates it before all other modules.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

try {
  const configuredPath = process.env.SARI_ENV_FILE?.trim();
  const envPath = configuredPath ? resolve(configuredPath) : resolve(process.cwd(), '.env');
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
  console.log('[ENV] Loaded configured environment file');
} catch {
  console.warn('[ENV] Could not load configured environment file');
}
