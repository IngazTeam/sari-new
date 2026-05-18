/**
 * Platform Integration Checker
 * 
 * يمنع ربط أكثر من منصة تجارة إلكترونية في نفس الوقت
 * لتجنب تضارب البيانات وتكرار الطلبات
 */

import { getPool } from '../db';

export interface ExistingPlatform {
  platform: 'salla' | 'zid' | 'woocommerce' | 'shopify' | 'byaan';
  name: string;
  storeUrl?: string;
  connectedAt?: Date | null;
}

/**
 * التحقق من وجود منصات مربوطة
 * @param merchantId معرف التاجر
 * @returns قائمة المنصات المربوطة
 */
export async function checkExistingIntegrations(merchantId: number): Promise<ExistingPlatform[]> {
  const existingPlatforms: ExistingPlatform[] = [];

  // فحص سلة (Salla) — استخدام raw SQL عبر pool لتجنب مشكلة db module-level variable
  try {
    const pool = await getPool();
    if (pool) {
      const [rows] = await pool.execute(
        `SELECT * FROM salla_connections WHERE merchant_id = ? AND sync_status = 'active' LIMIT 1`,
        [merchantId]
      );
      const sallaConnection = (rows as any[])?.[0];
      if (sallaConnection) {
        existingPlatforms.push({
          platform: 'salla',
          name: 'سلة',
          storeUrl: sallaConnection.store_url,
          connectedAt: sallaConnection.created_at,
        });
      }
    }
  } catch (error) {
    console.error('[Platform Checker] Error checking Salla:', error);
  }

  // فحص زد (Zid)
  try {
    const pool = await getPool();
    if (pool) {
      const [rows] = await pool.execute(
        `SELECT * FROM zid_settings WHERE merchant_id = ? AND is_active = 1 LIMIT 1`,
        [merchantId]
      );
      const zidSettings = (rows as any[])?.[0];
      if (zidSettings) {
        existingPlatforms.push({
          platform: 'zid',
          name: 'زد',
          storeUrl: zidSettings.store_url || undefined,
          connectedAt: zidSettings.created_at,
        });
      }
    }
  } catch (error) {
    console.error('[Platform Checker] Error checking Zid:', error);
  }

  // فحص ووكومرس (WooCommerce) — raw SQL لتجنب db module-level variable
  try {
    const pool = await getPool();
    if (pool) {
      const [rows] = await pool.execute(
        `SELECT * FROM woocommerce_settings WHERE merchant_id = ? AND is_active = 1 LIMIT 1`,
        [merchantId]
      );
      const wooSettings = (rows as any[])?.[0];
      if (wooSettings) {
        existingPlatforms.push({
          platform: 'woocommerce',
          name: 'ووكومرس',
          storeUrl: wooSettings.store_url,
          connectedAt: wooSettings.created_at,
        });
      }
    }
  } catch (error) {
    console.error('[Platform Checker] Error checking WooCommerce:', error);
  }

  // فحص بيان (Byaan)
  try {
    const { getByaanConnection } = await import('./byaan');
    const byaanConnection = await getByaanConnection(merchantId);
    if (byaanConnection && byaanConnection.sync_status === 'active') {
      existingPlatforms.push({
        platform: 'byaan',
        name: 'بيان',
        storeUrl: byaanConnection.tenant_domain,
        connectedAt: byaanConnection.created_at,
      });
    }
  } catch (error) {
    console.error('[Platform Checker] Error checking Byaan:', error);
  }

  return existingPlatforms;
}

/**
 * التحقق من إمكانية ربط منصة جديدة
 * @param merchantId معرف التاجر
 * @param platformName اسم المنصة المراد ربطها
 * @throws Error إذا كانت هناك منصة مربوطة بالفعل
 */
export async function validateNewPlatformConnection(
  merchantId: number,
  platformName: string
): Promise<void> {
  const existingPlatforms = await checkExistingIntegrations(merchantId);

  if (existingPlatforms.length > 0) {
    const connectedPlatform = existingPlatforms[0];
    throw new Error(
      `لديك منصة ${connectedPlatform.name} مربوطة بالفعل. ` +
      `يرجى فصلها أولاً قبل ربط منصة ${platformName}.`
    );
  }
}

/**
 * الحصول على معلومات المنصة المربوطة حالياً
 * @param merchantId معرف التاجر
 * @returns معلومات المنصة أو null إذا لم تكن هناك منصة مربوطة
 */
export async function getCurrentPlatform(merchantId: number): Promise<ExistingPlatform | null> {
  const existingPlatforms = await checkExistingIntegrations(merchantId);
  return existingPlatforms.length > 0 ? existingPlatforms[0] : null;
}

/**
 * الحصول على جميع المنصات المربوطة (للتحقق من الأخطاء)
 * @param merchantId معرف التاجر
 * @returns قائمة جميع المنصات المربوطة
 */
export async function getAllConnectedPlatforms(merchantId: number): Promise<ExistingPlatform[]> {
  return await checkExistingIntegrations(merchantId);
}
