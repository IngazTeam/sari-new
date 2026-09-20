import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), merchant: vi.fn() }));
vi.mock('../accounts/merchant-access', async original => ({ ...await original<typeof import('../accounts/merchant-access')>(), resolveMerchantAccess: mocks.access }));
vi.mock('../db', () => ({ getMerchantById: mocks.merchant }));
import { authorizeKnowledgeUpload } from './upload-access';
import { MerchantSelectionRequiredError } from '../accounts/merchant-access';

beforeEach(() => { vi.clearAllMocks(); mocks.merchant.mockResolvedValue({ id: 20, status: 'active' }); });
describe('knowledge multipart access boundaries', () => {
  it.each(['owner','manager'])('authorizes a %s in the explicitly selected store', async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role });
    expect(await authorizeKnowledgeUpload(7, '20')).toMatchObject({ id: 20 });
    expect(mocks.access).toHaveBeenCalledWith(7, 20);
    expect(mocks.merchant).toHaveBeenCalledWith(20);
  });
  it.each(['viewer','sales_supervisor'])('rejects a %s before reading data or reserving upload resources', async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role });
    await expect(authorizeKnowledgeUpload(7, '20')).rejects.toMatchObject({ status: 403 });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it.each(['0','-1','1.5','NaN','2147483648',['20'],'20,21'])('rejects malformed selection %s before querying membership', async value => {
    await expect(authorizeKnowledgeUpload(7, value)).rejects.toMatchObject({ status: 400 });
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it('requires a selection for multiple stores and rejects revoked membership', async () => {
    mocks.access.mockRejectedValueOnce(new MerchantSelectionRequiredError());
    await expect(authorizeKnowledgeUpload(7, undefined)).rejects.toMatchObject({ status: 409 });
    mocks.access.mockResolvedValueOnce(null);
    await expect(authorizeKnowledgeUpload(7, '20')).rejects.toMatchObject({ status: 403 });
    expect(mocks.merchant).not.toHaveBeenCalled();
  });
  it('fails closed when identity storage is unavailable or the merchant has been suspended', async () => {
    mocks.access.mockRejectedValueOnce(new Error('synthetic outage'));
    await expect(authorizeKnowledgeUpload(7, '20')).rejects.toThrow();
    expect(mocks.merchant).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue({ merchantId: 20, role: 'owner' });
    mocks.merchant.mockResolvedValueOnce({ id: 20, status: 'suspended' });
    await expect(authorizeKnowledgeUpload(7, '20')).rejects.toMatchObject({ status: 403 });
  });
  it('mounts authorization before quota and multipart allocation, and sends the selected store from the UI', () => {
    const server = readFileSync('server/_core/index.ts', 'utf8');
    const route = server.slice(server.indexOf("app.post('/api/knowledge-docs/upload'"), server.indexOf('// ── tRPC API'));
    const auth = route.indexOf("authorizeKnowledgeUpload(user.id, req.headers['x-merchant-id'])");
    expect(auth).toBeGreaterThan(0);
    expect(auth).toBeLessThan(route.indexOf('reserveApiRateLimit'));
    expect(auth).toBeLessThan(route.indexOf("upload.single('file')"));
    expect(route).not.toContain('getMerchantByUserId');
    const ui = readFileSync('client/src/pages/merchant/Settings.tsx', 'utf8');
    expect(ui).toContain("headers: selected ? { 'x-merchant-id': selected } : {}");
    expect(ui).toContain('accept=".pdf,.docx,.xlsx"');
  });
});
