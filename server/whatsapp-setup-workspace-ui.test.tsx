// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ar from '../client/src/locales/ar.json';
import en from '../client/src/locales/en.json';
const state = vi.hoisted(() => ({ language: 'en' }));
vi.mock('wouter', () => import('../prototypes/tenant-dashboard/src/service-preview-router'));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: state.language }, t: (key: string) => key.split('.').reduce((v: any, k) => v?.[k], state.language === 'ar' ? ar : en) || key }) }));
import Setup from '../client/src/pages/merchant/GreenAPISetupGuide';
import Receive from '../client/src/pages/merchant/WhatsAppWebhookSetup';
import { servicePreviewHref, validServicePath } from '../prototypes/tenant-dashboard/src/service-preview-router';
let root: Root, host: HTMLDivElement;
const copy = () => state.language === 'ar' ? ar.whatsappSetupUx : en.whatsappSetupUx;
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.language = 'en'; history.replaceState(null, '', '/?path=/merchant/greenapi-setup&lang=en'); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const render = (page: React.ReactNode) => act(async () => root.render(page));
it.each(['ar','en'])('covers both routes in %s without presenting guidance as account evidence', async lang => {
 state.language = lang; await render(<Setup/>); expect(host.querySelector('h1')?.textContent).toBe(copy().setupTitle); expect(host.textContent).toContain(copy().guideOnly); expect(host.textContent).toContain(copy().secureBody); expect(host.querySelectorAll('.wa-setup-steps li')).toHaveLength(3); expect(host.querySelector('a[aria-current=page]')?.textContent).toBe(copy().setupTab);
 await render(<Receive/>); expect(host.querySelector('h1')?.textContent).toBe(copy().receiveTitle); expect(host.textContent).toContain(copy().checkIncomingBody); expect(host.textContent).toContain(copy().checkReplyBody); expect(host.querySelector('input')).toBeNull(); expect(host.querySelector('a[aria-current=page]')?.textContent).toBe(copy().receiveTab); expect(host.textContent).not.toMatch(/whatsappSetupUx\.|undefined/);
});
it.each(['ar','en'])('switches provider instructions with a labelled native radio group in %s', async lang => {
 state.language = lang; await render(<Setup/>); expect(host.querySelector('legend')?.textContent).toBe(copy().chooseProvider); expect(host.querySelector('.wa-setup-steps')?.textContent).toContain(copy().greenRequestBody);
 await act(async () => host.querySelector<HTMLInputElement>('input[value=meta]')!.click()); expect(host.querySelector('.wa-setup-steps')?.textContent).toContain(copy().metaAuthorizeBody); expect(host.querySelector('.wa-setup-steps')?.textContent).not.toContain(copy().greenScanBody); expect(host.querySelector<HTMLInputElement>('input[value=meta]')!.checked).toBe(true);
 await act(async () => host.querySelector<HTMLInputElement>('input[value=green]')!.click()); expect(host.querySelector('.wa-setup-steps')?.textContent).toContain(copy().greenScanBody);
});
it('keeps all four help topics and opens the real tools instead of fictitious tests', async () => {
 await render(<Receive/>); expect(host.querySelectorAll('details')).toHaveLength(4); expect(host.querySelectorAll('summary')).toHaveLength(4);
 for (const route of ['/merchant/whatsapp','/merchant/conversations','/merchant/bot-settings','/merchant/sari-brain','/merchant/test-sari']) expect(host.querySelector(`a[href$="${route}"]`)).not.toBeNull();
 expect(host.querySelector('button')).toBeNull(); expect(host.querySelector('input[type=password]')).toBeNull(); expect(host.textContent).toContain(copy().simulatorHint);
 const consoleLink=host.querySelector<HTMLAnchorElement>('a[href="https://console.green-api.com"]')!; expect(consoleLink.target).toBe('_blank'); expect(consoleLink.rel).toBe('noopener noreferrer'); expect(consoleLink.textContent).toContain(copy().providerConsole);
});
it.each(['/merchant/greenapi-setup','/merchant/whatsapp-webhook-setup'])('shares the actual component and preserves the preview language for %s', route => {
 expect(validServicePath(route)).toBe(true); expect(servicePreviewHref(route,'?path=/merchant/greenapi-setup&lang=ar&tenant=270')).toContain('lang=ar');
 expect(validServicePath(route+'/extra')).toBe(false);
 const page=readFileSync('client/src/pages/merchant/'+(route.includes('webhook')?'WhatsAppWebhookSetup':'GreenAPISetupGuide')+'.tsx','utf8'); expect(page).toContain('WhatsAppSetupWorkspace'); expect(page).not.toMatch(/setTimeout|writeText|window\.location|trpc/);
});
it('removes generic webhook copying, fake health checks and price promises from the active guide', () => {
 const source=readFileSync('client/src/components/merchant/WhatsAppSetupWorkspace.tsx','utf8'); expect(source).not.toMatch(/setTimeout|toast\.success|\/api\/webhooks\/greenapi|writeText|trialNote|useQuery|useMutation/);
 expect(Object.keys(ar.whatsappSetupUx).sort()).toEqual(Object.keys(en.whatsappSetupUx).sort());
});
