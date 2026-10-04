// Import only the APIs we use. The googleapis root loads declarations and
// implementations for hundreds of unrelated APIs during checking and startup.
import { auth, sheets } from 'googleapis/build/src/apis/sheets/index.js';
import { calendar } from 'googleapis/build/src/apis/calendar/index.js';

export const google = { auth, sheets, calendar };
