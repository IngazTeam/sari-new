// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { campaignPerformanceEn } from '../client/src/locales/campaign-performance';
const api = vi.hoisted(() => ({ stats: {} as any, timeline: {} as any, list: {} as any, days: vi.fn(), retryStats: vi.fn(), retryTimeline: vi.fn(), retryList: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string, values: Record<string, unknown> = {}) => {
  const text = campaignPerformanceEn[key.split('.').at(-1) as keyof typeof campaignPerformanceEn] ?? key;
  return text.replace(/{{(\w+)}}/g, (_, name) => String(values[name] ?? ''));
} }) }));
vi.mock('@/lib/trpc', () => ({ trpc: { campaigns: {
  list: { useQuery: () => ({ ...api.list, refetch: api.retryList }) },
  delete: { useMutation: () => ({}) }, send: { useMutation: () => ({}) },
  getSendProgress: { useQuery: () => ({}) }, getManualReviewSummary: { useQuery: () => ({}) },
  acknowledgeManualReview: { useMutation: () => ({}) },
  getStats: { useQuery: () => ({ ...api.stats, refetch: api.retryStats }) },
  getTimelineData: { useQuery: (input: { days: number }) => { api.days(input.days); return { ...api.timeline, refetch: api.retryTimeline }; } },
} } }));
import { CampaignPerformance } from '../client/src/components/merchant/CampaignPerformance';
import Campaigns from '../client/src/pages/merchant/Campaigns';
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  api.stats = { data: { completedCampaigns: 2, totalAcceptedByProvider: 80, totalUnconfirmed: 20, providerAcceptanceRate: 80 } };
  api.timeline = { data: [{ date: '2026-09-27', acceptedByProvider: 2 }, { date: '2026-09-28', acceptedByProvider: 3 }] };
  api.list = { data: [] };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(React.createElement(CampaignPerformance)));
const click = (label: string) => act(async () => { const button = Array.from(container.querySelectorAll('button')).find(el => el.textContent === label); expect(button).toBeTruthy(); button!.click(); });

it('distinguishes the all-time completed cohort from selected-period logs and delivery', async () => {
  await render();
  expect(container.textContent).toContain('Completed campaigns · all time');
  expect(container.textContent).toContain('Out of 100 recipients in completed campaigns');
  expect(container.textContent).toContain('5 messages with confirmed acceptance in this period');
  expect(container.textContent).toContain('do not confirm delivery, reading, or sales');
  expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  expect(container.querySelector('tbody time')?.getAttribute('datetime')).toBe('2026-09-28');
});
it('changes the queried window with accessible period controls', async () => {
  await render();
  for (const days of [7, 90, 30]) {
    await click(`${days} days`);
    expect(api.days).toHaveBeenLastCalledWith(days);
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toBe(`${days} days`);
  }
});
it('shows a missing sample as unknown instead of a zero-percent performance result', async () => {
  api.stats.data = { completedCampaigns: 0, totalAcceptedByProvider: 0, totalUnconfirmed: 0, providerAcceptanceRate: 0 };
  api.timeline.data = [{ date: '2026-09-28', acceptedByProvider: 0 }];
  await render();
  expect(container.textContent).toContain('No sample to calculate a rate');
  expect(container.textContent).not.toContain('0%');
  expect(container.querySelector('svg[role="img"]')).toBeNull();
  expect(container.querySelector('tbody td')?.textContent).toBe('0');
});
it('hides stale statistics on failure while keeping the independent timeline usable', async () => {
  api.stats.isError = true;
  await render();
  expect(container.textContent).not.toContain('80%');
  expect(container.textContent).toContain('5 messages with confirmed acceptance');
  await click('Retry');
  expect(api.retryStats).toHaveBeenCalledOnce(); expect(api.retryTimeline).not.toHaveBeenCalled();
});
it('hides a failed timeline rather than displaying cached figures as current', async () => {
  api.timeline.isError = true;
  await render();
  expect(container.textContent).toContain('80%');
  expect(container.textContent).not.toContain('5 messages with confirmed acceptance');
  expect(container.querySelector('table')).toBeNull();
  await click('Retry'); expect(api.retryTimeline).toHaveBeenCalledOnce();
});
it('keeps pending data distinct from an empty period', async () => {
  api.stats = {}; api.timeline = {};
  await render();
  expect(container.querySelectorAll('[role="status"]')).toHaveLength(2);
  expect(container.textContent).not.toContain('No messages');
  expect(container.querySelector('dl')).toBeNull();
});
it('refreshes both sources and prevents duplicate refresh while fetching', async () => {
  const onRefresh = vi.fn();
  await act(async () => root.render(React.createElement(CampaignPerformance, { onRefresh }))); await click('Refresh data');
  expect(api.retryStats).toHaveBeenCalledOnce(); expect(api.retryTimeline).toHaveBeenCalledOnce();
  expect(onRefresh).toHaveBeenCalledOnce();
  api.timeline.isFetching = true; await render(); await click('Refresh data');
  expect(api.retryTimeline).toHaveBeenCalledOnce();
});

it('does not turn a failed campaign list into an empty list or zero summary', async () => {
  api.list = { isError: true };
  await act(async () => root.render(React.createElement(Campaigns)));
  expect(container.querySelector('[role="alert"]')).toBeTruthy();
  expect(container.querySelector('[role="tablist"]')).toBeNull();
  expect(container.textContent).not.toContain('campaignsPage.noCampaigns');
  await click('Retry'); expect(api.retryList).toHaveBeenCalledOnce();
});

it('keeps a successfully loaded empty campaign list actionable', async () => {
  await act(async () => root.render(React.createElement(Campaigns)));
  expect(container.textContent).toContain('campaignsPage.noCampaigns');
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelectorAll('[role="tab"]')).toHaveLength(2);
});
