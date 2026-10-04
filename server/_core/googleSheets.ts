/**
 * Google Sheets API Integration
 * يوفر دوال للتعامل مع Google Sheets API
 */

import { google } from './google-api-clients';
import { makeSheetIntent, verifySheetAppend, type SheetEvidenceHooks } from '../integrations/salla-sheet-evidence';
import {
  getGoogleIntegration,
  getGoogleOAuthSettings,
  updateGoogleIntegration,
} from '../db';

import { buildPublicUrl } from '../utils/public-url';

/**
 * إنشاء OAuth2 client
 */
async function createOAuth2Client() {
  // قراءة Credentials من قاعدة البيانات
  const settings = await getGoogleOAuthSettings();
  
  if (!settings || !settings.clientId || !settings.clientSecret) {
    throw new Error('Google OAuth credentials not configured in admin settings');
  }
  
  if (settings.isEnabled !== 1) {
    throw new Error('Google OAuth is currently disabled');
  }

  const redirectUri = buildPublicUrl('/api/auth/oauth/google/sheets/callback');
  return new google.auth.OAuth2(settings.clientId, settings.clientSecret, redirectUri);
}

/**
 * الحصول على OAuth2 client مع credentials محفوظة
 */
async function getAuthenticatedClient(merchantId: number, redactErrors=false) {
  try {
    const integration = await getGoogleIntegration(merchantId, 'sheets');
    
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
      await updateGoogleIntegration(integration.id, {
        credentials: JSON.stringify(newCredentials),
      });
    }

    return oauth2Client;
  } catch (error) {
    console.error('[Google Sheets] Error getting authenticated client:', redactErrors ? 'authentication unavailable' : error);
    return null;
  }
}

/**
 * إضافة صفحة جديدة (Sheet) إلى Spreadsheet
 */
export async function addSheet(
  merchantId: number,
  spreadsheetId: string,
  sheetTitle: string,
  options?: {redactErrors:true}
): Promise<{ success: boolean; sheetId?: number; message: string }> {
  try {
    const auth = await getAuthenticatedClient(merchantId,Boolean(options?.redactErrors));
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
    console.error('[Google Sheets] Error adding sheet:', options?.redactErrors ? 'unconfirmed' : error);
    return {
      success: false,
      message: options?.redactErrors ? 'تعذر تأكيد إضافة Sheet' : error.message || 'فشل إضافة Sheet',
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
  values: any[][],
  options?: {raw:true}
): Promise<{ success: boolean; message: string }> {
  try {
    const auth = await getAuthenticatedClient(merchantId,Boolean(options?.raw));
    if (!auth) {
      return { success: false, message: 'Google Sheets غير مربوط' };
    }

    const sheets = google.sheets({ version: 'v4', auth });
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: options?.raw ? 'RAW' : 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    return {
      success: true,
      message: 'تم كتابة البيانات بنجاح',
    };
  } catch (error: any) {
    console.error('[Google Sheets] Error writing to sheet:', options?.raw ? 'unconfirmed' : error);
    return {
      success: false,
      message: options?.raw ? 'تعذر تأكيد كتابة البيانات' : error.message || 'فشل كتابة البيانات',
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
  values: any[][],
  options?: { beforeSend: () => Promise<void>; raw: true;
    evidence?: SheetEvidenceHooks & { integrationId:number } }
): Promise<{ success: boolean; message: string }> {
  try {
    const auth = await getAuthenticatedClient(merchantId,Boolean(options?.raw));
    if (!auth) {
      return { success: false, message: 'Google Sheets غير مربوط' };
    }

    if(options?.evidence) {
      const intent=makeSheetIntent(options.evidence.integrationId,spreadsheetId,range,values);
      // Refresh authentication before acquiring the durable dispatch marker.
      // A single fetch avoids implicit SDK auth/transport retries after append.
      const {token}=await auth.getAccessToken();
      if(!token)throw Error('Sheets authentication unavailable');
      const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`);
      url.search=new URLSearchParams({valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',includeValuesInResponse:'true',responseValueRenderOption:'UNFORMATTED_VALUE'}).toString();
      const body=JSON.stringify({majorDimension:'ROWS',values});
      await options.beforeSend();
      await options.evidence.prepare(intent);
      const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body});
      if(!response.ok||!response.body) {
        await response.body?.cancel().catch(()=>{});
        throw Error('Sheets append unconfirmed');
      }
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      try {
        for(;;) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
          if(size>2000000)throw Error('Sheets response too large');chunks.push(value);}
      } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
      const receipt=verifySheetAppend(JSON.parse(Buffer.concat(chunks).toString('utf8')),intent,spreadsheetId,values);
      await options.evidence.accept(receipt);
    } else {
      const sheets = google.sheets({ version: 'v4', auth });
      await options?.beforeSend();
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: options?.raw ? 'RAW' : 'USER_ENTERED',
        requestBody: { values },
      });
    }

    return {
      success: true,
      message: 'تم إضافة البيانات بنجاح',
    };
  } catch (error: any) {
    console.error('[Google Sheets] Error appending to sheet:', options?.raw ? 'append unconfirmed' : error);
    return {
      success: false,
      message: options?.raw ? 'تعذر تأكيد إضافة البيانات' : error.message || 'فشل إضافة البيانات',
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
