/** Rolling UTC window, inclusive start and exclusive end; no future orders. */
export function dashboardWindow(merchantId: number, days: number, now = new Date()) {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1) throw Error('Invalid dashboard merchant');
  if (!Number.isInteger(days) || days < 1 || days > 366) throw Error('Invalid dashboard period');
  if (!Number.isFinite(now.getTime())) throw Error('Invalid dashboard clock');
  const through = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const from = new Date(through.getTime() - days * 86400000);
  const previousFrom = new Date(from.getTime() - days * 86400000);
  const db = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');
  return { from: from.toISOString(), through: through.toISOString(), previousFrom: previousFrom.toISOString(), sqlFrom: db(from), sqlThrough: db(through), sqlPreviousFrom: db(previousFrom) };
}
