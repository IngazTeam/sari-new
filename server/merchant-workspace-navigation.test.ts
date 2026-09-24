import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { merchantSections, merchantSectionForPath, merchantToolForPath, navigableMerchantTools } from '../client/src/components/merchant/navigation';
import { merchantTools } from '../client/src/components/merchant/tools';

describe('merchant workspace navigation', () => {
  const app = readFileSync('client/src/App.tsx', 'utf8');
  const routes = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(match => match[1]);
  it('keeps every catalog destination attached to an existing route', () => {
    for (const tool of merchantTools) for (const path of tool.paths) expect(routes, `${tool.title}: ${path}`).toContain(path);
    for (const section of merchantSections) for (const path of [section.path, ...section.tabs]) expect(routes).toContain(path);
  });
  it('does not lose existing merchant page routes from the searchable catalog', () => {
    const catalog = merchantTools.flatMap(tool => tool.paths);
    // Compatibility URLs intentionally redirect to canonical catalog pages.
    const redirects = [...app.matchAll(/<Route\s+path="([^"]+)"\s*>\s*<Redirect\s+to="([^"]+)"/g)];
    const aliases = redirects.map(match => match[1]);
    for (const route of routes.filter(path => path.startsWith('/merchant/') && path !== '/merchant/tools' && !aliases.includes(path))) expect(catalog, route).toContain(route);
    for (const [, alias, target] of redirects.filter(match => match[1].startsWith('/merchant/'))) expect(catalog, alias).toContain(target);
  });
  it('prefers exact routes over detail parameters and handles deep links', () => {
    expect(merchantToolForPath('/merchant/services/new')?.title).not.toBe(merchantToolForPath('/merchant/services/17')?.title);
    expect(merchantSectionForPath('/merchant/campaigns/17/edit')?.id).toBe('marketing');
    expect(merchantSectionForPath('/merchant/conversations?needs_human=1')?.id).toBe('inbox');
    expect(merchantSectionForPath('/merchant/booking-reviews')?.id).toBe('customers');
  });
  it('never offers parameter placeholders or payment callbacks as navigable tools', () => {
    expect(new Set(navigableMerchantTools.map(tool => tool.path)).size).toBe(navigableMerchantTools.length);
    for (const tool of navigableMerchantTools) expect(tool.path).not.toMatch(/:|\/callback$|\/checkout$|\/payment\/(success|cancel)$/);
  });
});
