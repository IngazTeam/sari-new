/**
 * Platform Integration Checker
 * 
 * يمنع ربط أكثر من منصة تجارة إلكترونية في نفس الوقت
 * لتجنب تضارب البيانات وتكرار الطلبات
 */

import { getSallaConnectionByMerchantId, getWooCommerceSettings } from '../db';

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

  // فحص سلة (Salla)
  const sallaConnection = await getSallaConnectionByMerchantId(merchantId);
  if (sallaConnection && sallaConnection.syncStatus === 'active') {
    existingPlatforms.push({
      platform: 'salla',
      name: 'سلة',
      storeUrl: sallaConnection.storeUrl,
      connectedAt: sallaConnection.createdAt,
    });
  }

  // فحص زد (Zid)
  try {
    const dbZid = await import('../db_zid');
    const zidSettings = await dbZid.getZidSettings(merchantId);
    if (zidSettings && zidSettings.isActive === 1) {
      existingPlatforms.push({
        platform: 'zid',
        name: 'زد',
        storeUrl: zidSettings.storeUrl || undefined,
        connectedAt: zidSettings.createdAt,
      });
    }
  } catch (error) {
    console.error('[Platform Checker] Error checking Zid:', error);
  }

  // فحص ووكومرس (WooCommerce)
  const wooSettings = await getWooCommerceSettings(merchantId);
  if (wooSettings && wooSettings.isActive === 1) {
    existingPlatforms.push({
      platform: 'woocommerce',
      name: 'ووكومرس',
      storeUrl: wooSettings.storeUrl,
      connectedAt: wooSettings.createdAt,
    });
  }

  // فحص شوبيفاي (Shopify) - من جدول platform_integrations
  // TODO: إضافة فحص Shopify عند توفر الدوال المناسبة
  // const shopifyIntegration = await db.getPlatformIntegration(merchantId, 'shopify');
  // if (shopifyIntegration) { ... }

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
