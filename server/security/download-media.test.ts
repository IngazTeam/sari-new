import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), get: vi.fn() }));
vi.mock('node:dns/promises', () => ({ default: { lookup: mocks.lookup } }));
vi.mock('axios', () => ({ default: { get: mocks.get } }));
import { downloadPublicMedia } from './download-media';
import { isPrivateOrSpecialAddress } from '../integrations/byaan-security';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  mocks.get.mockResolvedValue({ status: 200, headers: { 'content-type': 'audio/ogg' }, data: Buffer.from('fixture') });
});
afterEach(() => vi.restoreAllMocks());
describe('media download boundary', () => {
  it.each(['http://cdn.example.test/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://user:secret@cdn.example.test/a', 'https://cdn.example.test:8443/a'])('rejects unsafe URL before network: %s', async url => {
    await expect(downloadPublicMedia(url)).rejects.toThrow('valid public media');
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('rejects any private DNS answer, including mapped hexadecimal IPv4', async () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::ffff:7f00:1', '0:0:0:0:0:ffff:a00:1', '2002:7f00:1::']) {
      expect(isPrivateOrSpecialAddress(address)).toBe(true);
      mocks.lookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }, { address, family: address.includes(':') ? 6 : 4 }]);
      await expect(downloadPublicMedia('https://cdn.example.test/a')).rejects.toThrow('valid public media');
    }
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('pins DNS and caps transfer size, timeout and automatic redirects', async () => {
    expect((await downloadPublicMedia('https://cdn.example.test/a', 100)).data.toString()).toBe('fixture');
    const config = mocks.get.mock.calls[0][1];
    expect(config).toMatchObject({ proxy: false, maxContentLength: 100, maxRedirects: 0, timeout: 10000 });
    const callback = vi.fn();
    config.httpsAgent.options.lookup('cdn.example.test', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }]);
  });
  it('revalidates redirects before issuing a second request', async () => {
    mocks.get.mockResolvedValueOnce({ status: 302, headers: { location: 'https://metadata.example.test/private' }, data: Buffer.alloc(0) });
    mocks.lookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]).mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    await expect(downloadPublicMedia('https://cdn.example.test/a')).rejects.toThrow('valid public media');
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  it('does not return oversized payloads or expose signed URLs in failures', async () => {
    await expect(downloadPublicMedia('https://cdn.example.test/a', 1)).rejects.toThrow('valid public media');
    mocks.get.mockRejectedValue(new Error('private-signed-token'));
    await expect(downloadPublicMedia('https://cdn.example.test/a?token=private-signed-token')).rejects.toThrow(/^Unable to download a valid public media file$/);
  });
});
