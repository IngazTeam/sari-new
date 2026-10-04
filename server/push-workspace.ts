import { createHash, ECDH } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PoolConnection } from "mysql2/promise";
import {
  withPreferenceAuthority,
  preferenceRows,
  NotificationPreferenceError,
} from "./notification-preferences-workspace";
import { hashSessionId, isSessionId } from "./_core/session-security";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { reserveApiRateLimit } from "./api/distributed-rate-limit";
import {
  pushSubscriptionInput,
  pushUnsubscribeInput,
  pushTestInput,
  pushWorkspace,
  pushTestResult,
} from "../shared/push-workspace";
import {
  pushEndpoint,
  preparePushRequest,
  dispatchPushRequest,
} from "./_core/push-transport";
export type PushScope = {
  actorId: number;
  merchantId: number;
  sessionId: string;
};
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const pushDeviceHash = (endpoint: string) =>
  createHash("sha256").update(pushEndpoint(endpoint).href).digest("hex");
const fail = (reason: string): never => {
  throw new TRPCError({
    code:
      reason === "forbidden"
        ? "FORBIDDEN"
        : reason === "rate_limit"
          ? "TOO_MANY_REQUESTS"
          : reason === "invalid"
            ? "BAD_REQUEST"
            : "PRECONDITION_FAILED",
    message: "push:" + reason,
  });
};
async function scopeWork<T>(
  s: PushScope,
  write: boolean,
  work: (tx: PoolConnection, canManage: boolean) => Promise<T>
) {
  try {
    if (!isSessionId(s.sessionId)) fail("forbidden");
    await assertRuntimeSchema("Push device authority", [
      {
        table: "push_subscriptions",
        columns: ["actor_user_id", "session_hash", "endpoint_hash"],
        uniqueIndexes: [
          { name: "uq_push_endpoint_hash", columns: ["endpoint_hash"] },
        ],
      },
      {
        table: "push_notification_logs",
        columns: ["request_id", "request_actor_id", "request_hash"],
        uniqueIndexes: [
          { name: "uq_push_test_request", columns: ["request_id"] },
        ],
      },
    ]);
    return await withPreferenceAuthority(
      s.actorId,
      s.merchantId,
      write ? "write" : "read",
      async (tx, canManage) => {
        const sessions = await preferenceRows(
          tx,
          "SELECT id FROM auth_sessions WHERE user_id=? AND token_id_hash=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR SHARE",
          [s.actorId, hashSessionId(s.sessionId)]
        );
        if (sessions.length !== 1) fail("forbidden");
        return work(tx, canManage);
      }
    );
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    if (e instanceof NotificationPreferenceError && e.reason === "forbidden")
      fail("forbidden");
    return fail("unconfirmed");
  }
}
const ack = (r: any) => {
  if (!r || r.affectedRows !== 1) fail("unconfirmed");
};
const iso = (v: any) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(" ", "T") + "Z");
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
const state = (raw: string) =>
  raw === "accepted"
    ? "accepted"
    : raw === "rejected"
      ? "rejected"
      : raw === "blocked"
        ? "blocked"
        : ["sent", "failed"].includes(raw)
          ? "legacy"
          : "unknown";
export async function readPushWorkspace(
  s: PushScope,
  deviceHash: string | null
) {
  return scopeWork(s, false, async (tx, canManage) => {
    const [stats] = await preferenceRows(
      tx,
      "SELECT COUNT(*) total,COALESCE(SUM(status='accepted'),0) accepted,COALESCE(SUM(status='rejected'),0) rejected FROM push_notification_logs WHERE merchant_id=?",
      [s.merchantId]
    );
    const logs = await preferenceRows(
      tx,
      "SELECT id,title,LEFT(body,1000) body,status,created_at FROM push_notification_logs WHERE merchant_id=? ORDER BY id DESC LIMIT 20",
      [s.merchantId]
    );
    const device = deviceHash
      ? await preferenceRows(
          tx,
          "SELECT id FROM push_subscriptions WHERE merchant_id=? AND endpoint_hash=? AND actor_user_id=? AND session_hash=? AND is_active=1 LIMIT 2",
          [s.merchantId, deviceHash, s.actorId, hashSessionId(s.sessionId)]
        )
      : [];
    const total = Number(stats.total),
      accepted = Number(stats.accepted),
      rejected = Number(stats.rejected);
    const publicKey =
      process.env.VAPID_PRIVATE_KEY &&
      /^[A-Za-z0-9_-]{87}$/.test(process.env.VAPID_PUBLIC_KEY || "")
        ? process.env.VAPID_PUBLIC_KEY!
        : null;
    return pushWorkspace.parse({
      actorId: s.actorId,
      merchantId: s.merchantId,
      canManage,
      publicKey,
      deviceHash,
      deviceEnabled: device.length === 1,
      checkedAt: new Date().toISOString(),
      counts: {
        total,
        accepted,
        rejected,
        unconfirmed: total - accepted - rejected,
      },
      logs: logs.map(l => ({
        id: l.id,
        title: l.title,
        body: l.body,
        state: state(l.status),
        createdAt: iso(l.created_at),
      })),
    });
  });
}
export async function subscribePushDevice(
  s: PushScope,
  raw: z.infer<typeof pushSubscriptionInput>
) {
  const input = pushSubscriptionInput.parse(raw);
  let endpoint: string, endpointHash: string;
  try {
    endpoint = pushEndpoint(input.endpoint).href;
    endpointHash = pushDeviceHash(endpoint);
    const key = Buffer.from(input.p256dh, "base64url"),
      auth = Buffer.from(input.auth, "base64url");
    if (
      key.length !== 65 ||
      key[0] !== 4 ||
      key.toString("base64url") !== input.p256dh ||
      auth.length !== 16 ||
      auth.toString("base64url") !== input.auth
    )
      fail("invalid");
    ECDH.convertKey(key, "prime256v1");
  } catch {
    fail("invalid");
  }
  return scopeWork(s, true, async tx => {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)
      fail("unconfigured");
    const existing = await preferenceRows(
      tx,
      "SELECT id FROM push_subscriptions WHERE endpoint_hash=? FOR UPDATE",
      [endpointHash]
    );
    const [capacity] = await preferenceRows(
      tx,
      "SELECT COUNT(*) n FROM push_subscriptions WHERE merchant_id=? AND is_active=1 AND endpoint_hash IS NOT NULL AND id<>?",
      [s.merchantId, existing[0]?.id || 0]
    );
    if (Number(capacity.n) >= 63) fail("capacity");
    // Possession of the browser keys and explicit review binds this device to this tenant/session only.
    if (existing.length) {
      const [r] = await tx.execute<any>(
        "UPDATE push_subscriptions SET merchant_id=?,actor_user_id=?,session_hash=?,endpoint=?,p256dh=?,auth=?,user_agent=?,is_active=1 WHERE id=?",
        [
          s.merchantId,
          s.actorId,
          hashSessionId(s.sessionId),
          endpoint,
          input.p256dh,
          input.auth,
          input.userAgent || null,
          existing[0].id,
        ]
      );
      ack(r);
    } else {
      const [count] = await preferenceRows(
        tx,
        "SELECT COUNT(*) n FROM push_subscriptions WHERE merchant_id=? AND is_active=1 AND endpoint_hash IS NOT NULL",
        [s.merchantId]
      );
      if (Number(count.n) >= 63) fail("capacity");
      const [r] = await tx.execute<any>(
        "INSERT INTO push_subscriptions (merchant_id,actor_user_id,session_hash,endpoint_hash,endpoint,p256dh,auth,user_agent) VALUES (?,?,?,?,?,?,?,?)",
        [
          s.merchantId,
          s.actorId,
          hashSessionId(s.sessionId),
          endpointHash,
          endpoint,
          input.p256dh,
          input.auth,
          input.userAgent || null,
        ]
      );
      ack(r);
      if (!r.insertId) fail("unconfirmed");
    }
    // Retire any unbound legacy duplicate for this tenant, retaining its historical logs.
    await tx.execute(
      "UPDATE push_subscriptions SET is_active=0 WHERE merchant_id=? AND endpoint=? AND endpoint_hash IS NULL",
      [s.merchantId, endpoint]
    );
    return {
      success: true as const,
      actorId: s.actorId,
      merchantId: s.merchantId,
      deviceHash: endpointHash,
    };
  });
}
export async function unsubscribePushDevice(
  s: PushScope,
  raw: z.infer<typeof pushUnsubscribeInput>
) {
  const input = pushUnsubscribeInput.parse(raw);
  return scopeWork(s, true, async tx => {
    // Idempotent and tenant/actor scoped. Never revoke another user's current binding.
    await tx.execute(
      "UPDATE push_subscriptions SET is_active=0 WHERE merchant_id=? AND actor_user_id=? AND endpoint_hash=?",
      [s.merchantId, s.actorId, input.deviceHash]
    );
    const rows = await preferenceRows(
      tx,
      "SELECT id FROM push_subscriptions WHERE merchant_id=? AND actor_user_id=? AND endpoint_hash=? AND is_active=1",
      [s.merchantId, s.actorId, input.deviceHash]
    );
    if (rows.length) fail("unconfirmed");
    return {
      success: true as const,
      actorId: s.actorId,
      merchantId: s.merchantId,
      deviceHash: input.deviceHash,
    };
  });
}
export async function testPushDevice(
  s: PushScope,
  raw: z.infer<typeof pushTestInput>
) {
  const input = pushTestInput.parse(raw),
    requestHash = digest([
      s.actorId,
      s.merchantId,
      hashSessionId(s.sessionId),
      input,
    ]);
  const title =
    input.language === "ar"
      ? "إشعار تجريبي من ساري"
      : "Test notification from Sary";
  const body =
    input.language === "ar"
      ? "إذا ظهر هذا الإشعار، فقد استلمه هذا الجهاز."
      : "If you can see this notification, this device received it.";
  const result = (state: "accepted" | "rejected" | "unknown" | "blocked") =>
    pushTestResult.parse({
      actorId: s.actorId,
      merchantId: s.merchantId,
      requestId: input.requestId,
      state,
    });
  const marker = await scopeWork(s, true, async tx => {
    const previous = await preferenceRows(
      tx,
      "SELECT id,merchant_id,request_actor_id,request_hash,status FROM push_notification_logs WHERE request_id=? FOR UPDATE",
      [input.requestId]
    );
    if (previous.length) {
      const p = previous[0];
      if (
        p.merchant_id !== s.merchantId ||
        p.request_actor_id !== s.actorId ||
        p.request_hash !== requestHash
      )
        fail("stale");
      return { fresh: false, id: p.id, state: state(p.status) };
    }
    const device = await preferenceRows(
      tx,
      "SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE merchant_id=? AND actor_user_id=? AND session_hash=? AND endpoint_hash=? AND is_active=1 FOR UPDATE",
      [s.merchantId, s.actorId, hashSessionId(s.sessionId), input.deviceHash]
    );
    if (device.length !== 1) fail("device_changed");
    if (
      !(
        await reserveApiRateLimit({
          namespace: "push:device-test",
          identity: String(s.merchantId),
          maxRequests: 5,
          windowMs: 60000,
        })
      ).allowed
    )
      fail("rate_limit");
    const [r] = await tx.execute<any>(
      "INSERT INTO push_notification_logs (merchant_id,subscription_id,title,body,url,status,request_id,request_actor_id,request_hash) VALUES (?,?,?,?,?,'started',?,?,?)",
      [
        s.merchantId,
        device[0].id,
        title,
        body,
        "/merchant/push-notifications",
        input.requestId,
        s.actorId,
        requestHash,
      ]
    );
    ack(r);
    if (!r.insertId) fail("unconfirmed");
    return {
      fresh: true,
      id: r.insertId,
      state: "unknown",
      snapshot: digest(device[0]),
    };
  });
  if (!marker.fresh)
    return result(
      marker.state === "legacy" ? "unknown" : (marker.state as any)
    );
  // The committed marker blocks repeat transport even if the following transaction or response is lost.
  return scopeWork(s, true, async tx => {
    const device = await preferenceRows(
      tx,
      "SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE merchant_id=? AND actor_user_id=? AND session_hash=? AND endpoint_hash=? AND is_active=1 FOR UPDATE",
      [s.merchantId, s.actorId, hashSessionId(s.sessionId), input.deviceHash]
    );
    let outcome: "accepted" | "rejected" | "unknown" | "blocked" = "blocked";
    if (device.length === 1 && digest(device[0]) === marker.snapshot) {
      let started = false;
      try {
        const details = preparePushRequest(
          device[0],
          JSON.stringify({
            title,
            body,
            url: "/merchant/push-notifications",
            lang: input.language,
          }),
          process.env.VAPID_PUBLIC_KEY || "",
          process.env.VAPID_PRIVATE_KEY || ""
        );
        started = true;
        outcome = (await dispatchPushRequest(details)).state as
          | "accepted"
          | "rejected"
          | "unknown";
      } catch {
        outcome = started ? "unknown" : "blocked";
      }
    }
    const [r] = await tx.execute<any>(
      "UPDATE push_notification_logs SET status=?,error=?,sent_at=IF(?='accepted',UTC_TIMESTAMP(),NULL) WHERE id=? AND merchant_id=? AND request_hash=? AND status='started'",
      [
        outcome,
        outcome === "accepted" ? null : "push:" + outcome,
        outcome,
        marker.id,
        s.merchantId,
        requestHash,
      ]
    );
    ack(r);
    return result(outcome);
  });
}
