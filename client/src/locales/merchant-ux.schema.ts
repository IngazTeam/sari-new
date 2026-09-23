export const serviceFormCopyKeys = [
  'created', 'updated', 'createFailed', 'updateFailed', 'loading', 'back',
  'editTitle', 'addTitle', 'editDescription', 'addDescription', 'basicInfo',
  'basicInfoDescription', 'name', 'namePlaceholder', 'description',
  'descriptionPlaceholder', 'category', 'selectCategory', 'noCategory',
  'pricing', 'pricingDescription', 'priceType', 'fixedPrice', 'variablePrice',
  'customPrice', 'basePrice', 'minPrice', 'maxPrice', 'timeSettings',
  'timeDescription', 'duration', 'bufferTime', 'bookingSettings',
  'bookingDescription', 'requiresAppointment', 'requiresAppointmentDescription',
  'maxBookings', 'maxBookingsPlaceholder', 'advanceDays', 'advanceDaysDescription',
  'displaySettings', 'displayDescription', 'displayOrder', 'displayOrderDescription',
  'cancel', 'saving', 'update', 'add',
] as const;

export const discountCopyKeys = [
  'created', 'updated', 'deleted', 'createFailed', 'updateFailed', 'deleteFailed',
  'requiredFields', 'invalidPercentage', 'invalidValue', 'title', 'description',
  'add', 'createTitle', 'createDescription', 'code', 'codePlaceholder', 'type',
  'percentage', 'fixed', 'value', 'currencyUnit', 'minimumOrder', 'maxUses',
  'expiresAt', 'cancel', 'creating', 'create', 'totalCodes', 'totalCodesDescription',
  'activeCodes', 'activeCodesDescription', 'totalUsage', 'totalUsageDescription',
  'templatesTitle', 'templatesDescription', 'templatePercentage10Label',
  'templatePercentage10Description', 'templatePercentage25Label',
  'templatePercentage25Description', 'templateFixed50Label',
  'templateFixed50Description', 'templateWelcomeLabel', 'templateWelcomeDescription',
  'templateSeasonalLabel', 'templateSeasonalDescription', 'templateFlashLabel',
  'templateFlashDescription', 'listTitle', 'listDescription', 'emptyTitle',
  'emptyDescription', 'columnCode', 'columnType', 'columnValue', 'columnMinimum',
  'columnUsage', 'columnExpiry', 'columnStatus', 'columnActions', 'active',
  'inactive', 'percentageType', 'fixedType', 'deleteTitle', 'deleteDescription',
  'deleting', 'delete', 'loading', 'loadFailed', 'retry', 'noExpiry',
] as const;

export const comparePlanCopyKeys = [
  'updated', 'noActiveSubscription', 'currentPlan', 'currentBadge', 'title', 'subtitle',
  'feature', 'customers', 'whatsappNumbers', 'monthlyConversations',
  'voiceMessages', 'free', 'monthly', 'select', 'updating', 'helpTitle',
  'helpDescription', 'back', 'loadFailed', 'retry', 'noPlans',
  'noPlansDescription', 'unlimited', 'updateFailed',
] as const;

export const actionCopyKeys = [
  'copyNamed', 'openNamed', 'disableNamed', 'editNamed', 'deleteNamed',
  'activateNamed', 'deactivateNamed', 'viewNamed', 'viewReportNamed',
  'sendNamed', 'previousPage', 'nextPage', 'copyWebhookUrl', 'copyPhoneNumber',
  'copyMessageId', 'positiveFeedback', 'negativeFeedback', 'sendMessage',
  'closeForm', 'viewContentNamed', 'openConversationImage',
  'removeNamed', 'selectNamed', 'revokeInviteNamed', 'copyQuotationNamed', 'sendPdfNamed',
  'acceptNamed', 'rejectNamed', 'copyReferralLink', 'showSecretKey',
  'hideSecretKey', 'markReadNamed', 'backToIntegrations', 'replyNamed',
  'mediaPreview', 'quotationPreviewNamed', 'gridView', 'listView',
  'chooseKnowledgeDocument',
] as const;

type CopySection<Keys extends readonly string[]> = Record<Keys[number], string>;

export const learningEvidenceCopyKeys = [
  'title', 'description', 'proposalsOnly', 'conversations', 'signals', 'proposals', 'verifiedPurchases',
  'verifiedRefunds', 'scope', 'pendingReview', 'empty', 'evidenceCount', 'modelHypothesis',
  'legacyActive', 'legacyReview', 'manageKnowledge', 'loadFailed', 'retry', 'loading', 'more',
  'sources', 'supporting', 'contrary', 'observed', 'evidenceEmpty',
] as const;

export type MerchantUxCopy = {
  offerReview: CopySection<readonly ['title','scope','loading','loadFailed','refresh','empty','older','latest','pages','attempt',
    'missing','invalid','pending','failed','sent','delivered','read','cancelled','reserved','priorAcceptance','projectionConflict','projected','projectionPending',
    'evidence','source','sourceUnavailable','text','textUnavailable','receipt','lastReview','recorded','acceptedUnprojected','reviewFailed','unresolved',
    'note','attestation','saving','save','saveFailed','readOnly']>;
  relay: CopySection<readonly ['title','scope','loading','loadFailed','refresh','empty','older','attempt','by','evidence','question','reply','lastReview',
    'missing','invalid','pending','deliveryFailed','accepted','delivered','read','recorded','failedOutcome','unresolved','note','attestation','saving','review','saveFailed','readOnly']>;
  handoff: CopySection<readonly ['title', 'loading', 'loadFailed', 'refresh', 'customer', 'employee', 'assistant', 'unknown', 'budget', 'needs', 'objection',
    'sourceTitle', 'sourceScope', 'sourceLoading', 'sourceUnavailable', 'sourceRetry',
    'objectionPrice', 'objectionDelivery', 'objectionQuality', 'objectionTrust',
    'humanOwner', 'botOwner', 'scope', 'evidence', 'noFacts', 'explicit', 'inferred', 'source', 'offers', 'noOffers', 'order', 'currentOffer', 'reviewOffer',
    'recent', 'noMessages', 'nextStep', 'reviewed', 'saving', 'resume', 'takeover', 'readOnly', 'failed', 'saved']>;
  followupPolicy: CopySection<readonly ['title', 'description', 'enabled', 'disableHint', 'timezone', 'timezoneHint',
    'weeklyLimit', 'startHour', 'endHour', 'scope', 'invalid', 'loading', 'loadFailed', 'refresh', 'saving', 'save', 'readOnly', 'failed', 'saved']>;
  salesSector: CopySection<readonly ['title', 'description', 'general', 'training', 'recruitment', 'store', 'loading', 'loadFailed',
    'refresh', 'select', 'scope', 'currentGuide', 'saving', 'save', 'readOnly', 'failed', 'saved']>;
  zidReconciliation: CopySection<readonly ['title', 'description', 'projection', 'unknown', 'legacy', 'waiting', 'readOnly',
    'orderId', 'attestation', 'checking', 'verify', 'failed', 'projectionRetry', 'verified', 'loading', 'loadFailed', 'refresh', 'empty', 'older']>;
  checkoutInvoice: CopySection<readonly ['title', 'description', 'attestation', 'approve', 'saving', 'approved', 'failed', 'link', 'noLink']>;
  serviceForm: CopySection<typeof serviceFormCopyKeys>;
  discounts: CopySection<typeof discountCopyKeys>;
  comparePlans: CopySection<typeof comparePlanCopyKeys>;
  actions: CopySection<typeof actionCopyKeys>;
  learningEvidence: CopySection<typeof learningEvidenceCopyKeys>;
};

export function flattenMerchantUxKeys(copy: MerchantUxCopy): string[] {
  return Object.entries(copy).flatMap(([section, values]) =>
    Object.keys(values).map((key) => `${section}.${key}`),
  ).sort();
}
