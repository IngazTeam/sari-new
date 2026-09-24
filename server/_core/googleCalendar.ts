/**
 * Google Calendar Integration
 * Handles OAuth2 authentication and calendar operations
 */

import { google } from 'googleapis';
import { getGoogleOAuthSettings } from '../db';

// OAuth2 Configuration
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3000/api/google/calendar/callback';

/**
 * Create OAuth2 client
 * Reads credentials from database instead of environment variables
 */
export async function createOAuth2Client() {
  // Try to get credentials from database first
  const settings = await getGoogleOAuthSettings();
  
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  
  // @ts-ignore
  if (settings && settings.enabled as any) {
    clientId = settings.clientId;
    clientSecret = settings.clientSecret;
  } else {
    // Fallback to environment variables
    clientId = process.env.GOOGLE_CLIENT_ID;
    clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  }

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured. Please add them in Admin > Google OAuth Settings');
  }

  const client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );
  // Also bound token inspection/refresh: the SDK otherwise enables its own retries.
  const request = client.transporter.request.bind(client.transporter);
  client.transporter.request = ((options: any) => request({ ...options, timeout: 15000, retry: false })) as typeof client.transporter.request;
  return client;
}

/**
 * Generate authorization URL
 */
export async function getAuthUrl(state?: string): Promise<string> {
  const oauth2Client = await createOAuth2Client();
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: state,
    prompt: 'consent', // Force consent screen to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(code: string) {
  const oauth2Client = await createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Create calendar client with credentials
 */
export async function createCalendarClient(credentials: any) {
  const oauth2Client = await createOAuth2Client();
  oauth2Client.setCredentials(credentials);
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * List all calendars for the authenticated user
 */
export async function listCalendars(credentials: any) {
  const calendar = await createCalendarClient(credentials);
  const response = await calendar.calendarList.list();
  return response.data.items || [];
}

/**
 * Get available time slots for a given date
 */
export async function getAvailableSlots(
  credentials: any,
  calendarId: string,
  date: Date,
  durationMinutes: number,
  workingHours: { start: string; end: string },
  bufferMinutes: number = 0
): Promise<string[]> {
  const calendar = await createCalendarClient(credentials);

  // Set time range for the day
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get existing events
  const response = await calendar.events.list({
    calendarId: calendarId,
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];

  // Parse working hours
  const [startHour, startMinute] = workingHours.start.split(':').map(Number);
  const [endHour, endMinute] = workingHours.end.split(':').map(Number);

  // Generate all possible slots
  const slots: string[] = [];
  const slotDuration = durationMinutes + bufferMinutes;
  
  let currentTime = new Date(date);
  currentTime.setHours(startHour, startMinute, 0, 0);
  
  const workingEndTime = new Date(date);
  workingEndTime.setHours(endHour, endMinute, 0, 0);

  while (currentTime < workingEndTime) {
    const slotEnd = new Date(currentTime.getTime() + slotDuration * 60000);
    
    if (slotEnd <= workingEndTime) {
      // Check if slot is available (no conflicts with existing events)
      const isAvailable = !events.some(event => {
        if (!event.start?.dateTime || !event.end?.dateTime) return false;
        
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);
        
        // Check for overlap
        return (currentTime < eventEnd && slotEnd > eventStart);
      });

      if (isAvailable) {
        const timeStr = currentTime.toTimeString().substring(0, 5); // HH:MM
        slots.push(timeStr);
      }
    }

    // Move to next slot (every 30 minutes by default)
    currentTime = new Date(currentTime.getTime() + 30 * 60000);
  }

  return slots;
}

/**
 * Create a calendar event
 */
export async function createCalendarEvent(
  credentials: any,
  calendarId: string,
  eventData: {
    id?: string;
    privateProperties?: Record<string, string>;
    summary: string;
    description?: string;
    start: Date;
    end: Date;
    attendees?: string[];
    reminders?: {
      useDefault: boolean;
      overrides?: Array<{ method: string; minutes: number }>;
    };
  }
) {
  const calendar = await createCalendarClient(credentials);

  const event = {
    id: eventData.id,
    extendedProperties: eventData.privateProperties ? { private: eventData.privateProperties } : undefined,
    summary: eventData.summary,
    description: eventData.description,
    start: {
      dateTime: eventData.start.toISOString(),
      timeZone: 'Asia/Riyadh',
    },
    end: {
      dateTime: eventData.end.toISOString(),
      timeZone: 'Asia/Riyadh',
    },
    attendees: eventData.attendees?.map(email => ({ email })),
    reminders: eventData.reminders || {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 1440 }, // 24 hours
      ],
    },
  };

  const response = await calendar.events.insert({
    calendarId: calendarId,
    requestBody: event,
  }, { timeout: 15000, retry: false });

  return response.data;
}

/**
 * Update a calendar event
 */
export async function updateCalendarEvent(
  credentials: any,
  calendarId: string,
  eventId: string,
  updates: {
    summary?: string;
    description?: string;
    start?: Date;
    end?: Date;
  }
) {
  const calendar = await createCalendarClient(credentials);

  const event: any = {};
  
  if (updates.summary) event.summary = updates.summary;
  if (updates.description) event.description = updates.description;
  if (updates.start) {
    event.start = {
      dateTime: updates.start.toISOString(),
      timeZone: 'Asia/Riyadh',
    };
  }
  if (updates.end) {
    event.end = {
      dateTime: updates.end.toISOString(),
      timeZone: 'Asia/Riyadh',
    };
  }

  const response = await calendar.events.patch({
    calendarId: calendarId,
    eventId: eventId,
    requestBody: event,
  }, { timeout: 15000, retry: false });

  return response.data;
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(
  credentials: any,
  calendarId: string,
  eventId: string
) {
  const calendar = await createCalendarClient(credentials);

  await calendar.events.delete({
    calendarId: calendarId,
    eventId: eventId,
  }, { timeout: 15000, retry: false });

  return true;
}

/** Delete only the exact version reviewed by the caller; never retry a lost acknowledgement. */
export async function deleteCalendarEventIfMatch(credentials: any, calendarId: string, eventId: string, etag: string) {
  if (typeof etag !== 'string' || !/^"[\x21\x23-\x7e]{1,254}"$/.test(etag)) throw Error('Calendar event version unavailable');
  const calendar = await createCalendarClient(credentials);
  const response = await calendar.events.delete({ calendarId, eventId, sendUpdates: 'none' },
    { timeout: 15000, retry: false, headers: { 'If-Match': etag } });
  if (response.status !== 204) throw Error('Calendar cancellation acknowledgement unavailable');
  return true;
}

/**
 * Get a calendar event
 */
export async function getCalendarEvent(
  credentials: any,
  calendarId: string,
  eventId: string
) {
  const calendar = await createCalendarClient(credentials);

  const response = await calendar.events.get({
    calendarId: calendarId,
    eventId: eventId,
  }, { timeout: 15000, retry: false });

  return response.data;
}

/**
 * Check if credentials are valid and refresh if needed
 */
/** Exact interval, complete response required; an error must never be interpreted as free time. */
export async function assertCalendarTimeFree(credentials: any, calendarId: string, start: Date, end: Date) {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw Error('Calendar availability unavailable');
  const calendar = await createCalendarClient(credentials);
  const response = await calendar.freebusy.query({ requestBody: { timeMin: start.toISOString(), timeMax: end.toISOString(), timeZone: 'Asia/Riyadh', items: [{ id: calendarId }] } }, { timeout: 15000, retry: false });
  const entry = response.data.calendars?.[calendarId];
  if (!entry || (entry.errors && (!Array.isArray(entry.errors) || entry.errors.length > 0)) || !Array.isArray(entry.busy)) throw Error('Calendar availability unavailable');
  const epoch = (v: unknown) => typeof v === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) ? Date.parse(v) : NaN;
  for (const item of entry.busy) {
    const from = epoch(item.start), to = epoch(item.end);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw Error('Calendar availability unavailable');
    if (start.getTime() < to && end.getTime() > from) throw Error('Calendar interval is occupied');
  }
}

export async function validateAndRefreshCredentials(credentials: any) {
  const failed = () => new Error('Calendar authorization unavailable');
  const token = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 16384;
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials) ||
    (!token(credentials.access_token) && !token(credentials.refresh_token))) throw failed();
  try {
    const oauth2Client = await createOAuth2Client();
    const original = { ...credentials };
    oauth2Client.setCredentials({ ...original });
    if (token(original.access_token)) {
      try {
        const info = await oauth2Client.getTokenInfo(original.access_token);
        if (!Number.isFinite(info.expiry_date)) throw failed();
        if (info.expiry_date > Date.now()) return { ...original, expiry_date: info.expiry_date };
      } catch (error: any) {
        // A timeout or outage is not evidence of token expiry; don't amplify it with refresh.
        if (![400, 401].includes(error?.response?.status)) throw failed();
      }
    }
    if (!token(original.refresh_token)) throw failed();
    const { credentials: renewed } = await oauth2Client.refreshAccessToken();
    if (!token(renewed.access_token) || !Number.isFinite(renewed.expiry_date) || renewed.expiry_date! <= Date.now()) throw failed();
    return { ...original, ...renewed, refresh_token: original.refresh_token };
  } catch { throw failed(); }
}
