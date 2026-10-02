export function calendarWorkspaceLabels(
  t: (key: string, options?: any) => string
) {
  const labels = {
    eyebrow: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.eyebrow", options),
    title: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.title", options),
    description: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.description", options),
    refresh: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.refresh", options),
    bookings: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.bookings", options),
    services: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.services", options),
    providers: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.providers", options),
    settings: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.settings", options),
    readOnly: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.readOnly", options),
    total: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.total", options),
    confirmed: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.confirmed", options),
    pending: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.pending", options),
    cancelled: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.cancelled", options),
    completed: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.completed", options),
    no_show: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.no_show", options),
    unknown: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.unknown", options),
    reviewCount: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.reviewCount", options),
    summaryHint: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.summaryHint", options),
    month: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.month", options),
    week: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.week", options),
    day: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.day", options),
    range: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.range", options),
    today: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.today", options),
    previousPeriod: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.previousPeriod", options),
    nextPeriod: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.nextPeriod", options),
    overview: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.overview", options),
    dayHint: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.dayHint", options),
    dayCount: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.dayCount", {
        count: options?.count ?? 0,
      }),
    search: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.search", options),
    searchHint: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.searchHint", options),
    status: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.status", options),
    sync: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.sync", options),
    all: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.all", options),
    none: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.none", options),
    creating: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.creating", options),
    create_unknown: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.create_unknown", options),
    synced: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.synced", options),
    cancelling: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.cancelling", options),
    cancel_unknown: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.cancel_unknown", options),
    legacy: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.legacy", options),
    from: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.from", options),
    to: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.to", options),
    apply: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.apply", options),
    clear: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.clear", options),
    filterError: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.filterError", options),
    results: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.results", { count: options?.count ?? 0 }),
    loadingUpdate: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.loadingUpdate", options),
    empty: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.empty", options),
    emptyHint: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.emptyHint", options),
    outOfRange: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.outOfRange", options),
    first: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.first", options),
    previous: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.previous", options),
    next: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.next", options),
    page: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.page", {
        page: options?.page ?? 1,
        pages: options?.pages ?? 1,
      }),
    view: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.view", options),
    appointmentNumber: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.appointmentNumber", {
        id: options?.id ?? "",
      }),
    customerName: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.customerName", options),
    customerPhone: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.customerPhone", options),
    service: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.service", options),
    staff: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.staff", options),
    date: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.date", options),
    startTime: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.startTime", options),
    endTime: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.endTime", options),
    unavailable: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.unavailable", options),
    notSet: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.notSet", options),
    issues: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.issues", options),
    back: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.back", options),
    details: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.details", options),
    customerSection: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.customerSection", options),
    timeHint: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.timeHint", options),
    notes: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.notes", options),
    cancellationReason: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.cancellationReason", options),
    manage: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.manage", options),
    manageHint: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.manageHint", options),
    cancelReason: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.cancelReason", options),
    cancelAttest: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.cancelAttest", options),
    cancel: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.cancel", options),
    cancellingAction: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.cancellingAction", options),
    cancelledSuccess: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.cancelledSuccess", options),
    uncertain: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.uncertain", options),
    advanced: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.advanced", options),
    storedHint: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.storedHint", options),
    googleEventId: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.googleEventId", options),
    integrationId: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.integrationId", options),
    calendarTargetId: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.calendarTargetId", options),
    eventReference: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.eventReference", options),
    reviewRevision: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.reviewRevision", options),
    reminder24hSent: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.reminder24hSent", options),
    reminder1hSent: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.reminder1hSent", options),
    createdAt: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.createdAt", options),
    updatedAt: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.updatedAt", options),
    yes: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.yes", options),
    no: (options?: Record<string, string | number>) =>
      t("merchantUx.calendarWorkspace.no", options),
  };
  return (
    key: keyof typeof labels,
    options?: Record<string, string | number>
  ) => labels[key](options);
}
