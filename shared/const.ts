export const COOKIE_NAME = "app_session_id";
export const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

/** Valid deal stages for the Sales Pipeline. Single source of truth for server + client filtering. */
export const VALID_DEAL_STAGES = ['new', 'interested', 'qualified', 'ready', 'payment_link_sent', 'purchased', 'paid', 'lost', 'payment_failed'] as const;
export type DealStage = typeof VALID_DEAL_STAGES[number] | 'stalled';
