// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const context = vi.hoisted(() => ({ user: { data: { id: 10 } } as any, merchant: { data: { id: 20 } } as any, refetch: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/trpc', () => ({ trpc: {
  auth: { me: { useQuery: () => ({ ...context.user, refetch: context.refetch }) } },
  merchants: { getCurrent: { useQuery: () => ({ ...context.merchant, refetch: context.refetch }) } },
} }));
import { KnowledgeWorkspaceScope } from '../client/src/components/KnowledgeWorkspaceScope';
let root: Root, container: HTMLDivElement;
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); context.user = { data: { id: 10 } }; context.merchant = { data: { id: 20 } }; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
function Editor() { const [value, set] = useState(''); return React.createElement('input', { value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => set(event.target.value) }); }
const render = () => act(async () => root.render(React.createElement(KnowledgeWorkspaceScope, { slot: 'text', children: key => React.createElement(Editor, { key }) })));
it('does not expose the form while the account or merchant is loading or failed, even with stale data', async () => {
  context.user.isLoading = true; await render(); expect(container.querySelector('input')).toBeNull(); expect(container.textContent).toContain('.loading');
  context.user.isLoading = false; context.merchant.error = Error('Forbidden'); await render(); expect(container.querySelector('input')).toBeNull(); expect(container.textContent).toContain('.scopeError');
  await act(async () => container.querySelector('button')!.click()); expect(context.refetch).toHaveBeenCalledTimes(2);
});
it('remounts page state on a verified tenant/account change instead of leaking the previous editor', async () => {
  await render();
  await act(async () => { const el = container.querySelector('input')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, 'Private draft'); el.dispatchEvent(new Event('input', { bubbles: true })); });
  context.merchant = { data: { id: 21 } }; await render(); expect(container.querySelector('input')!.value).toBe('');
  context.user = { data: null }; await render(); expect(container.querySelector('input')).toBeNull();
});
