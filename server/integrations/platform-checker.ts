/**
 * Platform Integration Checker
 * 
 * يمنع ربط أكثر من منصة تجارة إلكترونية في نفس الوقت
 * لتجنب تضارب البيانات وتكرار الطلبات
 * 
 * Uses Drizzle ORM for every platform to prevent column-name drift.
 */

import { getDb, getWooCommerceSettings } from '../db';
import { platformIntegrations, sallaConnections, zidSettings } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

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

  // ═══════════════════════════════════════════
  // سلة (Salla) — Drizzle ORM (type-safe)
  // ═══════════════════════════════════════════
  try {
    const db = await getDb();
    const [sallaConnection] = await db!
      .select()
      .from(sallaConnections)
      .where(
        and(
          eq(sallaConnections.merchantId, merchantId),
          eq(sallaConnections.syncStatus, 'active')
        )
      )
      .limit(1);

    if (sallaConnection) {
      existingPlatforms.push({
        platform: 'salla',
        name: 'سلة',
        storeUrl: sallaConnection.storeUrl,
        connectedAt: sallaConnection.createdAt ? new Date(sallaConnection.createdAt) : null,
      });
    }
  } catch (error) {
    console.error('[Platform Checker] Error checking Salla:', error);
  }

  // ═══════════════════════════════════════════
  // زد (Zid) — canonical platform integration with a legacy fallback
  // ═══════════════════════════════════════════
  try {
    const db = await getDb();
    const [canonicalZid] = await db!
      .select()
      .from(platformIntegrations)
      .where(and(
        eq(platformIntegrations.merchantId, merchantId),
        eq(platformIntegrations.platformType, 'zid'),
        eq(platformIntegrations.isActive, 1),
      ))
      .limit(1);
    const [legacyZid] = canonicalZid ? [] : await db!
      .select()
      .from(zidSettings)
      .where(and(
        eq(zidSettings.merchantId, merchantId),
        eq(zidSettings.isActive, 1),
      ))
      .limit(1);
    const zid = canonicalZid || legacyZid;
    if (zid) {
      existingPlatforms.push({
        platform: 'zid',
        name: 'زد',
        storeUrl: zid.storeUrl || undefined,
        connectedAt: zid.createdAt ? new Date(zid.createdAt) : null,
      });
    }
  } catch {
    console.error('[Platform Checker] Zid check failed');
  }

  // ═══════════════════════════════════════════
  // ووكومرس (WooCommerce) — Drizzle via db function
  // ═══════════════════════════════════════════
  try {
    const wooSettings = await getWooCommerceSettings(merchantId);
    if (wooSettings && wooSettings.isActive === 1) {
      existingPlatforms.push({
        platform: 'woocommerce',
        name: 'ووكومرس',
        storeUrl: wooSettings.storeUrl || undefined,
        connectedAt: wooSettings.createdAt ? new Date(wooSettings.createdAt) : null,
      });
    }
  } catch (error) {
    console.error('[Platform Checker] Error checking WooCommerce:', error);
  }

  // ═══════════════════════════════════════════
  // بيان (Byaan) — via integration module
  // ═══════════════════════════════════════════
  try {
    const { getByaanConnection } = await import('./byaan');
    const byaanConnection = await getByaanConnection(merchantId);
    if (byaanConnection && byaanConnection.sync_status === 'active' && byaanConnection.is_active && byaanConnection.verified_at) {
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
