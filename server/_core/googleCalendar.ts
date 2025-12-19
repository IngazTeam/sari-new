/**
 * Google Calendar Integration
 * Handles OAuth2 authentication and calendar operations
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getGoogleOAuthSettings } from '../db';

// OAuth2 Configuration
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3000/api/google/calendar/callback';

/**
 * Create OAuth2 client
 * Reads credentials from database instead of environment variables
 */
export async function createOAuth2Client(): Promise<OAuth2Client> {
  // Try to get credentials from database first
  const settings = await getGoogleOAuthSettings();
  
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  
  if (settings && settings.enabled) {
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

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );
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
  });

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
  });

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
  });

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
  });

  return response.data;
}

/**
 * Check if credentials are valid and refresh if needed
 */
export async function validateAndRefreshCredentials(credentials: any) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(credentials);

  try {
    // Try to get token info
    const tokenInfo = await oauth2Client.getTokenInfo(credentials.access_token);
    
    // If token is valid, return as is
    return credentials;
  } catch (error) {
    // Token expired, try to refresh
    if (credentials.refresh_token) {
      const { credentials: newCredentials } = await oauth2Client.refreshAccessToken();
      return newCredentials;
    }
    
    throw new Error('Invalid credentials and no refresh token available');
  }
}
