// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const language = vi.hoisted(() => ({ value: 'ar' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: language.value } }) }));
import ErrorBoundary from '../client/src/components/ErrorBoundary';
import { WorkspaceStandalone, WorkspaceState, workspaceFailureKind } from '../client/src/components/merchant/WorkspaceState';

let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  language.value = 'ar';
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(node: React.ReactNode) { await act(async () => { root.render(node); }); }

describe('merchant page recovery', () => {
  it('shows localized, accessible recovery actions in both languages', async () => {
    await render(React.createElement(WorkspaceStandalone, null, React.createElement(WorkspaceState, { kind: 'missing', focus: true })));
    expect(container.querySelector('h1')?.textContent).toBe('هذه الصفحة ليست هنا');
    expect(document.activeElement).toBe(container.querySelector('h1'));
    expect(container.querySelector('a[href="/merchant/tools"]')).toBeTruthy();
    language.value = 'en';
    await render(React.createElement(WorkspaceStandalone, null, React.createElement(WorkspaceState, { kind: 'missing' })));
    expect(container.querySelector('.mw-standalone')?.getAttribute('dir')).toBe('ltr');
    expect(container.querySelector('h1')?.textContent).toBe('This page is not here');
    expect(container.textContent).toContain('Help and support');
  });
  it('maps authorization and missing records to specific states without exposing server errors', () => {
    expect(workspaceFailureKind({ data: { code: 'UNAUTHORIZED' } })).toBe('session');
    expect(workspaceFailureKind({ data: { code: 'FORBIDDEN' } })).toBe('forbidden');
    expect(workspaceFailureKind({ data: { code: 'NOT_FOUND' } })).toBe('missing');
    expect(workspaceFailureKind(new Error('private stack trace'))).toBe('error');
  });
  it('keeps loading separate from an empty result and offers sign-in for an expired session', async () => {
    await render(React.createElement(WorkspaceState, { kind: 'loading' }));
    expect(container.querySelector('[aria-busy=true]')).toBeTruthy();
    expect(container.querySelector('[role=status]')).toBeTruthy();
    expect(container.querySelector('button,a')).toBeNull();
    await render(React.createElement(WorkspaceState, { kind: 'session' }));
    expect(container.querySelector('a[href="/login"]')).toBeTruthy();
  });
  it('retries only after a click and preserves the parent navigation when a child fails', async () => {
    let fail = true;
    function Page() { if (fail) throw new Error('private stack trace'); return React.createElement('h1', null, 'Page recovered'); }
    const retry = vi.fn(() => { fail = false; });
    const view = (key: string) => React.createElement('div', null,
      React.createElement('nav', null, 'Workspace navigation'),
      React.createElement(ErrorBoundary, { resetKey: key, fallback: (reset: () => void) => React.createElement(WorkspaceState, { onRetry: () => { retry(); reset(); } }) }, React.createElement(Page)));
    await render(view('/merchant/products'));
    expect(container.textContent).toContain('Workspace navigation');
    expect(container.textContent).not.toContain('private stack trace');
    expect(retry).not.toHaveBeenCalled();
    await act(async () => { container.querySelector('button')!.click(); });
    expect(retry).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Page recovered');
    fail = true; await render(view('/merchant/products'));
    expect(container.querySelector('[data-state=error]')).toBeTruthy();
    fail = false; await render(view('/merchant/orders'));
    expect(container.textContent).toContain('Page recovered');
  });
});
