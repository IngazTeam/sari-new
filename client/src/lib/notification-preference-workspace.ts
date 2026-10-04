import {
  notificationPreferenceConfiguration,
  notificationPreferenceWorkspace,
  notificationPreferenceSaveResult,
  type NotificationPreferenceWorkspace,
  type NotificationPreferenceConfiguration,
} from "@shared/notification-preferences-workspace";
export const activePreferenceKeys =
  notificationPreferenceConfiguration.keyof().options;
export type PreferenceDraft = {
  [K in keyof NotificationPreferenceConfiguration]:
    | NotificationPreferenceConfiguration[K]
    | null;
};
export function preferenceDraft(
  data: NotificationPreferenceWorkspace
): PreferenceDraft {
  return Object.fromEntries(
    activePreferenceKeys.map(key => [key, data.values?.[key] ?? null])
  ) as PreferenceDraft;
}
export function scopedNotificationPreferences(
  value: unknown,
  actorId: number,
  merchantId: number
) {
  const parsed = notificationPreferenceWorkspace.safeParse(value);
  return parsed.success &&
    parsed.data.actorId === actorId &&
    parsed.data.merchantId === merchantId
    ? parsed.data
    : null;
}
export function preferencesMatch(
  data: NotificationPreferenceWorkspace,
  draft: PreferenceDraft
) {
  return (
    data.storedRecords === 1 &&
    activePreferenceKeys.every(key => data.values?.[key] === draft[key])
  );
}
export function scopedPreferenceSave(
  value: unknown,
  actorId: number,
  merchantId: number,
  draft: PreferenceDraft
) {
  const parsed = notificationPreferenceSaveResult.safeParse(value);
  return parsed.success &&
    parsed.data.workspace.canManage &&
    scopedNotificationPreferences(parsed.data.workspace, actorId, merchantId) &&
    preferencesMatch(parsed.data.workspace, draft)
    ? parsed.data
    : null;
}
