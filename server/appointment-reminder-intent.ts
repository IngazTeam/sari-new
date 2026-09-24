export type AppointmentReminderIntent =
  | { kind: "schedule"; appointmentId: number; hours: 1 | 24 }
  | { kind: "cancel"; appointmentId: number }
  | { kind: "clarify" };

/** Commands are whole messages, never extracted from quoted text or model output. */
export function parseAppointmentReminderIntent(
  raw: string
): AppointmentReminderIntent | null {
  const text = raw
    .normalize("NFKC")
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .trim()
    .replace(/\s+/g, " ");
  if (!/(?:(?:ذكرني|تذكير).*(?:موعد|\bA\d)|remind.*appointment)/i.test(text))
    return null;
  if (text.length > 200) return { kind: "clarify" };
  const schedule =
    /^(?:ذكرني بالموعد A([1-9]\d*) قبل (ساعة|1 ساعة|24 ساعة)|remind me about appointment A([1-9]\d*) (1|24) hours? before)$/i.exec(
      text
    );
  if (schedule) {
    const appointmentId = Number(schedule[1] || schedule[3]);
    return Number.isSafeInteger(appointmentId) && appointmentId <= 2147483647
      ? {
          kind: "schedule",
          appointmentId,
          hours: (schedule[2] || schedule[4]).startsWith("24") ? 24 : 1,
        }
      : { kind: "clarify" };
  }
  const cancel =
    /^(?:الغ تذكير الموعد A([1-9]\d*)|cancel reminder for appointment A([1-9]\d*))$/i.exec(
      text
    );
  if (cancel) {
    const appointmentId = Number(cancel[1] || cancel[2]);
    if (Number.isSafeInteger(appointmentId) && appointmentId <= 2147483647)
      return { kind: "cancel", appointmentId };
  }
  return { kind: "clarify" };
}

/** Appointments store a Riyadh civil date and HH:mm separately, never a time-only Date. */
export function appointmentReminderDue(
  date: string,
  time: string,
  hours: 1 | 24
): number {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    ![1, 24].includes(hours)
  )
    return NaN;
  const epoch = Date.parse(`${date}T${time}:00+03:00`);
  if (
    !Number.isFinite(epoch) ||
    new Date(epoch + 3 * 3600000).toISOString().slice(0, 10) !== date
  )
    return NaN;
  return epoch - hours * 3600000;
}
