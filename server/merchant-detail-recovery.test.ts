// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ query: {} as any, create: vi.fn(), update: vi.fn(), refetch: vi.fn(), navigate: vi.fn() }));
vi.mock('wouter', () => ({ useLocation: () => ['/merchant/services/999999/edit', api.navigate], useParams: () => ({ id: '999999' }), Link: (props: any) => React.createElement('a', { href: props.href }, props.children) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ar' } }) }));
vi.mock('@/lib/trpc', () => ({ trpc: {
  serviceCategories: { list: { useQuery: () => ({ data: { categories: [] } }) } },
  services: {
    getById: { useQuery: () => ({ ...api.query, refetch: api.refetch }) },
    create: { useMutation: () => ({ mutate: api.create }) },
    update: { useMutation: () => ({ mutate: api.update }) },
  },
} }));
import ServiceForm from '../client/src/pages/merchant/ServiceForm';
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks(); api.query = { data: null, isLoading: false, isError: false };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(React.createElement(ServiceForm)));

it('does not offer an editable blank form for a missing service', async () => {
  await render();
  expect(container.querySelector('[data-state="missing"]')).toBeTruthy();
  expect(container.querySelector('form')).toBeNull();
  expect(api.create).not.toHaveBeenCalled(); expect(api.update).not.toHaveBeenCalled();
});
it('keeps a permission failure distinct from a missing service', async () => {
  api.query = { data: null, isLoading: false, isError: true, error: { data: { code: 'FORBIDDEN' } } };
  await render();
  expect(container.querySelector('[data-state="forbidden"]')).toBeTruthy();
  expect(container.querySelector('form')).toBeNull();
  expect(api.refetch).not.toHaveBeenCalled();
});
it('offers an explicit retry after a server failure without writing a service', async () => {
  api.query = { data: null, isLoading: false, isError: true, error: new Error('network') };
  await render();
  expect(container.querySelector('[data-state="error"]')).toBeTruthy();
  await act(async () => { container.querySelector('button')!.click(); });
  expect(api.refetch).toHaveBeenCalledOnce();
  expect(api.update).not.toHaveBeenCalled();
});
