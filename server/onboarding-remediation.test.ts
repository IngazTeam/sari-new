import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('onboarding remediation guards', () => {
  it('does not call a missing saveProducts procedure or malformed sendBeacon endpoint', () => {
    const wizard = read('./client/src/pages/SetupWizard.tsx');
    const catalogStep = read('./client/src/pages/setup-wizard/ProductsServicesStep.tsx');
    const websiteStep = read('./client/src/pages/setup-wizard/WebsiteStep.tsx');

    expect(catalogStep).not.toContain('setupWizard.saveProducts');
    expect(websiteStep).not.toContain('setupWizard.saveProducts');
    expect(wizard).not.toContain('sendBeacon');
    expect(wizard).toContain('wizardDataRef.current');
  });

  it('sends the final catalog in the typed completion contract', () => {
    const wizard = read('./client/src/pages/SetupWizard.tsx');
    const routers = read('./server/routers-setup-wizard.ts');
    const start = routers.indexOf('completeSetup: protectedProcedure');
    const end = routers.indexOf('// Get templates', start);
    const completion = routers.slice(start, end);

    expect(wizard).toContain('products: products.filter');
    expect(wizard).toContain('services: services.filter');
    expect(completion).toContain('products: z.array(setupProductSchema).max(100)');
    expect(completion).toContain('services: z.array(setupServiceSchema).max(100)');
  });

  it('persists catalog idempotently before marking setup complete', () => {
    const routers = read('./server/routers-setup-wizard.ts');
    const start = routers.indexOf('completeSetup: protectedProcedure');
    const end = routers.indexOf('// Get templates', start);
    const completion = routers.slice(start, end);

    expect(completion).toContain('productNames.has(normalizedName)');
    expect(completion).toContain('serviceNames.has(normalizedName)');
    expect(completion.indexOf('await createProduct({')).toBeLessThan(completion.indexOf('await completeSetupWizard(merchant.id)'));
    expect(completion.indexOf('await createService({')).toBeLessThan(completion.indexOf('await completeSetupWizard(merchant.id)'));
  });

  it('reads the mysql insert id from the driver result tuple', () => {
    const db = read('./server/db.ts');
    const start = db.indexOf('export async function createService');
    const end = db.indexOf('export async function getServicesByMerchant', start);
    const createService = db.slice(start, end);

    expect(createService).toContain('result[0]');
    expect(createService).not.toContain('(result as any).insertId');
  });
});
