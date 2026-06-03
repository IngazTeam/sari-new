/**
 * Takeover Constants — P2 Fix
 * 
 * Centralized takeover duration constants.
 * All modules should import from here instead of hardcoding values.
 */

/** Duration of timed takeover (merchant replies to customer) */
export const TAKEOVER_DURATION_MS = 60 * 60 * 1000; // 1 hour (sliding window)

/** Maximum age for permanent takeover before force-expiry */
export const MAX_PERMANENT_TAKEOVER_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Reminder threshold for permanent takeover (send reminder after this) */
export const PERMANENT_TAKEOVER_REMINDER_MS = 60 * 60 * 1000; // 1 hour

/** Interval for checking expired takeovers */
export const TAKEOVER_CHECK_INTERVAL_MS = 60 * 1000; // 60 seconds
