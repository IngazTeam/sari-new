import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { refreshTenantLedger } from '../scripts/testing/sync-tenant-design-ledger.mjs';
const read=(p:string)=>readFileSync(p,'utf8');
const coverage=JSON.parse(read('docs/audits/tenant-features-2026-09-30/coverage.json'));
const ledger=read('docs/audits/tenant-testing-workspace-2026-09-28/REMAINING.md');
describe('tenant continuation ledger remains aligned without losing work history',()=>{
  it('reflects reviewed notification transport without treating messages as financial transactions',()=>{
    const row=coverage.routes.find((r:any)=>r.route==='/merchant/order-notifications');
    expect(row.design).toBe('تفصيلي جزئي');expect(row.acceptancePlan).toContain('رمز الحجز');expect(row.acceptancePlan).not.toContain('الضريبة');
    expect(row.mutations.sort()).toEqual(['orderNotifications.acknowledgeReviewed','orderNotifications.saveTemplate']);
    expect(row.queries).toContain('orderNotifications.workspace');expect(row.gaps.join(' ')).toContain('Safari/iPhone');
  });
  it('accounts for every current route once and stays idempotent',()=>{
    expect(refreshTenantLedger(ledger,coverage)).toBe(ledger);
    const routes=[...ledger.matchAll(/^\|[^\n]*<code>([^<]+)<\/code>/gm)].map(m=>m[1]);
    expect(routes.sort()).toEqual(coverage.routes.map((r:any)=>r.route).sort());
    expect(new Set(routes).size).toBe(routes.length);
  });
  it('refreshes a stale row and count without altering the dated history or follow-up notes',()=>{
    const changed=structuredClone(coverage);const row=changed.routes.find((r:any)=>r.design==='تفصيلي جزئي');row.design='موك أب عام';row.gaps=['fixture | note'];
    const result=refreshTenantLedger(ledger,changed);
    const heading='| الأولوية | الصفحة والمسار | حالة الموك أب | العمل الباقي أو شرط التحقق |';
    expect(result.slice(0,result.indexOf('- موك أب عام:'))).toBe(ledger.slice(0,ledger.indexOf('- موك أب عام:')));
    expect(result).toContain('fixture &#124; note');
    const tail='عدد عناصر JSX';expect(result.slice(result.indexOf(tail))).toBe(ledger.slice(ledger.indexOf(tail)));
    expect(result.split(heading)).toHaveLength(2);
    expect(refreshTenantLedger(result,changed)).toBe(result);
  });
  it('refuses silently missing, extra or duplicate route identities',()=>{
    for(const rows of [coverage.routes.slice(1),[...coverage.routes,coverage.routes[0]],[...coverage.routes.slice(1),{...coverage.routes[0],route:'/merchant/unreviewed'}]]){
      expect(()=>refreshTenantLedger(ledger,{routes:rows})).toThrow();
    }
  });
  it('clears a stale generic-page count when its last remaining page is reconciled',()=>{
    const complete=structuredClone(coverage);for(const row of complete.routes)if(row.design==='موك أب عام')row.design='تفصيلي جزئي';
    const stale=ledger.replace(/- موك أب عام: \*\*\d+\*\*/,'- موك أب عام: **2**');
    const result=refreshTenantLedger(stale,complete);expect(result).toContain('- موك أب عام: **0** مسارًا.');expect(refreshTenantLedger(result,complete)).toBe(result);
  });
  it.each(['/merchant/team','/merchant/privacy-center'])('keeps the actual shared screen and documented limits in the register for %s',route=>{
    const row=coverage.routes.find((r:any)=>r.route===route);expect(row.productionChanged).toBe(true);expect(row.design).toBe('تفصيلي جزئي');expect(row.designSections.join(' ')).toContain('مكوّن فعلي مشترك');expect(row.gaps.join(' ')).toContain('Safari/iPhone');
  });
  it('refuses an ambiguous ledger instead of discarding its history',()=>{
    expect(()=>refreshTenantLedger(ledger+'\n| الأولوية | الصفحة والمسار | حالة الموك أب | العمل الباقي أو شرط التحقق |',coverage)).toThrow();
    expect(()=>refreshTenantLedger('dated notes without a table',coverage)).toThrow();
  });
});
