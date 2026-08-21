import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('operational remediation contracts', () => {
  const server = readFileSync('./server/_core/index.ts', 'utf8');
  const dashboard = readFileSync('./client/src/components/DashboardLayout.tsx', 'utf8');

  it('readiness performs a real database query', () => {
    expect(server).toContain("await getPool()");
    expect(server).toContain("await pool.query('SELECT 1')");
  });

  it('public liveness does not disclose internal memory or AI metrics', () => {
    const healthBlock = server.slice(server.indexOf("app.get('/health'"), server.indexOf("app.get('/ready'"));
    expect(healthBlock).not.toContain('memoryUsage');
    expect(healthBlock).not.toContain('activeSessions');
  });

  it('keeps request allocation below the former 50 MB global parser', () => {
    expect(server).toContain('express.json({ limit: "26mb" })');
    expect(server).not.toContain('express.json({ limit: "50mb" })');
  });

  it('blocks non-admin users before rendering admin pages', () => {
    expect(dashboard).toContain("isAdminRoute && !isAdmin");
    expect(dashboard).toContain('<Redirect to="/merchant/dashboard" />');
  });

  it('fails fast after an uncaught exception', () => {
    expect(server).toContain('setImmediate(() => process.exit(1))');
  });
});

