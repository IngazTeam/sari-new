import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ar from '../client/src/locales/ar.json';
import en from '../client/src/locales/en.json';

const state = vi.hoisted(() => ({
  error: false,
  data: {} as Record<string, unknown>,
  callbacks: {} as Record<string, any>,
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: state.toast }));
vi.mock('wouter', () => ({ Link: ({href, children}: any) => React.createElement('a', {href}, children) }));
vi.mock('@/_core/hooks/useAuth', () => ({ useAuth: () => ({user: {id: 1}}) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  i18n: {language: 'ar'},
  t: (key: string) => key.split('.').reduce((value: any, part) => value?.[part], ar) || key,
}) }));
vi.mock('@/lib/trpc', () => {
  const procedures = (names: string[]) => Object.fromEntries(names.map(name => [name, {
    useQuery: () => ({data: state.data[name], isLoading: false, isError: state.error, refetch: vi.fn()}),
    useMutation: (callbacks: any) => { state.callbacks[name] = callbacks; return {mutate: vi.fn(), isPending: false}; },
  }]));
  return {trpc: {
    merchants: procedures(['getCurrent', 'update']),
    advancedNotifications: procedures(['workspaceCapabilities', 'getScheduledReports', 'createScheduledReport', 'updateScheduledReport', 'deleteScheduledReport', 'getWhatsappAutoNotifications', 'getDefaultTemplates', 'createWhatsappAutoNotification', 'updateWhatsappAutoNotification', 'deleteWhatsappAutoNotification', 'getIntegrationsDashboard', 'resolveError']),
  }};
});
let components: React.ComponentType[];
beforeAll(async () => {
  vi.stubGlobal('React', React);
  components = await Promise.all([
    import('../client/src/pages/CurrencySettings'), import('../client/src/pages/IntegrationsDashboard'),
    import('../client/src/pages/ScheduledReports'), import('../client/src/pages/WhatsAppAutoNotifications'),
  ]).then(modules => modules.map(module => module.default));
});
beforeEach(() => {
  state.error = false;
  state.callbacks = {};
  state.data = {workspaceCapabilities: {reportsManage: true, notificationsManage: true, integrationsManage: true}, getCurrent: {currency: 'SAR'}, getScheduledReports: [], getWhatsappAutoNotifications: [], getIntegrationsDashboard: {integrations: [], stats: [], errors: []}};
  vi.clearAllMocks();
});
afterAll(() => vi.unstubAllGlobals());
const render = (index: number) => renderToStaticMarkup(React.createElement(components[index]));

describe('tenant settings show actual data and action outcomes', () => {
  it('loads currency through the registered merchants API and disables unchanged saves', () => {
    const html = render(0);
    expect(html).toContain('ريال سعودي');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*حفظ التغييرات/);
    expect(html).not.toContain('تم تحديث العملة بنجاح');
  });
  it('does not invent a success percentage for integrations with no syncs', () => {
    const html = render(1);
    expect(html).toContain('—');
    expect(html).not.toContain('>100%<');
    expect(html).toContain(ar.tenantFormsUx.noIntegrations);
  });
  it('calculates the integration success rate from recorded syncs', () => {
    state.data.getIntegrationsDashboard = {integrations: [], stats: [{sync_count: 4, success_count: 3}], errors: []};
    expect(render(1)).toContain('75%');
  });
  it('uses the actual platform API fields for integration names, state, sync date and settings links', () => {
    state.data.getIntegrationsDashboard = {integrations: [{id: 1, platformType: 'zid', isActive: 1, lastSyncAt: '2026-09-28 10:00:00'}], stats: [], errors: []};
    const html = render(1);
    expect(html).toContain('زد');
    expect(html).toContain('href="/merchant/integrations/zid"');
    expect(html).toContain(ar.notificationWorkspace.active);
    expect(html).not.toContain(ar.notificationWorkspace.neverSynced);
  });
  it.each([2, 3])('shows meaningful empty-state copy without success or failure toasts on initial render (%s)', index => {
    const html = render(index);
    const copy = index === 2 ? ar.tenantFormsUx.ScheduledReports : ar.tenantFormsUx.WhatsAppAutoNotifications;
    expect(html).toContain(index === 2 ? ar.tenantFormsUx.ScheduledReports.empty : ar.tenantFormsUx.WhatsAppAutoNotifications.emptyOrders);
    expect(html).toContain(copy.new);
    expect(html).not.toContain(copy.created);
    expect(html).not.toContain('// @ts-ignore');
    expect(state.toast.success).not.toHaveBeenCalled();
  });
  it.each([2, 3])('disables configuration creation for read-only roles and explains delivery availability (%s)', index => {
    state.data.workspaceCapabilities = {reportsManage: false, notificationsManage: false, integrationsManage: false};
    const html = render(index);
    expect(html).toContain(ar.notificationWorkspace.configurationOnly);
    const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every(match => match[1].includes('disabled=""'))).toBe(true);
  });
  it.each([0, 1, 2, 3])('provides a retry state when a page query fails (%s)', index => {
    state.error = true;
    const html = render(index);
    expect(html).toContain('data-state="error"');
    expect(html).toContain('إعادة المحاولة');
    expect(html).not.toContain('100%');
  });
  it.each([0, 1, 2, 3])('shows failures for every registered settings mutation (%s)', index => {
    render(index);
    for (const callbacks of Object.values(state.callbacks)) {
      state.toast.error.mockClear();
      callbacks.onError(new Error('Test request failed'));
      expect(state.toast.error).toHaveBeenCalledTimes(1);
      expect(state.toast.success).not.toHaveBeenCalled();
    }
  });
  it('keeps every new semantic label and placeholder aligned in Arabic and English', () => {
    const flatten = (value: any, prefix = ''): Record<string,string> => Object.fromEntries(Object.entries(value).flatMap(([key, child]) => typeof child === 'string' ? [[prefix+key, child]] : Object.entries(flatten(child, prefix+key+'.'))));
    for (const section of ['virtualTeamUx','brainWorkspaceUx','reportWorkspaceUx','tenantFormsUx','notificationWorkspace']) {
      const arabic = flatten((ar as any)[section]), english = flatten((en as any)[section]);
      expect(Object.keys(arabic).sort()).toEqual(Object.keys(english).sort());
      for (const key of Object.keys(arabic)) {
        expect(arabic[key].trim(), key).not.toBe('');
        expect(english[key].trim(), key).not.toBe('');
        const placeholders = (text: string) => [...text.matchAll(/{{\s*([\w.-]+)\s*}}/g)].map(match => match[1]).sort();
        expect(placeholders(arabic[key]), key).toEqual(placeholders(english[key]));
      }
    }
  });
});
