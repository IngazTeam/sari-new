import { sql, type SQL } from 'drizzle-orm';
import { getDb } from '../db/connection';
import { bookingReadId } from '../../shared/booking-read';
import { platformIds, platformWorkspaceSchema, platformInventorySchema, safePlatformUrl, type PlatformSummary } from '../../shared/platform-workspace';
import { catalogVisibleSql } from './catalog-scope';
export class PlatformSourceUnavailableError extends Error { constructor() { super('Platform connection data unavailable'); } }
type Row = Record<string, any>;
function count(value: unknown) {
  if (!(typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value))) throw new PlatformSourceUnavailableError();
  const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) throw new PlatformSourceUnavailableError(); return n;
}
const stamp = (value: unknown) => {
  if (value == null) return null;
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z') : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
/** One read-only snapshot. A missing source is an error, never an unlinked platform. No secrets are selected or decrypted. */
export async function readPlatformWorkspace(actorId: number, merchantId: number, now = new Date()) {
  bookingReadId.parse(actorId);
  return platformWorkspaceSchema.parse({actorId,...await readPlatformInventory(merchantId,now)});
}
export async function readPlatformInventory(merchantId: number, now = new Date()) {
  bookingReadId.parse(merchantId);
  try {
    const db = await getDb(); if (!db || !Number.isFinite(now.getTime())) throw new PlatformSourceUnavailableError();
    return await db.transaction(async tx => {
      const read = async (query: SQL): Promise<Row[]> => { const result = await tx.execute(query); if (!Array.isArray(result[0])) throw new PlatformSourceUnavailableError(); return result[0] as Row[]; };
      const one = async (query: SQL) => { const rows = await read(query); if (rows.length > 1) throw new PlatformSourceUnavailableError(); return rows[0]; };
      const merchant = await one(sql`SELECT id,integration_source AS source FROM merchants WHERE id=${merchantId} LIMIT 2`);
      if (!merchant || count(merchant.id) !== merchantId) throw new PlatformSourceUnavailableError();
      const source = merchant.source ?? 'none';
      const salla = await one(sql`SELECT storeUrl,syncStatus AS state,createdAt,lastSyncAt,(syncErrors IS NOT NULL AND syncErrors <> '') AS hasErrors FROM salla_connections WHERE merchantId=${merchantId} LIMIT 2`);
      const canonical = await one(sql`SELECT store_url AS storeUrl,is_active AS active,created_at AS createdAt,last_sync_at AS lastSyncAt FROM platform_integrations WHERE merchant_id=${merchantId} AND platform_type='zid' LIMIT 2`);
      // An inactive canonical row is authoritative; never resurrect its legacy credentials.
      const zid = canonical ?? await one(sql`SELECT store_url AS storeUrl,is_active AS active,created_at AS createdAt FROM zid_settings WHERE merchant_id=${merchantId} LIMIT 2`);
      const woo = await one(sql`SELECT store_url AS storeUrl,is_active AS active,connectionStatus AS state,created_at AS createdAt,last_sync_at AS lastSyncAt FROM woocommerce_settings WHERE merchant_id=${merchantId} LIMIT 2`);
      const shopify = await one(sql`SELECT store_url AS storeUrl,is_active AS active,created_at AS createdAt,last_sync_at AS lastSyncAt FROM platform_integrations WHERE merchant_id=${merchantId} AND platform_type='shopify' LIMIT 2`);
      const byaan = await one(sql`SELECT tenant_domain AS storeUrl,is_active AS active,sync_status AS state,verified_at AS verifiedAt,created_at AS createdAt,last_sync_at AS lastSyncAt,(sync_errors IS NOT NULL AND sync_errors <> '') AS hasErrors FROM byaan_connections WHERE merchant_id=${merchantId} LIMIT 2`);
      const records = {salla, zid, woocommerce:woo, shopify, byaan};
      const platforms: PlatformSummary[] = platformIds.map(platform => {
        const row = records[platform];
        const item: PlatformSummary = { platform, present:!!row, occupiesSlot:false, state:platform === 'shopify' ? 'unavailable' : 'unlinked', storeUrl:null, createdAt:null, lastSyncAt:null, hasSyncErrors:false, legacy:false };
        if (!row) return item;
        item.storeUrl = safePlatformUrl(row.storeUrl, platform === 'byaan'); item.createdAt = stamp(row.createdAt); item.lastSyncAt = stamp(row.lastSyncAt); item.hasSyncErrors = Boolean(row.hasErrors); item.legacy = platform === 'zid' && !canonical;
        if (platform === 'salla') {
          item.occupiesSlot = true;
          item.state = row.state === 'active' ? 'configured' : ['syncing','paused','error'].includes(row.state) ? row.state : 'unknown';
        } else if (row.active !== 0 && row.active !== 1) { item.occupiesSlot = true; item.state = 'unknown'; }
        else if (platform === 'byaan' && !row.verifiedAt) { item.occupiesSlot = true; item.state = 'pending_verification'; }
        else if (row.active === 0) item.state = 'disabled';
        else {
          item.occupiesSlot = true;
          if (platform === 'byaan') item.state = ['syncing','paused','error'].includes(row.state) ? row.state : row.state === 'active' ? 'configured' : 'unknown';
          else if (platform === 'woocommerce') item.state = row.state === 'connected' ? 'configured' : row.state === 'error' ? 'error' : 'unknown';
          else item.state = 'configured';
        }
        return item;
      });
      const product = await one(sql`SELECT COUNT(*) AS total FROM products WHERE merchantId=${merchantId} AND ${sql.raw(catalogVisibleSql())}`);
      const audience = source === 'byaan' ? await one(sql`SELECT COUNT(*) AS total FROM byaan_trainees WHERE merchant_id=${merchantId} AND status='active'`) : await one(sql`SELECT COUNT(*) AS total FROM customer_profiles WHERE merchant_id=${merchantId}`);
      const occupied = platforms.filter(p => p.occupiesSlot).length;
      return platformInventorySchema.parse({merchantId,checkedAt:now.toISOString(),source,platforms,occupied,conflict:occupied>1,stats:{products:count(product?.total),customers:count(audience?.total),audience:source==='byaan'?'trainees':'customers'}});
    }, {isolationLevel:'repeatable read',accessMode:'read only'});
  } catch { throw new PlatformSourceUnavailableError(); }
}
