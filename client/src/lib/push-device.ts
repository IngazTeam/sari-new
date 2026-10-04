export type PushDeviceState = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  deviceHash: string | null;
};
export type PushDeviceAdapter = {
  read: () => Promise<PushDeviceState>;
  enable: (
    publicKey: string
  ) => Promise<{
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string;
    reviewed: true;
  }>;
  disable: (deviceHash: string) => Promise<boolean>;
};
export async function browserDeviceHash(endpoint: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(new URL(endpoint).href)
  );
  return Array.from(new Uint8Array(bytes), n =>
    n.toString(16).padStart(2, "0")
  ).join("");
}
function bounded<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("push:browser_timeout")),
      12000
    );
    promise.then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      e => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
function supported() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator &&
    !!window.crypto?.subtle
  );
}
function bytes(key: string) {
  return Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), c =>
    c.charCodeAt(0)
  );
}
async function registration() {
  const r = await bounded(navigator.serviceWorker.getRegistration("/"));
  if (r?.active && new URL(r.active.scriptURL).pathname !== "/sw.js")
    throw Error("push:worker_conflict");
  return r;
}
export const browserPushDevice: PushDeviceAdapter = {
  async read() {
    if (!supported())
      return { supported: false, permission: "unsupported", deviceHash: null };
    const r = await registration(),
      s = r ? await bounded(r.pushManager.getSubscription()) : null;
    return {
      supported: true,
      permission: Notification.permission,
      deviceHash: s ? await browserDeviceHash(s.endpoint) : null,
    };
  },
  async enable(publicKey) {
    if (!supported() || !/^[A-Za-z0-9_-]{87}$/.test(publicKey))
      throw Error("push:unsupported");
    // Request synchronously within the click gesture, before waiting for the worker.
    const permission = await bounded(Notification.requestPermission());
    if (permission !== "granted") throw Error("push:permission");
    await registration();
    await bounded(navigator.serviceWorker.register("/sw.js", { scope: "/" }));
    const r = await bounded(navigator.serviceWorker.ready);
    if (
      r.scope !== new URL("/", location.origin).href ||
      new URL(r.active!.scriptURL).pathname !== "/sw.js"
    )
      throw Error("push:worker_conflict");
    const s =
      (await bounded(r.pushManager.getSubscription())) ||
      (await bounded(
        r.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes(publicKey),
        })
      ));
    const configured = s.options.applicationServerKey;
    if (
      configured &&
      Array.from(new Uint8Array(configured)).join(",") !==
        Array.from(bytes(publicKey)).join(",")
    )
      throw Error("push:key_changed");
    const keys = s.toJSON().keys;
    if (!keys?.auth || !keys.p256dh) throw Error("push:keys_missing");
    return {
      endpoint: s.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: navigator.userAgent.slice(0, 500),
      reviewed: true,
    };
  },
  async disable(expected) {
    if (!supported()) return false;
    const r = await registration(),
      s = r ? await bounded(r.pushManager.getSubscription()) : null;
    if (!s) return true;
    if ((await browserDeviceHash(s.endpoint)) !== expected)
      throw Error("push:device_changed");
    return bounded(s.unsubscribe());
  },
};
