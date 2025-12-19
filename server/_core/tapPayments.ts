/**
 * Tap Payments Integration Module
 * 
 * يوفر هذا الملف التكامل الكامل مع Tap Payments API
 * للتعامل مع المدفوعات، إنشاء روابط الدفع، والتحقق من حالة المعاملات
 */

import { ENV } from "./env";

// ============================================
// Types & Interfaces
// ============================================

export interface TapCustomer {
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: {
    country_code: string;
    number: string;
  };
}

export interface TapCharge {
  amount: number;
  currency: string;
  customer: TapCustomer;
  source: {
    id: string;
  };
  redirect: {
    url: string;
  };
  post?: {
    url: string;
  };
  description?: string;
  metadata?: {
    udf1?: string;
    udf2?: string;
    udf3?: string;
    [key: string]: any;
  };
  receipt?: {
    email: boolean;
    sms: boolean;
  };
  reference?: {
    transaction?: string;
    order?: string;
  };
}

export interface TapChargeResponse {
  id: string;
  object: string;
  live_mode: boolean;
  amount: number;
  currency: string;
  status: 'INITIATED' | 'ABANDONED' | 'CANCELLED' | 'FAILED' | 'DECLINED' | 'RESTRICTED' | 'CAPTURED' | 'AUTHORIZED';
  threeDSecure: boolean;
  transaction: {
    timezone: string;
    created: string;
    url: string;
    expiry: {
      period: number;
      type: string;
    };
    asynchronous: boolean;
    amount: number;
    currency: string;
  };
  response: {
    code: string;
    message: string;
  };
  receipt: {
    email: boolean;
    sms: boolean;
  };
  customer: {
    first_name: string;
    last_name: string;
    email: string;
    phone: {
      country_code: string;
      number: string;
    };
  };
  source: {
    object: string;
    id: string;
  };
  redirect: {
    status: string;
    url: string;
  };
  post?: {
    url: string;
  };
  metadata?: {
    udf1?: string;
    udf2?: string;
    udf3?: string;
    [key: string]: any;
  };
  reference?: {
    transaction?: string;
    order?: string;
  };
}

export interface TapRefund {
  charge_id: string;
  amount: number;
  currency: string;
  reason?: string;
  metadata?: {
    [key: string]: any;
  };
  post?: {
    url: string;
  };
}

export interface TapRefundResponse {
  id: string;
  object: string;
  live_mode: boolean;
  amount: number;
  currency: string;
  charge: string;
  status: 'PENDING' | 'CAPTURED' | 'FAILED';
  created: string;
  metadata?: {
    [key: string]: any;
  };
}

// ============================================
// Configuration
// ============================================

const TAP_API_BASE_URL = 'https://api.tap.company/v2';
const TAP_SECRET_KEY = ENV.tapSecretKey;
const TAP_PUBLIC_KEY = ENV.tapPublicKey;

if (!TAP_SECRET_KEY) {
  console.warn('⚠️ TAP_SECRET_KEY is not configured. Payment features will not work.');
}

// ============================================
// Helper Functions
// ============================================

/**
 * إرسال طلب إلى Tap API
 */
async function tapRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any
): Promise<T> {
  if (!TAP_SECRET_KEY) {
    throw new Error('Tap Payments is not configured. Please set TAP_SECRET_KEY in environment variables.');
  }

  const url = `${TAP_API_BASE_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${TAP_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Tap API Error: ${response.status} - ${errorData.message || response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Tap API Request Failed:', error);
    throw error;
  }
}

// ============================================
// Core Payment Functions
// ============================================

/**
 * إنشاء معاملة دفع جديدة (Charge)
 * 
 * @param params - معلومات المعاملة
 * @returns معلومات المعاملة ورابط الدفع
 */
export async function createCharge(params: {
  amount: number; // المبلغ بالهللات (cents)
  currency?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  description?: string;
  orderId?: number;
  bookingId?: number;
  redirectUrl: string;
  webhookUrl?: string;
  metadata?: Record<string, any>;
}): Promise<TapChargeResponse> {
  const {
    amount,
    currency = 'SAR',
    customerName,
    customerEmail,
    customerPhone,
    description,
    orderId,
    bookingId,
    redirectUrl,
    webhookUrl,
    metadata = {},
  } = params;

  // تقسيم الاسم إلى first_name و last_name
  const nameParts = customerName.trim().split(' ');
  const firstName = nameParts[0] || 'Customer';
  const lastName = nameParts.slice(1).join(' ') || '';

  // تنظيف رقم الهاتف
  let phoneNumber = customerPhone.replace(/\D/g, '');
  let countryCode = '966'; // السعودية افتراضياً
  
  if (phoneNumber.startsWith('966')) {
    phoneNumber = phoneNumber.substring(3);
  } else if (phoneNumber.startsWith('0')) {
    phoneNumber = phoneNumber.substring(1);
  }

  const chargeData: TapCharge = {
    amount,
    currency,
    customer: {
      first_name: firstName,
      last_name: lastName,
      email: customerEmail,
      phone: {
        country_code: countryCode,
        number: phoneNumber,
      },
    },
    source: {
      id: 'src_all', // قبول جميع طرق الدفع
    },
    redirect: {
      url: redirectUrl,
    },
    description: description || `Payment for ${orderId ? `Order #${orderId}` : bookingId ? `Booking #${bookingId}` : 'Service'}`,
    metadata: {
      ...metadata,
      orderId: orderId?.toString(),
      bookingId: bookingId?.toString(),
    },
    receipt: {
      email: !!customerEmail,
      sms: true,
    },
  };

  // إضافة webhook URL إذا تم توفيره
  if (webhookUrl) {
    chargeData.post = {
      url: webhookUrl,
    };
  }

  // إضافة reference للطلب
  if (orderId || bookingId) {
    chargeData.reference = {
      transaction: `txn_${Date.now()}`,
      order: orderId ? `order_${orderId}` : `booking_${bookingId}`,
    };
  }

  return await tapRequest<TapChargeResponse>('/charges', 'POST', chargeData);
}

/**
 * الحصول على تفاصيل معاملة دفع
 * 
 * @param chargeId - معرف المعاملة من Tap
 * @returns تفاصيل المعاملة
 */
export async function getCharge(chargeId: string): Promise<TapChargeResponse> {
  return await tapRequest<TapChargeResponse>(`/charges/${chargeId}`, 'GET');
}

/**
 * التحقق من حالة الدفع
 * 
 * @param chargeId - معرف المعاملة
 * @returns حالة الدفع
 */
export async function verifyPayment(chargeId: string): Promise<{
  success: boolean;
  status: string;
  amount: number;
  currency: string;
  charge: TapChargeResponse;
}> {
  const charge = await getCharge(chargeId);
  
  return {
    success: charge.status === 'CAPTURED' || charge.status === 'AUTHORIZED',
    status: charge.status,
    amount: charge.amount,
    currency: charge.currency,
    charge,
  };
}

/**
 * إنشاء عملية استرجاع (Refund)
 * 
 * @param params - معلومات الاسترجاع
 * @returns تفاصيل عملية الاسترجاع
 */
export async function createRefund(params: {
  chargeId: string;
  amount: number; // المبلغ بالهللات
  currency?: string;
  reason?: string;
  metadata?: Record<string, any>;
  webhookUrl?: string;
}): Promise<TapRefundResponse> {
  const {
    chargeId,
    amount,
    currency = 'SAR',
    reason,
    metadata,
    webhookUrl,
  } = params;

  const refundData: TapRefund = {
    charge_id: chargeId,
    amount,
    currency,
    reason,
    metadata,
  };

  if (webhookUrl) {
    refundData.post = {
      url: webhookUrl,
    };
  }

  return await tapRequest<TapRefundResponse>('/refunds', 'POST', refundData);
}

/**
 * الحصول على تفاصيل عملية استرجاع
 * 
 * @param refundId - معرف عملية الاسترجاع
 * @returns تفاصيل الاسترجاع
 */
export async function getRefund(refundId: string): Promise<TapRefundResponse> {
  return await tapRequest<TapRefundResponse>(`/refunds/${refundId}`, 'GET');
}

// ============================================
// Webhook Handling
// ============================================

/**
 * معالجة webhook من Tap Payments
 * 
 * @param webhookData - البيانات الواردة من Tap
 * @returns معلومات المعاملة المحدثة
 */
export function processWebhook(webhookData: any): {
  chargeId: string;
  status: string;
  amount: number;
  currency: string;
  metadata?: Record<string, any>;
  orderId?: string;
  bookingId?: string;
} {
  const { id, status, amount, currency, metadata } = webhookData;

  return {
    chargeId: id,
    status,
    amount,
    currency,
    metadata,
    orderId: metadata?.orderId,
    bookingId: metadata?.bookingId,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * تحويل المبلغ من ريال إلى هللات
 */
export function toHalalas(amountInSAR: number): number {
  return Math.round(amountInSAR * 100);
}

/**
 * تحويل المبلغ من هللات إلى ريال
 */
export function fromHalalas(amountInHalalas: number): number {
  return amountInHalalas / 100;
}

/**
 * تنسيق المبلغ للعرض
 */
export function formatAmount(amountInHalalas: number, currency: string = 'SAR'): string {
  const amount = fromHalalas(amountInHalalas);
  return `${amount.toFixed(2)} ${currency}`;
}

/**
 * الحصول على Public Key للاستخدام في Frontend
 */
export function getPublicKey(): string {
  return TAP_PUBLIC_KEY || '';
}

/**
 * التحقق من صحة إعدادات Tap
 */
export function isConfigured(): boolean {
  return !!TAP_SECRET_KEY && !!TAP_PUBLIC_KEY;
}
