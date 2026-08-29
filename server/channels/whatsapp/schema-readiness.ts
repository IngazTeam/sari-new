import {
  assertRuntimeSchema,
  type SchemaRequirement,
} from '../../db/schema-readiness';

export const WHATSAPP_PRIMARY_SCHEMA_REQUIREMENTS = [{
  table: 'whatsapp_instances',
  columns: [
    'id',
    'merchant_id',
    'provider',
    'instance_id',
    'phone_number',
    'phone_number_id',
    'webhook_token_hash',
    'active_phone_identity_hash',
    'status',
    'is_primary',
    'created_at',
  ],
  generatedColumns: [{
    name: 'active_primary_merchant_id',
    expression: "CASE WHEN status = 'active' AND is_primary = 1 THEN merchant_id ELSE NULL END",
    storage: 'virtual',
  }],
  uniqueIndexes: [{
    name: 'whatsapp_instances_active_primary_merchant_unique',
    columns: ['active_primary_merchant_id'],
  }],
  checkConstraints: [{
    name: 'whatsapp_instances_primary_requires_active_check',
    expression: "is_primary IN (0, 1) AND (is_primary = 0 OR status = 'active')",
    enforced: true,
  }],
}] as const satisfies readonly SchemaRequirement[];

export async function assertWhatsAppPrimarySchemaReady(
  feature = 'WhatsApp instance mutation',
): Promise<void> {
  await assertRuntimeSchema(feature, WHATSAPP_PRIMARY_SCHEMA_REQUIREMENTS, {
    cacheSuccess: false,
  });
}
