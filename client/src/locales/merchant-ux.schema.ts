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
  calendarReview: CopySection<readonly ["title","refresh","scope","loading","failed","activeResult","cancelledResult","unverifiedResult","ineligible","inFlight","targetUnavailable","providerUnavailable","identityMismatch","timeMismatch","notActive","cancelUnconfirmed","legacyScope","bindPermission","action","restore","confirmCancel","eventId","reason","bindAttest","attest","saving","submit","history","noHistory","actor","manualBinding"]>;
  calendarPage: CopySection<readonly ["total","title","description","refresh","connectionError","disconnected","settings","failed","loading","truncated","calendar","list","empty","unknownService","unassigned","details","more","close","cancelAttest","cancel","cancelling","pending","confirmed","cancelled","completed","noShow","local","synced","syncPending","needsReview"]>;
  marginPolicy: CopySection<readonly ["title","description","loading","loadFailed","refresh","enabled","minimum","scope","current","invalid","reviewed","saving","save","readOnly","failed","saved","history","empty","change","before","after","terms","on","off"]>;
  invoiceMargin: CopySection<readonly ["loading","policyFailed","refresh","title","description","tax","shipping","other","checking","preview","invalid","failed","pass","below","missing","invalidTotals","revenue","totalCosts","profit","ratio","products","unknown","disabled","attestation","exceptionTitle","exceptionScope","exceptionReason","exceptionInvalid","exceptionReviewed","exceptionPermission","exceptionApprove","auditLoading","auditFailed","auditTitle","auditActor","auditRatio","auditScope"]>;
  checkoutDiscount: CopySection<readonly ['title','subtotal','discount','total','pending','applied','invalid','historical']>;
  discountRelease: CopySection<readonly ['title','scope','loading','loadError','refresh','reason','attest','saving','save','success','error','legacy','order','identity','payment','coupon','counter','counterChange']>;
  checkoutAttempts: CopySection<readonly ['title','loading','error','refresh','dispatching','unknown','created','failed','scope','reference','review','chargeId','attest','reconcile','reconciling','verified','unverified','reconcileError']>;
  bookingCheckout: CopySection<readonly ['scope','created','verified','review','paymentStatus','unpaid','paid','refunded']>;
  bookingNotification: CopySection<readonly ["sourceMissing","contextChanged","receiptUnverified","providerUnconfirmed","conversationUnavailable","projectionConflict","projectionMissing","otherIssue","attemptAt","receipt","scope","reason","attest","verify","refresh","working","failed","done","history","actor","projected","notProjected"]>;
  bookingReschedule: CopySection<readonly ["noticeTitle","noticePending","noticeDispatching","noticeAccepted","noticeUnknown","noticeFailed","noticeSuppressed","noticeManual","noticeSent","noticeDelivered","noticeRead","noticeDeliveryFailed","noticeUnverified","noticeScope","noticeProjection","noticeText","title","description","pending","moving","unknown","applied","abandoned","binding","changed","financial","booking","consent","availability","inFlight","loading","failed","before","after","timezone","agreement","messageId","reason","attest","move","verify","abandon","history","working","refresh"]>;
  bookingCancellation: CopySection<readonly ["title","description","none","cancelling","unknown","cancelled","binding","financial","changed","requestMissing","booking","inFlight","loading","failed","timezone","source","messageId","reason","attest","cancel","verify","history","working","refresh"]>;
  bookingCalendar: CopySection<readonly ["title","description","none","creating","unknown","synced","legacy","account","binding","inFlight","consent","loading","failed","target","event","checked","reason","attest","create","verify","history","working","refresh"]>;
  bookingConsent: CopySection<readonly ['title','scope','missing','integrity','sourceInvalid','termsChanged','refused','unavailable','truncated','loading','failed','none','reference','messageId','service','staff','date','amount','offer','request','approval','latest','refusalMessage','attest','refresh','audit']>;
  bookingOperations: CopySection<readonly ['title','scope','status','pending','confirmed','inProgress','completed','cancelled','noShow','loading','failed','refresh','saving','save','saved','terminal','deleteScope','deleteAttest','remove','history','empty','actor','deleted','updated','before','after']>;
  bookingRenewal: CopySection<readonly ['title','scope','loading','failed','refresh','reason','attest','saving','renew','saved','booking','legacy','identity','link','payment','expiry','audit','actor','before','after']>;
  discountPolicy: CopySection<readonly ["title","description","loading","loadFailed","refresh","enabled","maxPercent","expireHours","scope","margin","current","invalid","reviewed","saving","save","readOnly","failed","saved","history","historyScope","empty","change","before","after","terms","on","off"]>;
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
