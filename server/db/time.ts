/** Schema string timestamps are UTC. Never interpret them in the machine's locale. */
export function databaseTimeEpoch(value: string | Date | null | undefined): number {
  let epoch = NaN;
  if (value instanceof Date) epoch = value.getTime();
  else if (typeof value === 'string') {
    const utc = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(value)
      ? `${value.replace(' ', 'T')}Z` : value;
    if (/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(utc)) epoch = Date.parse(utc);
  }
  return epoch;
}

export function isFutureDatabaseTime(value: string | Date | null | undefined, now = Date.now()): boolean {
  const epoch = databaseTimeEpoch(value);
  return Number.isFinite(epoch) && epoch > now;
}
