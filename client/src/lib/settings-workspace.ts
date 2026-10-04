import {
  merchantProfileWorkspace,
  merchantProfileSaveResult,
} from "@shared/merchant-profile-workspace";
import {
  selfProfileWorkspace,
  selfProfileRenameResult,
} from "@shared/self-profile-workspace";
export function scopedStoreProfile(
  value: unknown,
  actorId: number,
  merchantId: number
) {
  const parsed = merchantProfileWorkspace.safeParse(value);
  return parsed.success &&
    parsed.data.actorId === actorId &&
    parsed.data.merchantId === merchantId
    ? parsed.data
    : null;
}
export function scopedSelfProfile(value: unknown, actorId: number) {
  const parsed = selfProfileWorkspace.safeParse(value);
  return parsed.success && parsed.data.actorId === actorId
    ? { ...parsed.data, values: { name: parsed.data.name }, canManage: true }
    : null;
}
export function verifiedStoreProfile(
  value: unknown,
  actorId: number,
  merchantId: number,
  desired: Record<string, unknown>
) {
  const parsed = merchantProfileSaveResult.safeParse(value);
  if (!parsed.success) return null;
  const workspace = scopedStoreProfile(
    parsed.data.workspace,
    actorId,
    merchantId
  );
  return workspace?.values &&
    !workspace.invalidFields.length &&
    Object.entries(desired).every(
      ([k, v]) => workspace.values![k as keyof typeof workspace.values] === v
    )
    ? { changed: parsed.data.changed, workspace }
    : null;
}
export function verifiedSelfProfile(
  value: unknown,
  actorId: number,
  desired: Record<string, unknown>
) {
  const parsed = selfProfileRenameResult.safeParse(value);
  if (!parsed.success) return null;
  const workspace = scopedSelfProfile(parsed.data.workspace, actorId);
  return workspace && workspace.name === desired.name
    ? { changed: parsed.data.changed, workspace }
    : null;
}
