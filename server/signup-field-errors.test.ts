import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { TRPCError } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { router, publicProcedure } from './_core/trpc';
import { SignupConflictError } from './accounts/signup-errors';
import { signupSchema, signupErrorCopy, normalizeSignupPhone, validateSignup, readSignupFieldErrors } from '../shared/signup-validation';
import { renderCentralMarkup } from '../shared/central/render';
import { bootstrapCentral } from '../client/src/central/bootstrap';

const valid = { name: 'Test User', businessName: 'Test Store', email: 'test@example.test', phone: '+966501234567', password: 'TestPassword1', confirmPassword: 'TestPassword1', acceptedTerms: true, acceptedPrivacy: true, marketingConsent: false };
let dom: JSDOM;
afterEach(() => { dom?.window.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function mount(lang: 'ar' | 'en' = 'en') {
  dom = new JSDOM(`<div id="root">${renderCentralMarkup('/signup', lang)}</div>`, { url: `https://sary.live/signup?lang=${lang}`, pretendToBeVisual: true });
  for (const key of ['window', 'document', 'location', 'history', 'localStorage', 'FormData', 'HTMLInputElement']) vi.stubGlobal(key, (dom.window as any)[key]);
  bootstrapCentral();
  return dom.window.document;
}
function input(d: Document, name: string) { return d.querySelector<HTMLInputElement>(`[name="${name}"]`)!; }
function fill(d: Document, name: string, value: string | boolean) {
  if (typeof value === 'boolean') input(d, name).checked = value;
  else input(d, name).value = value;
  input(d, name).dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
function next(d: Document) { d.querySelector<HTMLButtonElement>('[data-signup-next]')!.click(); }
function submit(d: Document) { d.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); }
function fillValid(d: Document) {
  for (const name of ['name', 'businessName', 'email', 'phone'] as const) fill(d, name, valid[name]);
  next(d);
  for (const name of ['password', 'confirmPassword', 'acceptedTerms', 'acceptedPrivacy'] as const) fill(d, name, valid[name]);
}
function conflictResponse(code = 'CONFLICT', fields: unknown = { email: 'emailUsed', phone: 'phoneUsed' }) {
  return new Response(JSON.stringify([{ error: { json: { message: 'Internal details must not render', code: -32600, data: { code, httpStatus: 409, path: 'auth.signup', signupFieldErrors: fields } } } }]), { status: 409, headers: { 'Content-Type': 'application/json' } });
}

describe('registration field validation and accessible feedback', () => {
  it('shares limits, password rules, separate consent and normalized identifiers', () => {
    expect(validateSignup(valid)).toEqual({});
    expect(validateSignup({ ...valid, name: ' ', businessName: 'x', email: 'invalid', phone: '123', password: 'weak', confirmPassword: '', acceptedTerms: false, acceptedPrivacy: false })).toEqual({ name: 'name', businessName: 'businessName', email: 'email', phone: 'phone', password: 'password', confirmPassword: 'required', acceptedTerms: 'acceptedTerms', acceptedPrivacy: 'acceptedPrivacy' });
    expect(validateSignup({ ...valid, password: 'A1'.repeat(65) })).toMatchObject({ password: 'password', confirmPassword: 'confirmPassword' });
    expect(signupSchema.parse({ ...valid, email: ' Test@Example.test ' }).email).toBe('test@example.test');
    for (const value of ['+966 (50) 123-4567', '00966501234567', '0501234567', '966501234567']) expect(normalizeSignupPhone(value)).toBe('966501234567');
    expect(signupSchema.safeParse({ ...valid, phone: '++966501234567' }).success).toBe(false);
    for (const copy of Object.values(signupErrorCopy)) { expect(copy.ar).toMatch(/[\u0600-\u06ff]/); expect(copy.en).toMatch(/[a-z]/i); }
    expect(readSignupFieldErrors({ email: '<script>', secret: 'password', phone: 'phoneUsed', name: '__proto__' })).toEqual({ phone: 'phoneUsed' });
  });

  it.each(['ar', 'en'] as const)('shows all invalid fields with localized linked errors in %s', lang => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const d = mount(lang);
    fill(d, 'name', ' '); fill(d, 'businessName', 'x'); fill(d, 'email', 'wrong'); fill(d, 'phone', '12');
    next(d);
    expect(d.activeElement).toBe(input(d, 'name'));
    for (const name of ['name', 'businessName', 'email', 'phone'] as const) {
      expect(input(d, name).getAttribute('aria-invalid')).toBe('true');
      expect(input(d, name).getAttribute('aria-describedby')).toContain(`${name}-error`);
      expect(d.getElementById(`${name}-error`)!.textContent).toBe(signupErrorCopy[name][lang]);
      expect(d.getElementById(`${name}-error`)!.closest('[data-signup-step]')?.getAttribute('data-signup-step')).toBe('1');
    }
    expect(fetchMock).not.toHaveBeenCalled();
    fill(d, 'email', valid.email);
    expect(input(d, 'email').getAttribute('aria-invalid')).toBe('false');
    expect(input(d, 'phone').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows password, confirmation and each required consent error together', () => {
    const d = mount(); fillValid(d);
    fill(d, 'password', 'weak'); fill(d, 'confirmPassword', 'different'); fill(d, 'acceptedTerms', false); fill(d, 'acceptedPrivacy', false);
    submit(d);
    expect(d.activeElement).toBe(input(d, 'password'));
    for (const field of ['password', 'confirmPassword', 'acceptedTerms', 'acceptedPrivacy']) expect(input(d, field).getAttribute('aria-invalid')).toBe('true');
    expect(input(d, 'marketingConsent').getAttribute('aria-invalid')).toBeNull();
    fill(d, 'password', valid.password); fill(d, 'confirmPassword', valid.password);
    expect(d.getElementById('confirmPassword-error')!.hidden).toBe(true);
    fill(d, 'password', 'AnotherPassword1');
    expect(d.getElementById('confirmPassword-error')!.hidden).toBe(false);
  });

  it('keeps the submit target in place when leaving an invalid field to click it', () => {
    const d = mount(); fillValid(d);
    input(d, 'password').value = '';
    input(d, 'password').dispatchEvent(new dom.window.FocusEvent('blur', { relatedTarget: d.querySelector('button[type="submit"]') }));
    expect(d.getElementById('password-error')!.hidden).toBe(true);
    submit(d);
    expect(d.getElementById('password-error')!.hidden).toBe(false);
  });

  it('returns to duplicate account fields, preserves data, and clears only edited conflicts', async () => {
    const fetchMock = vi.fn(async () => conflictResponse()); vi.stubGlobal('fetch', fetchMock);
    const d = mount(); fillValid(d); submit(d); submit(d);
    await vi.waitFor(() => expect(d.getElementById('email-error')!.textContent).toContain('already in use'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(d.querySelector<HTMLElement>('[data-signup-step="1"]')!.hidden).toBe(false);
    expect(d.activeElement).toBe(input(d, 'email'));
    expect(input(d, 'password').value).toBe(valid.password);
    expect(input(d, 'acceptedTerms').checked).toBe(true);
    input(d, 'email').dispatchEvent(new dom.window.Event('blur'));
    expect(d.getElementById('email-error')!.hidden).toBe(false);
    fill(d, 'email', 'another@example.test');
    expect(d.getElementById('email-error')!.hidden).toBe(true);
    expect(d.getElementById('phone-error')!.hidden).toBe(false);
    expect(d.body.textContent).not.toContain('Internal details');
    expect(localStorage.getItem('sari_remember_password')).toBeNull();
  });

  it('shows server field validation and keeps rate limits/general failures at form level', async () => {
    const fetchMock = vi.fn().mockImplementationOnce(async () => conflictResponse('BAD_REQUEST', { password: 'password' }))
      .mockImplementationOnce(async () => conflictResponse('TOO_MANY_REQUESTS', null));
    vi.stubGlobal('fetch', fetchMock);
    const d = mount(); fillValid(d); submit(d);
    await vi.waitFor(() => expect(d.getElementById('password-error')!.hidden).toBe(false));
    expect(d.activeElement).toBe(input(d, 'password'));
    submit(d);
    await vi.waitFor(() => expect(d.getElementById('form-feedback')!.textContent).toContain('Too many attempts'));
  });
});

describe('signup API error serialization', () => {
  const handler = vi.fn();
  const testRouter = router({ auth: router({ signup: publicProcedure.input(signupSchema).mutation(handler), login: publicProcedure.mutation(handler) }) });
  async function request(path: string, body: unknown) {
    const result = await fetchRequestHandler({ endpoint: '/api/trpc', req: new Request(`http://localhost/api/trpc/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: body }) }), router: testRouter, createContext: () => ({ user: null, req: {}, res: {} } as any) });
    return (await result.json()).error.json;
  }
  it('returns only signup validation field codes for invalid input', async () => {
    const error = await request('auth.signup', { ...valid, password: 'short', acceptedPrivacy: false });
    expect(error.data.signupFieldErrors).toEqual({ password: 'password', acceptedPrivacy: 'acceptedPrivacy' });
    expect(handler).not.toHaveBeenCalled();
  });
  it('serializes known conflicts and never adds field details to login or unexpected errors', async () => {
    handler.mockRejectedValue(new TRPCError({ code: 'CONFLICT', cause: new SignupConflictError({ email: 'emailUsed', phone: 'phoneUsed' }) }));
    expect((await request('auth.signup', valid)).data.signupFieldErrors).toEqual({ email: 'emailUsed', phone: 'phoneUsed' });
    expect((await request('auth.login', {})).data.signupFieldErrors).toBeNull();
    handler.mockRejectedValue(new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: new Error('database internals') }));
    expect((await request('auth.signup', valid)).data.signupFieldErrors).toBeNull();
  });
});
