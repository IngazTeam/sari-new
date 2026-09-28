import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const root='docs/audits/tenant-features-2026-09-28';
const baseline=JSON.parse(readFileSync(`${root}/feature-baseline.json`,'utf8'));
const current=JSON.parse(readFileSync(`${root}/inventory.json`,'utf8'));
describe('no registered tenant feature API disappears during the redesign',()=>{
  it.each(baseline.routes)('preserves reads and actions for $route',(before:any)=>{
    const after=current.routes.find((r:any)=>r.route===before.route);expect(after).toBeTruthy();
    const replaced=baseline.approvedReplacements.find((r:any)=>r.route===before.route)?.removed||[];
    for(const type of ['queries','mutations'])for(const api of before[type])if(!replaced.includes(api))expect(after[type],`${before.route}: ${api}`).toContain(api);
  });
});
