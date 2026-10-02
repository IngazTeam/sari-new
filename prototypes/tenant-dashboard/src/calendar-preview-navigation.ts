export {
  scopedCalendarSettings,
  calendarAuthorizationUrl,
  calendarCallbackResult,
} from "../../../client/src/lib/calendar-connection";
import { navigate } from "./service-preview-router";
/** OAuth is simulated entirely in memory; never visit a provider from the prototype. */
export function navigateCalendarAuthorization(_url: string) {
  navigate("/merchant/calendar/settings?oauth=connected");
  window.dispatchEvent(new Event('calendar-preview-authorization'));
}
