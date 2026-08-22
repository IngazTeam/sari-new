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
] as const;

type CopySection<Keys extends readonly string[]> = Record<Keys[number], string>;

export type MerchantUxCopy = {
  serviceForm: CopySection<typeof serviceFormCopyKeys>;
  discounts: CopySection<typeof discountCopyKeys>;
  comparePlans: CopySection<typeof comparePlanCopyKeys>;
  actions: CopySection<typeof actionCopyKeys>;
};

export function flattenMerchantUxKeys(copy: MerchantUxCopy): string[] {
  return Object.entries(copy).flatMap(([section, values]) =>
    Object.keys(values).map((key) => `${section}.${key}`),
  ).sort();
}
