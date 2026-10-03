import axios from "axios";
import { assertActiveCompetitorAnalysis } from '../competitor-analysis-context';
import dns from "node:dns/promises";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isPrivateOrSpecialAddress } from "../integrations/byaan-security";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TIME = 15_000;
export class PublicWebsiteError extends Error {
  constructor(
    readonly code:
      | "WEBSITE_URL_INVALID"
      | "WEBSITE_FETCH_FAILED"
      | "WEBSITE_NO_READABLE_TEXT"
  ) {
    super(code);
  }
}
export function publicWebsiteUrl(input: string): URL {
  try {
    if (input.length > 8192) throw Error();
    const url = new URL(input),
      host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !host.includes(".") ||
      host.includes("..") ||
      isIP(host) ||
      /(?:^|\.)(?:localhost|local|internal|home|lan|onion)\.?$/.test(host)
    )
      throw Error();
    url.hash = "";
    return url;
  } catch {
    throw new PublicWebsiteError("WEBSITE_URL_INVALID");
  }
}
export function samePublicWebsiteOrigin(value: string, base: string) {
  try {
    return publicWebsiteUrl(value).origin === publicWebsiteUrl(base).origin;
  } catch {
    return false;
  }
}

/** GET only, no proxy/cookies/scripts. Validate and pin every redirect before opening its socket. */
export async function requestPublicWebsite(
  input: string,
  options: { headers?: Record<string, string> } = {}
) {
  let agent: https.Agent | undefined;
  const deadline = Date.now() + MAX_TIME;
  let url = publicWebsiteUrl(input);
  const initialOrigin = url.origin;
  const baseHeaders: Record<string, string> = {
    "user-agent": "SaryWebsiteReview/1.0",
    accept:
      "text/html,application/xhtml+xml,application/json,application/xml,text/plain",
  };
  for (const [name, value] of Object.entries(options.headers || {})) {
    const key = name.toLowerCase();
    if (
      [
        "user-agent",
        "accept",
        "accept-language",
        "x-requested-with",
        "origin",
        "referer",
        "store-id",
        "content-type",
      ].includes(key) &&
      typeof value === "string" &&
      value.length <= 1000 &&
      !/[\r\n]/.test(value)
    )
      baseHeaders[key] = value;
  }
  try {
    for (let hop = 0; hop <= 3; hop++) {
      await assertActiveCompetitorAnalysis();
      const remaining = () => {
        const ms = deadline - Date.now();
        if (ms <= 0) throw Error("deadline");
        return ms;
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const addresses = await Promise.race([
        dns.lookup(url.hostname, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(Error("DNS timeout")),
            Math.min(5000, remaining())
          );
        }),
      ]).finally(() => clearTimeout(timer));
      if (
        !addresses.length ||
        addresses.some(item => isPrivateOrSpecialAddress(item.address))
      )
        throw Error("destination");
      const pinned = addresses[0];
      agent = new https.Agent({
        keepAlive: false,
        lookup: ((_host, options, callback) => {
          if (typeof options === "object" && options.all)
            callback(null, [pinned]);
          else callback(null, pinned.address, pinned.family);
        }) as LookupFunction,
      });
      const headers = { ...baseHeaders };
      if (url.origin !== initialOrigin)
        for (const name of [
          "origin",
          "referer",
          "store-id",
          "x-requested-with",
        ])
          delete headers[name];
      await assertActiveCompetitorAnalysis();
      const response = await axios.get<ArrayBuffer>(url.href, {
        headers,
        httpsAgent: agent,
        proxy: false,
        responseType: "arraybuffer",
        maxRedirects: 0,
        timeout: remaining(),
        signal: AbortSignal.timeout(remaining()),
        maxContentLength: MAX_BYTES,
        maxBodyLength: MAX_BYTES,
        validateStatus: () => true,
      });
      agent.destroy();
      agent = undefined;
      remaining();
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (hop === 3 || typeof response.headers.location !== "string")
          throw Error("redirect");
        url = publicWebsiteUrl(new URL(response.headers.location, url).href);
        continue;
      }
      const data = Buffer.from(response.data);
      if (data.length > MAX_BYTES) throw Error("size");
      const body = data.toString("utf8");
      const mime = String(response.headers["content-type"] || "");
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        url: url.href,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-type" ? mime : null,
        },
        text: async () => body,
      };
    }
    throw Error("redirect");
  } catch {
    // Never expose a URL token, response body, DNS result or raw transport error.
    throw new PublicWebsiteError("WEBSITE_FETCH_FAILED");
  } finally {
    agent?.destroy();
  }
}
