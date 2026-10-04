import {
  accountNotificationsInput,
  accountNotificationsWorkspace,
  accountNotificationDetailInput,
  accountNotificationDetail,
  accountNotificationAction,
  accountNotificationActionResult,
  accountNotificationsReadAllInput,
  accountNotificationsReadAllResult,
  accountNotificationRecord,
  type AccountNotificationRecord,
} from "../../../shared/account-notifications-workspace";
import type { ServiceMode } from "./service-preview-model";
export const accountNotificationsQueries = [
  "notifications.workspace.list",
  "notifications.workspace.detail",
] as const;
export const accountNotificationsMutations = [
  "notifications.workspace.applyReviewed",
  "notifications.workspace.readAllReviewed",
] as const;
export class AccountNotificationsPreviewStore {
  writes = 0;
  private rows = new Map<number, AccountNotificationRecord>();
  constructor(
    readonly actorId: number,
    private mode: () => ServiceMode
  ) {
    if (mode() === "empty") return;
    for (let id = 1; id <= 52; id++)
      this.rows.set(
        id,
        accountNotificationRecord.parse({
          id,
          revision: this.revision(id),
          type: mode() === "legacy" ? null : id % 3 === 0 ? "warning" : "info",
          title: `${actorId === 1269 ? "نواة · Nawa" : "مدار · Madar"} · ${id === 52 ? "تحتاج المعرفة إلى مراجعتك · Knowledge needs review" : "تحديث الحساب · Account update"} ${id}`,
          message:
            "هذه عينة توضيحية لإشعار في حسابك. راجع ملفات المعرفة المرفقة وأكمل المعلومات الناقصة قبل اعتمادها.\n\nThis is a sample account notification. Review attached knowledge and fill missing information before approval. " +
            "تفاصيل إضافية · Additional details. ".repeat(id === 52 ? 8 : 1),
          link:
            mode() === "unavailable-reference"
              ? null
              : "/merchant/notifications?notification=" + id,
          linkUnavailable: mode() === "unavailable-reference",
          state:
            mode() === "legacy" ? "unknown" : id % 5 === 0 ? "read" : "unread",
          createdAt:
            mode() === "legacy"
              ? null
              : new Date(Date.UTC(2026, 9, 1, 10, 0, id)).toISOString(),
        })
      );
  }
  private revision(id: number) {
    return [this.actorId, id, this.writes, 476, 0, 0, 0, 0]
      .map(x => x.toString(16).padStart(8, "0"))
      .join("");
  }
  private proof() {
    const rows = Array.from(this.rows.values()),
      throughId = rows.length ? Math.max(...rows.map(r => r.id)) : null,
      unreadCount = rows.filter(r => r.state === "unread").length;
    return {
      throughId,
      unreadCount,
      revision: this.revision((throughId ?? 0) + unreadCount),
    };
  }
  private detail(id: number) {
    return accountNotificationDetail.parse({
      actorId: this.actorId,
      scope: "account",
      id,
      state: this.rows.has(id) ? "found" : "missing",
      record: this.rows.get(id) ?? null,
    });
  }
  read(name: string, input: any) {
    if (name.endsWith(".detail"))
      return this.detail(accountNotificationDetailInput.parse(input).id);
    const filters = accountNotificationsInput.parse(input),
      rows = Array.from(this.rows.values())
        .filter(
          r =>
            (filters.state === "all" || r.state === filters.state) &&
            (!filters.search ||
              [r.title, r.message].some(v =>
                v?.toLowerCase().includes(filters.search.toLowerCase())
              ))
        )
        .sort((a, b) => b.id - a.id);
    return accountNotificationsWorkspace.parse({
      actorId: this.mode() === "foreign" ? this.actorId + 99 : this.actorId,
      scope: "account",
      source: "local_notifications",
      checkedAt: new Date().toISOString(),
      filters,
      totals: {
        total: rows.length,
        unread: rows.filter(r => r.state === "unread").length,
        read: rows.filter(r => r.state === "read").length,
        unknown: rows.filter(r => r.state === "unknown").length,
      },
      markAll: this.proof(),
      items: rows.slice(
        (filters.page - 1) * filters.pageSize,
        filters.page * filters.pageSize
      ),
      hasNext: filters.page * filters.pageSize < rows.length,
    });
  }
  mutate(name: string, input: any) {
    const conflict = () => {
      throw {
        data: { code: "CONFLICT" },
        message: "account_notifications:stale",
      };
    };
    if (this.mode() === "save-conflict") conflict();
    if (name.endsWith(".readAllReviewed")) {
      const p = accountNotificationsReadAllInput.parse(input),
        proof = this.proof();
      if (
        p.expectedRevision !== proof.revision ||
        p.throughId !== proof.throughId ||
        p.unreadCount !== proof.unreadCount
      )
        conflict();
      this.writes++;
      for (const r of Array.from(this.rows.values()))
        if (r.id <= p.throughId && r.state === "unread")
          this.rows.set(r.id, {
            ...r,
            state: "read",
            revision: this.revision(r.id),
          });
      return accountNotificationsReadAllResult.parse({
        actorId: this.actorId,
        scope: "account",
        throughId: p.throughId,
        changed: p.unreadCount,
        remainingUnread: this.proof().unreadCount,
      });
    }
    const p = accountNotificationAction.parse(input),
      r = this.rows.get(p.id);
    if (!r)
      throw {
        data: { code: "NOT_FOUND" },
        message: "account_notifications:missing",
      };
    if (p.expectedRevision !== r.revision) conflict();
    const outcome =
      p.action === "delete"
        ? "deleted"
        : r.state === "read"
          ? "already_read"
          : "read";
    if (outcome !== "already_read") {
      this.writes++;
      if (outcome === "deleted") this.rows.delete(r.id);
      else
        this.rows.set(r.id, {
          ...r,
          state: "read",
          revision: this.revision(r.id),
        });
    }
    return accountNotificationActionResult.parse({
      outcome,
      detail: this.detail(r.id),
    });
  }
}
