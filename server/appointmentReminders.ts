/** Compatibility entry points drain only persisted, explicitly requested reminders.
 * Old flags and calendar scans are not consent and never create outbound messages. */
import { runAppointmentReminderBatch } from './appointment-reminders';
export async function sendAppointmentReminders(merchantId: number): Promise<void> {
  await runAppointmentReminderBatch(merchantId);
}
export async function runRemindersForAllMerchants(): Promise<void> {
  await runAppointmentReminderBatch();
}
