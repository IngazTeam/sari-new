import webpush from "web-push";
import {
  noticeHash,
  type NoticeOutcome,
} from "../integrations/notice-evidence";

/** All push senders use this policy, including subscriptions saved by older releases. */
export function pushEndpoint(value: string): URL {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    /[\s\\\u0000-\u001f\u007f]/.test(value)
  )
    throw Error("push:invalid_endpoint");
  const u = new URL(value),
    host = u.hostname.toLowerCase();
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    (u.port && u.port !== "443") ||
    !(
      ["fcm.googleapis.com", "android.googleapis.com"].includes(host) ||
      host.endsWith(".push.apple.com") ||
      host.endsWith(".push.services.mozilla.com") ||
      host.endsWith(".notify.windows.com")
    )
  )
    throw Error("push:unsupported_service");
  return u;
}

export function preparePushRequest(
  subscription: { endpoint: string; p256dh: string; auth: string },
  body: string,
  publicKey: string,
  privateKey: string
) {
  pushEndpoint(subscription.endpoint);
  if (!publicKey || !privateKey || Buffer.byteLength(body, "utf8") > 3800)
    throw Error("push:invalid_payload");
  const details = webpush.generateRequestDetails(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    body,
    {
      TTL: 3600,
      vapidDetails: {
        subject: "mailto:support@sari.app",
        publicKey,
        privateKey,
      },
    }
  );
  if (
    details.endpoint !== subscription.endpoint ||
    details.method !== "POST" ||
    !Buffer.isBuffer(details.body)
  )
    throw Error("push:invalid_request");
  return details;
}

/** One attempt, no redirects, bounded response. Acceptance is not device delivery. */
export async function dispatchPushRequest(
  details: ReturnType<typeof preparePushRequest>
): Promise<NoticeOutcome> {
  pushEndpoint(details.endpoint);
  const r = await fetch(details.endpoint, {
    method: "POST",
    headers: Object.fromEntries(
      Object.entries(details.headers).map(([k, v]) => [k, String(v)])
    ),
    body: new Uint8Array(details.body!),
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (r.body) {
    const reader = r.body.getReader();
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 64000) throw Error("push:response_limit");
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  if (r.status === 201) {
    const location = r.headers.get("location");
    if (location && location.length <= 4096) {
      const ref = new URL(location, details.endpoint);
      if (
        ref.protocol === "https:" &&
        !ref.username &&
        !ref.password &&
        !ref.hash
      )
        return {
          state: "accepted",
          httpStatus: 201,
          referenceHash: noticeHash(ref.href),
        };
    }
  }
  return [400, 401, 403, 404, 410, 413].includes(r.status)
    ? {
        state: "rejected",
        httpStatus: r.status,
        referenceHash: noticeHash(["web-push", r.status]),
      }
    : { state: "unknown", httpStatus: r.status, referenceHash: null };
}
