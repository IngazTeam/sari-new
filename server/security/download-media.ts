import axios from 'axios';
import dns from 'node:dns/promises';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { isPrivateOrSpecialAddress } from '../integrations/byaan-security';

/** Public HTTPS only; every redirect gets fresh validation and a pinned socket. */
export async function downloadPublicMedia(input: string, maxBytes = 16 * 1024 * 1024): Promise<{ data: Buffer; mimeType: string }> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 25 * 1024 * 1024) throw new Error('Invalid media limit');
  let agent: https.Agent | undefined;
  try {
    let next = input;
    for (let hop = 0; hop <= 2; hop++) {
      if (next.length > 8192) throw new Error('Invalid media URL');
      const url = new URL(next);
      const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
      if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
        || !host.includes('.') || isIP(host) || /(?:^|\.)(?:localhost|local|internal)$/.test(host)) throw new Error('Invalid media URL');
      let timer: ReturnType<typeof setTimeout> | undefined;
      const addresses = await Promise.race([
        dns.lookup(host, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), 5000); }),
      ]).finally(() => clearTimeout(timer));
      if (!addresses.length || addresses.some(item => isPrivateOrSpecialAddress(item.address))) throw new Error('Invalid media destination');
      const pinned = addresses[0];
      agent = new https.Agent({ keepAlive: false, lookup: ((_host, options, callback) => {
        if (typeof options === 'object' && options.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
      }) as LookupFunction });
      const response = await axios.get<ArrayBuffer>(url.toString(), {
        httpsAgent: agent, proxy: false, responseType: 'arraybuffer', maxRedirects: 0,
        timeout: 10_000, maxContentLength: maxBytes, maxBodyLength: maxBytes, validateStatus: () => true,
      });
      agent.destroy(); agent = undefined;
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (hop === 2 || typeof response.headers.location !== 'string') throw new Error('Invalid media redirect');
        next = new URL(response.headers.location, url).toString();
        continue;
      }
      if (response.status !== 200) throw new Error('Media unavailable');
      const data = Buffer.from(response.data);
      if (!data.length || data.length > maxBytes) throw new Error('Invalid media size');
      return { data, mimeType: String(response.headers['content-type'] || 'application/octet-stream').split(';')[0] };
    }
    throw new Error('Media unavailable');
  } catch {
    throw new Error('Unable to download a valid public media file');
  } finally { agent?.destroy(); }
}
