/**
 * Google Analytics 4 Service — REST API (no SDK dependency)
 * Uses GA4 Data API v1beta via direct HTTP calls with Service Account JWT auth
 */

import { sign } from 'jsonwebtoken';

// ===================== Types =====================

interface GACredentials {
  propertyId: string;
  serviceAccountJson: string;
}

interface GAOverviewStats {
  totalUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  avgSessionDuration: number; // seconds
  bounceRate: number; // percentage
}

interface GATrafficRow {
  date: string;
  users: number;
  sessions: number;
  pageViews: number;
}

interface GASourceRow {
  source: string;
  users: number;
  sessions: number;
}

interface GADeviceRow {
  device: string;
  users: number;
  percentage: number;
}

interface GACountryRow {
  country: string;
  users: number;
  sessions: number;
}

interface GAPageRow {
  page: string;
  pageViews: number;
  avgTime: number;
}

// ===================== Token Cache =====================

let _tokenCache: { token: string; expiry: number } | null = null;

// GA-02 FIX: Validate property ID is strictly numeric
function validatePropertyId(id: string): void {
  if (!/^\d{1,15}$/.test(id)) {
    throw new Error("Invalid Property ID format");
  }
}

// GA-04 FIX: Timeout wrapper for fetch
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  // Check cached token
  if (_tokenCache && Date.now() < _tokenCache.expiry - 60_000) {
    return _tokenCache.token;
  }

  // GA-03 FIX: Safe JSON parse with clear error
  let sa: { client_email: string; private_key: string };
  try {
    sa = JSON.parse(serviceAccountJson);
    if (!sa.client_email || !sa.private_key) {
      throw new Error("missing required fields");
    }
  } catch (e) {
    throw new Error("Service Account JSON غير صالح");
  }

  const now = Math.floor(Date.now() / 1000);

  const jwt = sign(
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
    { algorithm: 'RS256' }
  );

  // GA-04 FIX: Use fetchWithTimeout
  const tokenRes = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    // GA-01 FIX: Don't expose raw Google error to caller
    const statusCode = tokenRes.status;
    console.error(`[GA] Token exchange failed: ${statusCode}`);
    throw new Error(`فشل مصادقة Google (${statusCode})`);
  }

  const tokenData = await tokenRes.json();
  _tokenCache = {
    token: tokenData.access_token,
    expiry: Date.now() + (tokenData.expires_in || 3600) * 1000,
  };
  return _tokenCache.token;
}

// ===================== GA4 Data API =====================

const GA4_API = 'https://analyticsdata.googleapis.com/v1beta';

async function runReport(
  credentials: GACredentials,
  body: Record<string, any>
): Promise<any> {
  // GA-02 FIX: Validate property ID
  validatePropertyId(credentials.propertyId);

  const token = await getAccessToken(credentials.serviceAccountJson);
  const url = `${GA4_API}/properties/${credentials.propertyId}:runReport`;

  // GA-04 FIX: Use fetchWithTimeout
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // GA-01 FIX: Log internally, return safe message
    const statusCode = res.status;
    console.error(`[GA] Report API failed: ${statusCode}`);
    throw new Error(`فشل جلب البيانات من Google Analytics (${statusCode})`);
  }

  return res.json();
}

// ===================== Report Helpers =====================

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

// ===================== Public API =====================

/** Overview KPI stats */
export async function getOverviewStats(
  credentials: GACredentials,
  days: number = 30
): Promise<GAOverviewStats> {
  const data = await runReport(credentials, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'averageSessionDuration' },
      { name: 'bounceRate' },
    ],
  });

  const row = data.rows?.[0];
  const vals = row?.metricValues || [];
  return {
    totalUsers: parseInt(vals[0]?.value || '0'),
    newUsers: parseInt(vals[1]?.value || '0'),
    sessions: parseInt(vals[2]?.value || '0'),
    pageViews: parseInt(vals[3]?.value || '0'),
    avgSessionDuration: parseFloat(vals[4]?.value || '0'),
    bounceRate: parseFloat(vals[5]?.value || '0') * 100,
  };
}

/** Daily traffic data for charts */
export async function getTrafficByDate(
  credentials: GACredentials,
  days: number = 30
): Promise<GATrafficRow[]> {
  const data = await runReport(credentials, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' },
      { name: 'screenPageViews' },
    ],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  });

  return (data.rows || []).map((row: any) => {
    const dateStr = row.dimensionValues[0].value; // YYYYMMDD
    return {
      date: `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
      users: parseInt(row.metricValues[0].value || '0'),
      sessions: parseInt(row.metricValues[1].value || '0'),
      pageViews: parseInt(row.metricValues[2].value || '0'),
    };
  });
}

/** Traffic sources (organic, direct, social, referral) */
export async function getTrafficSources(
  credentials: GACredentials,
  days: number = 30
): Promise<GASourceRow[]> {
  const data = await runReport(credentials, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' },
    ],
    orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
    limit: 10,
  });

  return (data.rows || []).map((row: any) => ({
    source: row.dimensionValues[0].value,
    users: parseInt(row.metricValues[0].value || '0'),
    sessions: parseInt(row.metricValues[1].value || '0'),
  }));
}

/** Device breakdown */
export async function getDeviceBreakdown(
  credentials: GACredentials,
  days: number = 30
): Promise<GADeviceRow[]> {
  const data = await runReport(credentials, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [{ name: 'totalUsers' }],
  });

  const rows = (data.rows || []).map((row: any) => ({
    device: row.dimensionValues[0].value,
    users: parseInt(row.metricValues[0].value || '0'),
    percentage: 0,
  }));

  const total = rows.reduce((s: number, r: GADeviceRow) => s + r.users, 0) || 1;
  rows.forEach((r: GADeviceRow) => { r.percentage = Math.round((r.users / total) * 100); });
  return rows;
}

/** Top countries */
export async function getTopCountries(
  credentials: GACredentials,
  days: number = 30
): Promise<GACountryRow[]> {
  const data = await runReport(credentials, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'country' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' },
    ],
    orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
    limit: 10,
  });

  return (data.rows || []).map((row: any) => ({
    country: row.dimensionValues[0].value,
    users: parseInt(row.metricValues[0].value || '0'),
    sessions: parseInt(row.metricValues[1].value || '0'),
  }));
}

/** Top pages */
export async function getTopPages(
  credentials: GACredentials,
  days: number = 30
): Promise<GAPageRow[]> {
  const data = await runReport(credentials, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'averageSessionDuration' },
    ],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 10,
  });

  return (data.rows || []).map((row: any) => ({
    page: row.dimensionValues[0].value,
    pageViews: parseInt(row.metricValues[0].value || '0'),
    avgTime: parseFloat(row.metricValues[1].value || '0'),
  }));
}

/** Test connection - simple metadata check */
export async function testConnection(credentials: GACredentials): Promise<{
  success: boolean;
  propertyName?: string;
  error?: string;
}> {
  try {
    // GA-02 FIX: Validate property ID
    validatePropertyId(credentials.propertyId);

    const token = await getAccessToken(credentials.serviceAccountJson);
    const url = `https://analyticsadmin.googleapis.com/v1beta/properties/${credentials.propertyId}`;

    // GA-04 FIX: Use fetchWithTimeout
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return { success: false, error: `خطأ (${res.status}): تأكد من Property ID وصلاحيات Service Account` };
    }

    const data = await res.json();
    return { success: true, propertyName: data.displayName || credentials.propertyId };
  } catch (error: any) {
    // GA-05 FIX: Don't expose raw error internals
    console.error("[GA] Test connection error:", error);
    return { success: false, error: "فشل الاتصال. تحقق من البيانات المُدخلة واتصال الإنترنت." };
  }
}

/** Clear cached token (when credentials change) */
export function clearTokenCache() {
  _tokenCache = null;
}
