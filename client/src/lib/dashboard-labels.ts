// Literal translation keys let the catalogue checker validate every lookup.
type Translate = (
  key: string,
  options?: Record<string, string | number>
) => string;

function labelLookup<T extends Record<string, (...args: never[]) => string>>(
  labels: T
) {
  return <K extends keyof T>(key: K, ...args: Parameters<T[K]>): string => {
    const render = labels[key] as (...values: Parameters<T[K]>) => string;
    return render(...args);
  };
}

export function dashboardAnalyticsLabels(t: Translate) {
  return labelLookup({
    title: () => t("dashboardAnalyticsUx.title"),
    loading: () => t("dashboardAnalyticsUx.loading"),
    failed: () => t("dashboardAnalyticsUx.failed"),
    retry: () => t("dashboardAnalyticsUx.retry"),
    refresh: () => t("dashboardAnalyticsUx.refresh"),
    unknown: () => t("dashboardAnalyticsUx.unknown"),
    noComparison: () => t("dashboardAnalyticsUx.noComparison"),
    growth: ({ value }: { value: string | number }) =>
      t("dashboardAnalyticsUx.growth", { value }),
    scopeWeek: ({
      days,
      currency,
    }: {
      days: string | number;
      currency: string | number;
    }) => t("dashboardAnalyticsUx.scopeWeek", { days, currency }),
    scope: ({
      days,
      currency,
    }: {
      days: string | number;
      currency: string | number;
    }) => t("dashboardAnalyticsUx.scope", { days, currency }),
    window: () => t("dashboardAnalyticsUx.window"),
    from: () => t("dashboardAnalyticsUx.from"),
    through: () => t("dashboardAnalyticsUx.through"),
    previous: () => t("dashboardAnalyticsUx.previous"),
    utc: () => t("dashboardAnalyticsUx.utc"),
    excludedValues: ({ count }: { count: number }) =>
      t("dashboardAnalyticsUx.excludedValues", { count }),
    value: () => t("dashboardAnalyticsUx.value"),
    orders: () => t("dashboardAnalyticsUx.orders"),
    average: () => t("dashboardAnalyticsUx.average"),
    delivered: () => t("dashboardAnalyticsUx.delivered"),
    allStates: () => t("dashboardAnalyticsUx.allStates"),
    created: () => t("dashboardAnalyticsUx.created"),
    averageScope: ({ count }: { count: number }) =>
      t("dashboardAnalyticsUx.averageScope", { count }),
    deliveredScope: () => t("dashboardAnalyticsUx.deliveredScope"),
    trend: () => t("dashboardAnalyticsUx.trend"),
    trendScope: () => t("dashboardAnalyticsUx.trendScope"),
    measure: () => t("dashboardAnalyticsUx.measure"),
    deliveredValue: () => t("dashboardAnalyticsUx.deliveredValue"),
    empty: () => t("dashboardAnalyticsUx.empty"),
    table: () => t("dashboardAnalyticsUx.table"),
    date: () => t("dashboardAnalyticsUx.date"),
    deliveredExcluded: ({ count }: { count: number }) =>
      t("dashboardAnalyticsUx.deliveredExcluded", { count }),
    analytics: () => t("dashboardAnalyticsUx.analytics"),
    products: () => t("dashboardAnalyticsUx.products"),
    productsScope: () => t("dashboardAnalyticsUx.productsScope"),
    catalog: () => t("dashboardAnalyticsUx.catalog"),
    sample: ({
      inspected,
      eligible,
      limit,
    }: {
      inspected: string | number;
      eligible: string | number;
      limit: string | number;
    }) => t("dashboardAnalyticsUx.sample", { inspected, eligible, limit }),
    partialSample: ({
      omitted,
      orders,
      items,
    }: {
      omitted: string | number;
      orders: string | number;
      items: string | number;
    }) => t("dashboardAnalyticsUx.partialSample", { omitted, orders, items }),
    productUnits: ({
      quantity,
      average,
    }: {
      quantity: string | number;
      average: string | number;
    }) => t("dashboardAnalyticsUx.productUnits", { quantity, average }),
    noEvidence: () => t("dashboardAnalyticsUx.noEvidence"),
    noDelivered: () => t("dashboardAnalyticsUx.noDelivered"),
  });
}

export function dashboardHomeLabels(t: Translate) {
  return labelLookup({
    suggestionsCache: () => t("dashboardHomeUx.suggestionsCache"),
    failed: () => t("dashboardHomeUx.failed"),
    retry: () => t("dashboardHomeUx.retry"),
    storeFailed: () => t("dashboardHomeUx.storeFailed"),
    storeHelp: () => t("dashboardHomeUx.storeHelp"),
    unavailable: () => t("dashboardHomeUx.unavailable"),
    welcome: ({ name }: { name: string | number }) =>
      t("dashboardHomeUx.welcome", { name }),
    intro: () => t("dashboardHomeUx.intro"),
    period: () => t("dashboardHomeUx.period"),
    week: () => t("dashboardHomeUx.week"),
    days: ({ count }: { count: number }) =>
      t("dashboardHomeUx.days", { count }),
    quick: () => t("dashboardHomeUx.quick"),
    checkingSetup: () => t("dashboardHomeUx.checkingSetup"),
    setup: () => t("dashboardHomeUx.setup"),
    setupHelp: () => t("dashboardHomeUx.setupHelp"),
    finishSetup: () => t("dashboardHomeUx.finishSetup"),
    next: () => t("dashboardHomeUx.next"),
    nextHelp: () => t("dashboardHomeUx.nextHelp"),
    human: () => t("dashboardHomeUx.human"),
    catalog: () => t("dashboardHomeUx.catalog"),
    campaigns: () => t("dashboardHomeUx.campaigns"),
    brain: () => t("dashboardHomeUx.brain"),
    brainHelp: () => t("dashboardHomeUx.brainHelp"),
    results: () => t("dashboardHomeUx.results"),
    resultsHelp: () => t("dashboardHomeUx.resultsHelp"),
    files: () => t("dashboardHomeUx.files"),
    filesHelp: () => t("dashboardHomeUx.filesHelp"),
    gaps: () => t("dashboardHomeUx.gaps"),
    gapsHelp: () => t("dashboardHomeUx.gapsHelp"),
    sales: () => t("dashboardHomeUx.sales"),
    salesHelp: () => t("dashboardHomeUx.salesHelp"),
    assistant: () => t("dashboardHomeUx.assistant"),
    assistantHelp: () => t("dashboardHomeUx.assistantHelp"),
    settings: () => t("dashboardHomeUx.settings"),
    checkingChannel: () => t("dashboardHomeUx.checkingChannel"),
    unknownChannel: () => t("dashboardHomeUx.unknownChannel"),
    connected: () => t("dashboardHomeUx.connected"),
    notConnected: () => t("dashboardHomeUx.notConnected"),
    loading: () => t("dashboardHomeUx.loading"),
    conversationsCount: ({ count }: { count: string | number }) =>
      t("dashboardHomeUx.conversationsCount", { count }),
    test: () => t("dashboardHomeUx.test"),
    recent: () => t("dashboardHomeUx.recent"),
    recentHelp: () => t("dashboardHomeUx.recentHelp"),
    allConversations: () => t("dashboardHomeUx.allConversations"),
    active: () => t("dashboardHomeUx.active"),
    closed: () => t("dashboardHomeUx.closed"),
    archived: () => t("dashboardHomeUx.archived"),
    unknownStatus: () => t("dashboardHomeUx.unknownStatus"),
    noConversations: () => t("dashboardHomeUx.noConversations"),
    connect: () => t("dashboardHomeUx.connect"),
    relationships: () => t("dashboardHomeUx.relationships"),
    relationshipsHelp: () => t("dashboardHomeUx.relationshipsHelp"),
    yourCampaigns: () => t("dashboardHomeUx.yourCampaigns"),
    campaignsScope: () => t("dashboardHomeUx.campaignsScope"),
    reviews: () => t("dashboardHomeUx.reviews"),
    reviewsCount: ({ count }: { count: string | number }) =>
      t("dashboardHomeUx.reviewsCount", { count }),
    noReviews: () => t("dashboardHomeUx.noReviews"),
    details: () => t("dashboardHomeUx.details"),
    close: () => t("dashboardHomeUx.close"),
    quickTitle: () => t("dashboardHomeUx.quickTitle"),
    quickHelp: () => t("dashboardHomeUx.quickHelp"),
    manageProducts: () => t("dashboardHomeUx.manageProducts"),
    newService: () => t("dashboardHomeUx.newService"),
    newQuote: () => t("dashboardHomeUx.newQuote"),
    newCampaign: () => t("dashboardHomeUx.newCampaign"),
    sync: () => t("dashboardHomeUx.sync"),
    lastSync: ({ date }: { date: string | number }) =>
      t("dashboardHomeUx.lastSync", { date }),
    noSyncTime: () => t("dashboardHomeUx.noSyncTime"),
    syncScope: () => t("dashboardHomeUx.syncScope"),
    products: () => t("dashboardHomeUx.products"),
    faqs: () => t("dashboardHomeUx.faqs"),
    pages: () => t("dashboardHomeUx.pages"),
    sections: () => t("dashboardHomeUx.sections"),
    customers: () => t("dashboardHomeUx.customers"),
    manageKnowledge: () => t("dashboardHomeUx.manageKnowledge"),
    suggestions: () => t("dashboardHomeUx.suggestions"),
    suggestionsHelp: () => t("dashboardHomeUx.suggestionsHelp"),
    generating: () => t("dashboardHomeUx.generating"),
    generate: () => t("dashboardHomeUx.generate"),
    more: () => t("dashboardHomeUx.more"),
    noSuggestions: () => t("dashboardHomeUx.noSuggestions"),
  });
}

export function dashboardSourcesLabels(t: Translate) {
  return labelLookup({
    title: () => t("dashboardSourcesUx.title"),
    refresh: () => t("dashboardSourcesUx.refresh"),
    scope: () => t("dashboardSourcesUx.scope"),
    checked: () => t("dashboardSourcesUx.checked"),
    customers: () => t("dashboardSourcesUx.customers"),
    trainees: () => t("dashboardSourcesUx.trainees"),
    customersScope: () => t("dashboardSourcesUx.customersScope"),
    traineesScope: () => t("dashboardSourcesUx.traineesScope"),
    integrations: () => t("dashboardSourcesUx.integrations"),
    integration: () => t("dashboardSourcesUx.integration"),
    integrationScope: () => t("dashboardSourcesUx.integrationScope"),
    none: () => t("dashboardSourcesUx.none"),
    byaan: () => t("dashboardSourcesUx.byaan"),
    salla: () => t("dashboardSourcesUx.salla"),
    zid: () => t("dashboardSourcesUx.zid"),
    woocommerce: () => t("dashboardSourcesUx.woocommerce"),
    shopify: () => t("dashboardSourcesUx.shopify"),
    calendly: () => t("dashboardSourcesUx.calendly"),
    unknown: () => t("dashboardSourcesUx.unknown"),
    not_connected: () => t("dashboardSourcesUx.not_connected"),
    unavailable: () => t("dashboardSourcesUx.unavailable"),
    configured: () => t("dashboardSourcesUx.configured"),
    syncing: () => t("dashboardSourcesUx.syncing"),
    error: () => t("dashboardSourcesUx.error"),
    paused: () => t("dashboardSourcesUx.paused"),
    pending_verification: () => t("dashboardSourcesUx.pending_verification"),
    noTime: () => t("dashboardSourcesUx.noTime"),
    sync_all: () => t("dashboardSourcesUx.sync_all"),
    sync_products: () => t("dashboardSourcesUx.sync_products"),
    sync_orders: () => t("dashboardSourcesUx.sync_orders"),
    sync_customers: () => t("dashboardSourcesUx.sync_customers"),
  });
}

export function trialNoticeLabels(t: Translate) {
  return labelLookup({
    title: () => t("trialNoticeUx.title"),
    loading: () => t("trialNoticeUx.loading"),
    failed: () => t("trialNoticeUx.failed"),
    retry: () => t("trialNoticeUx.retry"),
    manage: () => t("trialNoticeUx.manage"),
    underMinute: () => t("trialNoticeUx.underMinute"),
    noSubscription: () => t("trialNoticeUx.noSubscription"),
    trialEnded: () => t("trialNoticeUx.trialEnded"),
    subscriptionEnded: () => t("trialNoticeUx.subscriptionEnded"),
    trial: () => t("trialNoticeUx.trial"),
    review: () => t("trialNoticeUx.review"),
    trialHelp: () => t("trialNoticeUx.trialHelp"),
    reviewHelp: () => t("trialNoticeUx.reviewHelp"),
    unknownEnd: () => t("trialNoticeUx.unknownEnd"),
    ends: () => t("trialNoticeUx.ends"),
    remaining: () => t("trialNoticeUx.remaining"),
    plans: () => t("trialNoticeUx.plans"),
    compare: () => t("trialNoticeUx.compare"),
  });
}

export function dashboardKnowledgeLabels(t: Translate) {
  return labelLookup({
    title: () => t("knowledgeGroupsUx.title"),
    description: () => t("knowledgeGroupsUx.description"),
    refresh: () => t("knowledgeGroupsUx.refresh"),
    loading: () => t("knowledgeGroupsUx.loading"),
    error: () => t("knowledgeGroupsUx.error"),
    retry: () => t("knowledgeGroupsUx.retry"),
    documents: () => t("knowledgeGroupsUx.documents"),
    documentsNote: () => t("knowledgeGroupsUx.documentsNote"),
    openDocuments: () => t("knowledgeGroupsUx.openDocuments"),
    textReady: () => t("knowledgeGroupsUx.textReady"),
    emptyText: () => t("knowledgeGroupsUx.emptyText"),
    pending: () => t("knowledgeGroupsUx.pending"),
    processing: () => t("knowledgeGroupsUx.processing"),
    failed: () => t("knowledgeGroupsUx.failed"),
    latestUpload: () => t("knowledgeGroupsUx.latestUpload"),
    products: () => t("knowledgeGroupsUx.products"),
    productsNote: () => t("knowledgeGroupsUx.productsNote"),
    openProducts: () => t("knowledgeGroupsUx.openProducts"),
    visible: () => t("knowledgeGroupsUx.visible"),
    activeVisible: () => t("knowledgeGroupsUx.activeVisible"),
    hidden: () => t("knowledgeGroupsUx.hidden"),
    latestChange: () => t("knowledgeGroupsUx.latestChange"),
    website: () => t("knowledgeGroupsUx.website"),
    websiteNote: () => t("knowledgeGroupsUx.websiteNote"),
    openPages: () => t("knowledgeGroupsUx.openPages"),
    analyses: () => t("knowledgeGroupsUx.analyses"),
    enabledPages: () => t("knowledgeGroupsUx.enabledPages"),
    pagesText: () => t("knowledgeGroupsUx.pagesText"),
    latestAnalysis: () => t("knowledgeGroupsUx.latestAnalysis"),
    latestPageChange: () => t("knowledgeGroupsUx.latestPageChange"),
    faqs: () => t("knowledgeGroupsUx.faqs"),
    faqsNote: () => t("knowledgeGroupsUx.faqsNote"),
    openFaqs: () => t("knowledgeGroupsUx.openFaqs"),
    enabledFaqs: () => t("knowledgeGroupsUx.enabledFaqs"),
    archived: () => t("knowledgeGroupsUx.archived"),
    sections: () => t("knowledgeGroupsUx.sections"),
    sectionsNote: () => t("knowledgeGroupsUx.sectionsNote"),
    openSections: () => t("knowledgeGroupsUx.openSections"),
    switchedOn: () => t("knowledgeGroupsUx.switchedOn"),
    settings: () => t("knowledgeGroupsUx.settings"),
    settingsNote: () => t("knowledgeGroupsUx.settingsNote"),
    openSettings: () => t("knowledgeGroupsUx.openSettings"),
    accountCreated: () => t("knowledgeGroupsUx.accountCreated"),
    accountModified: () => t("knowledgeGroupsUx.accountModified"),
    dateUnknown: () => t("knowledgeGroupsUx.dateUnknown"),
    pagesOnly: () => t("knowledgeGroupsUx.pagesOnly"),
    upload: () => t("knowledgeGroupsUx.upload"),
    remove: () => t("knowledgeGroupsUx.remove"),
    scope: () => t("knowledgeGroupsUx.scope"),
  });
}
