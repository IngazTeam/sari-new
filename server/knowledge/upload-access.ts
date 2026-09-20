import { hasPermission } from '../_core/permissions';
import { resolveMerchantAccess, MerchantSelectionRequiredError } from '../accounts/merchant-access';
import { parseMerchantSelection } from '../accounts/merchant-context';
import { getMerchantById } from '../db';

export class KnowledgeUploadAccessError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'KnowledgeUploadAccessError'; }
}

/** This must run before rate reservation, multipart parsing, storage, or AI calls. */
export async function authorizeKnowledgeUpload(userId: number, selection: unknown) {
  let selected: number | undefined;
  try { selected = parseMerchantSelection(selection); }
  catch { throw new KnowledgeUploadAccessError(400, 'اختيار المتجر غير صالح'); }
  let access;
  try { access = await resolveMerchantAccess(userId, selected); }
  catch (error) {
    if (error instanceof MerchantSelectionRequiredError) throw new KnowledgeUploadAccessError(409, 'اختر المتجر الذي تريد العمل عليه أولاً.');
    throw error;
  }
  if (!access || !hasPermission(access.role, 'bot_settings.manage')) throw new KnowledgeUploadAccessError(403, 'ليس لديك صلاحية إدارة معرفة المتجر');
  const merchant = await getMerchantById(access.merchantId);
  if (!merchant || merchant.status === 'suspended') throw new KnowledgeUploadAccessError(403, 'ليس لديك صلاحية إدارة معرفة المتجر');
  return merchant;
}
