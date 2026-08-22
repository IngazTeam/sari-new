import { ByaanSyncValidationError } from './byaan-sync-errors';

export type ApiConversionAction = 'enrollment' | 'payment' | 'inquiry';
export type ApiConversionStatus = 'pending' | 'completed' | 'cancelled';

export interface NormalizedApiConversion {
  customerPhone: string;
  customerName: string | null;
  actionType: ApiConversionAction;
  productName: string;
  amount: string | null;
  externalRef: string;
  idempotencyKey: string;
  source: 'api';
  status: ApiConversionStatus;
}

export class ApiConversionConflictError extends Error {
  constructor() {
    super('Conversion idempotency key conflicts with an existing event');
    this.name = 'ApiConversionConflictError';
  }
}

const ALLOWED_KEYS = new Set([
  'customerPhone',
  'customerName',
  'actionType',
  'productName',
  'amount',
  'externalRef',
  'status',
]);
const ACTIONS = new Set<ApiConversionAction>(['enrollment', 'payment', 'inquiry']);
const STATUSES = new Set<ApiConversionStatus>(['pending', 'completed', 'cancelled']);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function invalid(): never {
  throw new ByaanSyncValidationError('conversion');
}

function normalizeText(value: unknown, maxLength: number, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) invalid();
    return null;
  }
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) invalid();
  const trimmed = value.trim();
  const clean = trimmed.replace(/<[^>]*>?/g, '').trim();
  if ((required && !clean) || (trimmed && !clean) || clean.length > maxLength) invalid();
  return clean || null;
}

function normalizePhone(value: unknown): string {
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) invalid();
  let phone = value.trim().replace(/[\s().-]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (/^05\d{8}$/.test(phone)) phone = `+966${phone.slice(1)}`;
  else if (/^966\d{9}$/.test(phone)) phone = `+${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone) || phone.length > 20) invalid();
  return phone;
}

function normalizeAmount(value: unknown, actionType: ApiConversionAction): string | null {
  if (value === undefined || value === null) {
    if (actionType === 'payment') invalid();
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 99_999_999.99) invalid();
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-7 || (actionType === 'payment' && cents === 0)) invalid();
  return (cents / 100).toFixed(2);
}

export function normalizeApiConversion(input: unknown): NormalizedApiConversion {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !ALLOWED_KEYS.has(key))) invalid();

  if (typeof raw.actionType !== 'string' || !ACTIONS.has(raw.actionType as ApiConversionAction)) invalid();
  const actionType = raw.actionType as ApiConversionAction;
  const status = raw.status === undefined ? 'completed' : raw.status;
  if (typeof status !== 'string' || !STATUSES.has(status as ApiConversionStatus)) invalid();

  const externalRef = normalizeText(raw.externalRef, 100, true) as string;
  return {
    customerPhone: normalizePhone(raw.customerPhone),
    customerName: normalizeText(raw.customerName, 255, false),
    actionType,
    productName: normalizeText(raw.productName, 255, true) as string,
    amount: normalizeAmount(raw.amount, actionType),
    externalRef,
    idempotencyKey: externalRef,
    source: 'api',
    status: status as ApiConversionStatus,
  };
}

export function canAdvanceConversionStatus(from: ApiConversionStatus, to: ApiConversionStatus): boolean {
  if (from === to) return true;
  if (from === 'pending') return to === 'completed' || to === 'cancelled';
  if (from === 'completed') return to === 'cancelled';
  return false;
}
