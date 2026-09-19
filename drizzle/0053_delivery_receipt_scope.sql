ALTER TABLE whatsapp_message_deliveries
  DROP INDEX uq_whatsapp_provider_message,
  ADD UNIQUE INDEX uq_whatsapp_provider_message
    (merchant_id, instance_id, provider, direction, provider_message_id);
