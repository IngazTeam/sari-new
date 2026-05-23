import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string | undefined) {
  // Basic IPv4 check and IPv6 presence detection.
  if (!host) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const isSecure = isSecureRequest(req);
  const hostname = req.hostname || 'localhost';
  const isLocalhost = LOCAL_HOSTS.has(hostname) || isIpAddress(hostname);

  return {
    httpOnly: true,
    path: "/",
    // SEC-PENTEST-01: SameSite=lax prevents CSRF. 'none' was incorrect —
    // Sari frontend/backend share the same origin (sary.live), so 'lax' works.
    // SameSite=none + Secure allows cookies in ALL cross-site contexts (CSRF risk).
    sameSite: "lax",
    secure: isSecure,
  };
}
