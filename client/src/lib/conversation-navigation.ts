import { isValidDealStage } from '@shared/const';

const positiveId = (value: string | null, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= maximum ? number : undefined;
};

export function conversationNavigation(search: string) {
  const params = new URLSearchParams(search), stage = params.get('stage');
  const conversationId = positiveId(params.get('conversationId')) ?? null;
  const rawHistory = params.get('history');
  const pieces = rawHistory && rawHistory.length <= 1700 ? rawHistory.split(',') : [];
  const parsed = pieces.map(value => positiveId(value));
  const validHistory = parsed.length > 0 && parsed.length <= 100 && parsed.every((id, index) => id !== undefined && (index === 0 || id < parsed[index - 1]!));
  return {
    search: (params.get('phone') ?? '').trim().slice(0, 200),
    page: positiveId(params.get('page'), 100000) ?? 1,
    conversationId,
    historyTrail: conversationId && validHistory ? parsed as number[] : [],
    invalidHistory: !!conversationId && rawHistory !== null && !validHistory,
    stage: stage && isValidDealStage(stage) ? stage : undefined,
    needsHuman: params.get('needs_human') === '1' ? true : undefined,
  };
}

/** Change only the requested inbox parameters, preserving other route options. */
export function conversationHref(pathname: string, search: string, patch: Record<string, string | number | null>) {
  const params = new URLSearchParams(search);
  // A new selection must never inherit another conversation's message cursor.
  if (Object.hasOwn(patch, 'conversationId')) params.delete('history');
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') params.delete(key);
    else params.set(key, String(value));
  }
  const suffix = params.toString();
  return pathname + (suffix ? '?' + suffix : '');
}
