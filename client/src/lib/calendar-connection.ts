import { calendarSettingsView } from "@shared/calendar-settings";
export function scopedCalendarSettings(
  raw: unknown,
  actorId: number,
  merchantId: number
) {
  const parsed = calendarSettingsView.safeParse(raw);
  if (!parsed.success) return null;
  const v = parsed.data;
  if (
    v.actorId !== actorId ||
    v.merchantId !== merchantId ||
    (v.state === "unlinked") !== !v.active ||
    (!v.hasIntegration &&
      (v.active || v.calendarId !== null || v.lastSync !== null)) ||
    (v.state === "configured" && (!v.oauthReady || !v.calendarId)) ||
    (v.state === "oauth_disabled" && v.oauthReady)
  )
    return null;
  return v;
}
export function calendarAuthorizationUrl(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 16384) return null;
  try {
    const url = new URL(raw);
    if (
      url.origin !== "https://accounts.google.com" ||
      url.pathname !== "/o/oauth2/v2/auth" ||
      url.username ||
      url.password ||
      url.hash ||
      !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("state") ?? "") ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.get("response_type") !== "code"
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}
export function navigateCalendarAuthorization(url: string) {
  window.location.assign(url);
}
export function calendarCallbackResult(search: string) {
  const p = new URLSearchParams(search);
  if (!p.has("oauth")) return null;
  if (p.getAll("oauth").length !== 1) return "failed";
  const value = p.get("oauth");
  return value === "connected" || value === "cancelled" || value === "session"
    ? value
    : "failed";
}
