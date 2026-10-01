import { withKnowledgeSourceGroupsSnapshot } from './knowledge/source-groups';
import {
  dashboardSourcesSchema,
  type DashboardSources,
} from '../shared/dashboard-sources';
import { orderMinor } from '../shared/order-workspace';

/** Read only public aggregate/status columns. No schema initialization or secret decryption. */
export async function readDashboardSources(
  merchantId: number
): Promise<DashboardSources> {
  return withKnowledgeSourceGroupsSnapshot(
    merchantId,
    async (groups, connection) => {
    const rows = async (text: string, args: (string | number)[] = [merchantId]) =>
        (await connection.execute<any[]>(text, args))[0];
      const [merchant] = await rows(
        'SELECT id,integration_source FROM merchants WHERE id=?'
      );
      if (!merchant || Number(merchant.id) !== merchantId)
        throw Error('Source scope unavailable');
      const rawSource = String(merchant.integration_source || 'none');
      const source: DashboardSources['integration']['source'] = [
        'none',
        'byaan',
        'salla',
        'zid',
        'woocommerce',
        'shopify',
        'calendly',
      ].includes(rawSource)
        ? (rawSource as DashboardSources['integration']['source'])
        : 'unknown';
      const [audience] = await rows(
        source === 'byaan'
          ? "SELECT COUNT(*) AS total FROM byaan_trainees WHERE merchant_id=? AND status='active'"
          : 'SELECT COUNT(*) AS total FROM customer_profiles WHERE merchant_id=?'
      );
      const total = orderMinor(audience?.total);
      if (total === null) throw Error('Invalid audience aggregate');
      let state: DashboardSources['integration']['state'] =
        source === 'none' ? 'not_connected' : 'unavailable';
      let records: DashboardSources['integration']['records'] = [];
      const date = (value: unknown) =>
        value instanceof Date && Number.isFinite(value.getTime())
          ? value.toISOString()
          : null;
      const status = (
        value: unknown
      ): DashboardSources['integration']['state'] =>
        value === 'active'
          ? 'configured'
          : ['syncing', 'error', 'paused', 'pending_verification'].includes(
                String(value)
              )
            ? (value as DashboardSources['integration']['state'])
            : 'unavailable';
      if (source === 'byaan' || source === 'salla') {
        const data = await rows(
          source === 'byaan'
            ? 'SELECT sync_status AS state,last_sync_at AS synced,is_active AS enabled FROM byaan_connections WHERE merchant_id=? LIMIT 2'
            : 'SELECT syncStatus AS state,lastSyncAt AS synced,1 AS enabled FROM salla_connections WHERE merchantId=? LIMIT 2'
        );
        if (data.length > 1) throw Error('Ambiguous integration');
        if (!data.length) state = 'not_connected';
        else {
          state = status(data[0].state);
          if (state === 'configured' && Number(data[0].enabled) !== 1)
            state = 'paused';
          records = [{ scope: 'all', at: date(data[0].synced) }];
        }
      } else if (source === 'zid') {
        const data = await rows(
          'SELECT is_active AS enabled,last_product_sync,last_order_sync,last_customer_sync FROM zid_settings WHERE merchant_id=? LIMIT 2'
        );
        if (data.length > 1) throw Error('Ambiguous integration');
        if (!data.length) state = 'not_connected';
        else {
          state = Number(data[0].enabled) === 1 ? 'configured' : 'paused';
          records = [
            { scope: 'products', at: date(data[0].last_product_sync) },
            { scope: 'orders', at: date(data[0].last_order_sync) },
            { scope: 'customers', at: date(data[0].last_customer_sync) },
          ];
        }
      } else if (['woocommerce', 'shopify', 'calendly'].includes(source)) {
        const data = await rows(
          'SELECT is_active AS enabled,last_sync_at AS synced FROM platform_integrations WHERE merchant_id=? AND platform_type=? LIMIT 2',
          [merchantId, source]
        );
        if (data.length > 1) throw Error('Ambiguous integration');
        if (!data.length) state = 'not_connected';
        else {
          state = Number(data[0].enabled) === 1 ? 'configured' : 'paused';
          records = [{ scope: 'all', at: date(data[0].synced) }];
        }
      }
      return dashboardSourcesSchema.parse({
        version: 1,
        merchantId,
        checkedAt: new Date().toISOString(),
        groups,
        audience: {
          kind: source === 'byaan' ? 'trainees' : 'customers',
          count: total,
        },
        integration: { source, state, records },
      });
    }
  );
}
