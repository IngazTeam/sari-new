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
  generatedColumns: ['active_primary_merchant_id'],
  uniqueIndexes: ['whatsapp_instances_active_primary_merchant_unique'],
  checkConstraints: ['whatsapp_instances_primary_requires_active_check'],
}] as const satisfies readonly SchemaRequirement[];

export async function assertWhatsAppPrimarySchemaReady(
  feature = 'WhatsApp instance mutation',
): Promise<void> {
  await assertRuntimeSchema(feature, WHATSAPP_PRIMARY_SCHEMA_REQUIREMENTS);
}
