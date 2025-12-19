/**
 * Google Sheets API Integration
 * يوفر دوال للتعامل مع Google Sheets API
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as db from '../db';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * إنشاء OAuth2 client
 */
async function createOAuth2Client(): Promise<OAuth2Client> {
  // قراءة Credentials من قاعدة البيانات
  const settings = await db.getGoogleOAuthSettings();
  
  if (!settings || !settings.clientId || !settings.clientSecret) {
    throw new Error('Google OAuth credentials not configured in admin settings');
  }
  
  if (settings.isEnabled !== 1) {
    throw new Error('Google OAuth is currently disabled');
  }

  const redirectUri = `${process.env.VITE_APP_URL || 'http://localhost:3000'}/api/oauth/google/sheets/callback`;
  return new google.auth.OAuth2(settings.clientId, settings.clientSecret, redirectUri);
}

/**
 * الحصول على رابط التفويض
 */
export async function getAuthorizationUrl(merchantId: number): Promise<string> {
  const oauth2Client = await createOAuth2Client();
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: merchantId.toString(), // لتتبع التاجر
    prompt: 'consent', // لضمان الحصول على refresh token
  });

  return authUrl;
}

/**
 * معالجة OAuth callback والحصول على credentials
 */
export async function handleOAuthCallback(
  code: string,
  merchantId: number
): Promise<{ success: boolean; message: string }> {
  try {
    const oauth2Client = await createOAuth2Client();
    
    // تبديل الكود بـ tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // حفظ credentials في قاعدة البيانات (مشفرة)
    const credentialsJson = JSON.stringify(tokens);
    
    // التحقق من وجود integration سابق
    const existing = await db.getGoogleIntegration(merchantId, 'sheets');
    
    if (existing) {
      // تحديث credentials
      await db.updateGoogleIntegration(existing.id, {
        credentials: credentialsJson,
        isActive: 1,
      });
    } else {
      // إنشاء integration جديد
      await db.createGoogleIntegration({
        merchantId,
        integrationType: 'sheets',
        credentials: credentialsJson,
        isActive: 1,
      });
    }

    console.log('[Google Sheets] OAuth completed for merchant:', merchantId);
    
    return {
      success: true,
      message: 'تم ربط Google Sheets بنجاح',
    };
  } catch (error: any) {
    console.error('[Google Sheets] OAuth error:', error);
    return {
      success: false,
      message: error.message || 'فشل ربط Google Sheets',
    };
  }
}

/**
 * الحصول على OAuth2 client مع credentials محفوظة
 */
async function getAuthenticatedClient(merchantId: number): Promise<OAuth2Client | null> {
  try {
    const integration = await db.getGoogleIntegration(merchantId, 'sheets');
    
    if (!integration || !integration.credentials) {
      return null;
    }

    const oauth2Client = await createOAuth2Client();
    const credentials = JSON.parse(integration.credentials);
    oauth2Client.setCredentials(credentials);

    // التحقق من صلاحية الـ token وتجديده إذا لزم الأمر
    if (credentials.expiry_date && credentials.expiry_date < Date.now()) {
      console.log('[Google Sheets] Refreshing access token');
      const { credentials: newCredentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(newCredentials);
      
      // حفظ الـ credentials الجديدة
      await db.updateGoogleIntegration(integration.id, {
        credentials: JSON.stringify(newCredentials),
      });
    }

    return oauth2Client;
  } catch (error) {
    console.error('[Google Sheets] Error getting authenticated client:', error);
    return null;
  }
}

/**
 * إنشاء Spreadsheet جديد
 */
export async function createSpreadsheet(
  merchantId: number,
  title: string
): Promise<{ success: boolean; spreadsheetId?: string; message: string }> {
  try {
    const auth = await getAuthenticatedClient(merchantId);
    if (!auth) {
      return { success: false, message: 'Google Sheets غير مربوط' };
    }

    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title,
        },
      },
    });

    const spreadsheetId = response.data.spreadsheetId;
    
    if (!spreadsheetId) {
      return { success: false, message: 'فشل إنشاء Spreadsheet' };
    }

    // حفظ spreadsheet ID
    const integration = await db.getGoogleIntegration(merchantId, 'sheets');
    if (integration) {
      await db.updateGoogleIntegration(integration.id, {
        sheetId: spreadsheetId,
      });
    }

    console.log('[Google Sheets] Created spreadsheet:', spreadsheetId);

    return {
      success: true,
      spreadsheetId,
      message: 'تم إنشاء Spreadsheet بنجاح',
    };
  } catch (error: any) {
    console.error('[Google Sheets] Error creating spreadsheet:', error);
    return {
      success: false,
      message: error.message || 'فشل إنشاء Spreadsheet',
    };
  }
}

/**
 * إضافة صفحة جديدة (Sheet) إلى Spreadsheet
 */
export async function addSheet(
  merchantId: number,
  spreadsheetId: string,
  sheetTitle: string
): Promise<{ success: boolean; sheetId?: number; message: string }> {
  try {
    const auth = await getAuthenticatedClient(merchantId);
    if (!auth) {
      return { success: false, message: 'Google Sheets غير مربوط' };
    }

    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetTitle,
              },
            },
          },
        ],
      },
    });

    const sheetId = response.data.replies?.[0]?.addSheet?.properties?.sheetId;

    return {
      success: true,
      sheetId: sheetId ?? undefined,
      message: 'تم إضافة Sheet بنجاح',
    };
  } catch (error: any) {
    console.error('[Google Sheets] Error adding sheet:', error);
    return {
      success: false,
      message: error.message || 'فشل إضافة Sheet',
    };
  }
}

/**
 * كتابة بيانات إلى Sheet
 */
export async function writeToSheet(
  merchantId: number,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<{ success: boolean; message: string }> {
  try {
    const auth = await getAuthenticatedClient(merchantId);
    if (!auth) {
      return { success: false, message: 'Google Sheets غير مربوط' };
    }

    const sheets = google.sheets({ version: 'v4', auth });
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    return {
      success: true,
      message: 'تم كتابة البيانات بنجاح',
    };
  } catch (error: any) {
    console.error('[Google Sheets] Error writing to sheet:', error);
    return {
      success: false,
      message: error.message || 'فشل كتابة البيانات',
    };
  }
}

/**
 * إضافة صف جديد إلى Sheet
 */
export async function appendToSheet(
  merchantId: number,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<{ success: boolean; message: string }> {
  try {
    const auth = await getAuthenticatedClient(merchantId);
    if (!auth) {
      return { success: false, message: 'Google Sheets غير مربوط' };
    }

    const sheets = google.sheets({ version: 'v4', auth });
    
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    return {
      success: true,
      message: 'تم إضافة البيانات بنجاح',
    };
  } catch (error: any) {
    console.error('[Google Sheets] Error appending to sheet:', error);
    return {
      success: false,
      message: error.message || 'فشل إضافة البيانات',
    };
  }
}

/**
 * قراءة بيانات من Sheet
 */
export async function readFromSheet(
  merchantId: number,
  spreadsheetId: string,
  range: string
): Promise<{ success: boolean; values?: any[][]; message: string }> {
  try {
    const auth = await getAuthenticatedClient(merchantId);
    if (!auth) {
      return { success: false, message: 'Google Sheets غير مربوط' };
    }

    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return {
      success: true,
      values: response.data.values || [],
      message: 'تم قراءة البيانات بنجاح',
    };
  } catch (error: any) {
    console.error('[Google Sheets] Error reading from sheet:', error);
    return {
      success: false,
      message: error.message || 'فشل قراءة البيانات',
    };
  }
}

/**
 * حذف صفوف من Sheet
 */
export async function deleteRows(
  merchantId: number,
  spreadsheetId: string,
  sheetId: number,
  startIndex: number,
  endIndex: number
): Promise<{ success: boolean; message: string }> {
  try {
    const auth = await getAuthenticatedClient(merchantId);
    if (!auth) {
      return { success: false, message: 'Google Sheets غير مربوط' };
    }

    const sheets = google.sheets({ version: 'v4', auth });
    
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex,
                endIndex,
              },
            },
          },
        ],
      },
    });

    return {
      success: true,
      message: 'تم حذف الصفوف بنجاح',
    };
  } catch (error: any) {
    console.error('[Google Sheets] Error deleting rows:', error);
    return {
      success: false,
      message: error.message || 'فشل حذف الصفوف',
    };
  }
}

/**
 * فصل الاتصال بـ Google Sheets
 */
export async function disconnect(merchantId: number): Promise<{ success: boolean; message: string }> {
  try {
    const integration = await db.getGoogleIntegration(merchantId, 'sheets');
    
    if (!integration) {
      return { success: false, message: 'لا يوجد اتصال بـ Google Sheets' };
    }

    await db.updateGoogleIntegration(integration.id, {
      isActive: 0,
      credentials: null,
    });

    console.log('[Google Sheets] Disconnected for merchant:', merchantId);

    return {
      success: true,
      message: 'تم فصل الاتصال بنجاح',
    };
  } catch (error: any) {
    console.error('[Google Sheets] Error disconnecting:', error);
    return {
      success: false,
      message: error.message || 'فشل فصل الاتصال',
    };
  }
}

/**
 * الحصول على حالة الاتصال
 */
export async function getConnectionStatus(merchantId: number): Promise<{
  isConnected: boolean;
  spreadsheetId?: string;
  lastSync?: Date;
}> {
  try {
    const integration = await db.getGoogleIntegration(merchantId, 'sheets');
    
    if (!integration || !integration.isActive) {
      return { isConnected: false };
    }

    return {
      isConnected: true,
      spreadsheetId: integration.sheetId || undefined,
      lastSync: integration.lastSync ? new Date(integration.lastSync) : undefined,
    };
  } catch (error) {
    console.error('[Google Sheets] Error getting connection status:', error);
    return { isConnected: false };
  }
}
