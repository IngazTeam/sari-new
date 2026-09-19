import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createPool: vi.fn(), drizzle: vi.fn(), end: vi.fn(), on: vi.fn() }));
vi.mock('mysql2/promise', () => ({ default: { createPool: mocks.createPool } }));
vi.mock('drizzle-orm/mysql2', () => ({ drizzle: mocks.drizzle }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('DATABASE_URL', 'mysql://test:test@127.0.0.1:3306/disposable');
  mocks.end.mockResolvedValue(undefined);
  mocks.createPool.mockReturnValue({ end: mocks.end, pool: { on: mocks.on } });
  mocks.drizzle.mockReturnValue({ transaction: vi.fn() });
});
afterEach(() => vi.unstubAllEnvs());
describe('single connection owner', () => {
  it('shares one pool across simultaneous callers and the compatibility facade', async () => {
    const connection = await import('./connection');
    const shared = await import('./_shared');
    const values = await Promise.all([connection.getDb(), shared.getDb(), connection.getDb()]);
    expect(values[0]).toBe(values[1]);
    expect(values[1]).toBe(values[2]);
    expect(await shared.getPool()).toBe(await connection.getPool());
    expect(mocks.createPool).toHaveBeenCalledTimes(1);
    expect(mocks.createPool.mock.calls[0][0]).toMatchObject({ connectionLimit: 25, queueLimit: 100 });
  });
  it('blocks initialization while draining and closes only once', async () => {
    const connection = await import('./connection');
    await connection.getDb();
    let finish!: () => void;
    mocks.end.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const closing = connection.closeDb();
    const second = connection.closeDb();
    await expect(connection.getDb()).rejects.toThrow('shutting down');
    await Promise.resolve();
    finish();
    await Promise.all([closing, second]);
    expect(mocks.end).toHaveBeenCalledTimes(1);
    expect(connection.db).toBeNull();
  });
  it('does not create pools without configuration or for invalid URLs', async () => {
    const connection = await import('./connection');
    vi.stubEnv('DATABASE_URL', '');
    await expect(connection.getPool()).resolves.toBeNull();
    vi.stubEnv('DATABASE_URL', 'https://example.test/db');
    await expect(connection.getDb()).rejects.toThrow('protocol');
    expect(mocks.createPool).not.toHaveBeenCalled();
  });
  it('closes unpublished pools if initialization fails without printing credentials', async () => {
    const connection = await import('./connection');
    mocks.drizzle.mockImplementationOnce(() => { throw new Error('private connection value'); });
    await expect(connection.getDb()).rejects.toThrow('Database initialization failed');
    expect(mocks.end).toHaveBeenCalledTimes(1);
    expect(connection.db).toBeNull();
  });
});
