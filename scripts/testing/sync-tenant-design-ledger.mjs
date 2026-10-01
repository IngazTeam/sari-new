import fs from 'node:fs';

const tableStart = '| الأولوية | الصفحة والمسار | حالة الموك أب | العمل الباقي أو شرط التحقق |';
const cell = value => String(value).replaceAll('|', '&#124;').replace(/[\r\n]+/g, ' ');

/** Preserve the dated work log; refresh only the current route table and its counters. */
export function refreshTenantLedger(previous, coverage) {
  const start = previous.indexOf(tableStart);
  if (start < 0 || previous.indexOf(tableStart, start + 1) !== -1) throw Error('Ambiguous tenant ledger table');
  const lines = previous.slice(start).split('\n');
  let end = 2;
  const priorities = new Map();
  while (lines[end]?.startsWith('|')) {
    const route = lines[end].match(/<code>([^<]+)<\/code>/)?.[1];
    if (!route || priorities.has(route)) throw Error('Invalid or repeated tenant ledger route');
    priorities.set(route, lines[end].split('|')[1].trim());
    end++;
  }
  const routes = coverage.routes;
  if (new Set(routes.map(row => row.route)).size !== routes.length || priorities.size !== routes.length || routes.some(row => !priorities.has(row.route))) throw Error('Ledger routes differ from current source; reconcile explicitly');
  const rank = new Map(['تحويل','P0','P1','P2'].map((value,index)=>[value,index]));
  if ([...priorities.values()].some(value=>!rank.has(value))) throw Error('Unknown ledger priority');
  const ordered = [...routes].sort((a,b) => rank.get(priorities.get(a.route))-rank.get(priorities.get(b.route)) || (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));
  const rows = ordered.map(row => {
    const notes = row.redirect ? `التحقق من التحويل إلى ${row.redirect}.` : [
      ...(row.designSections.length ? [`النطاق المصمم: ${row.designSections.join('؛ ')}.`] : []),
      ...row.gaps,
      ...(row.design === 'موك أب عام' ? [row.acceptancePlan] : []),
    ].join(' ');
    return `| ${priorities.get(row.route)} | ${cell(row.title)}<br><code>${row.route}</code> | ${cell(row.design)} | ${cell(notes)} |`;
  });
  let updated = previous.slice(0,start) + [tableStart,lines[1],...rows,...lines.slice(end)].join('\n');
  const counts = routes.reduce((all,row) => ({...all,[row.design]:(all[row.design] || 0)+1}),{});
  for (const [label,count] of Object.entries(counts)) {
    const pattern = new RegExp(`^- ${label}: \\*\\*\\d+\\*\\* مسار(?:ات|ًا)\\.$`, 'gm');
    if (![...updated.matchAll(pattern)].length) throw Error('Missing coverage counter '+label);
    updated = updated.replace(pattern,`- ${label}: **${count}** مسارًا.`);
  }
  return updated;
}

export function syncTenantDesignLedger(coverage, path='docs/audits/tenant-testing-workspace-2026-09-28/REMAINING.md') {
  const before = fs.readFileSync(path,'utf8');
  const after = refreshTenantLedger(before,coverage);
  if (after !== before) fs.writeFileSync(path,after);
}
