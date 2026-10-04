import { beforeEach, afterEach, afterAll, describe, it, expect } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { appRouter } from "./routers";
describe.skipIf(!process.env.DATABASE_URL)(
  "account notification workspace on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const api = (actor = owner.userId) =>
      appRouter.createCaller({
        user: { id: actor, role: "user" },
        req: { headers: {} },
        res: {},
      } as any).notifications.workspace;
    const add = async (
      p: { userId?: number; read?: number; link?: string; title?: string } = {}
    ) =>
      Number(
        (
          await q(
            "INSERT INTO notifications(userId,type,title,message,link,isRead,createdAt) VALUES (?,'info',?,'Account message',?,?,'2026-10-04 10:00:00')",
            [
              p.userId ?? owner.userId,
              p.title ?? "Notice",
              p.link ?? "/merchant/dashboard",
              p.read ?? 0,
            ]
          )
        ).insertId
      );
    beforeEach(async () => {
      owner = await createDisposableMerchant("account-notice475");
      other = await createDisposableMerchant("account-notice475-other");
    });
    afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId]));
    afterAll(closeDb);
    it("reads only the signed-in account, independent of the selected tenant", async () => {
      const id = await add();
      await add({ userId: other.userId });
      const data = await api().list({});
      expect(data).toMatchObject({
        actorId: owner.userId,
        scope: "account",
        totals: { total: 1, unread: 1 },
      });
      expect(data.items[0].id).toBe(id);
      expect(await api(other.userId).detail({ id })).toMatchObject({
        state: "missing",
        record: null,
      });
    });
    it("returns stable pages and full search counts without interpreting wildcards", async () => {
      for (let i = 0; i < 52; i++)
        await add({ title: i === 0 ? "100%_notice" : "Notice " + i });
      const first = await api().list({});
      expect(first.items).toHaveLength(25);
      expect(first.totals.total).toBe(52);
      expect(first.hasNext).toBe(true);
      const last = await api().list({ page: 3 });
      expect(last.items).toHaveLength(2);
      expect(last.hasNext).toBe(false);
      expect(new Set([...first.items, ...last.items].map(r => r.id)).size).toBe(
        27
      );
      expect((await api().list({ search: "%_" })).totals.total).toBe(1);
    });
    it("counts read/unread and invalid stored flags distinctly", async () => {
      await add({ read: 0 });
      await add({ read: 1 });
      await add({ read: 2 });
      const data = await api().list({});
      expect(data.totals).toEqual({ total: 3, unread: 1, read: 1, unknown: 1 });
      const unknown = await api().list({ state: "unknown" });
      expect(unknown.items[0].state).toBe("unknown");
      expect(unknown.totals).toEqual({
        total: 1,
        unread: 0,
        read: 0,
        unknown: 1,
      });
      expect(unknown.markAll.unreadCount).toBe(1);
    });
    it("hides external links without modifying stored notifications", async () => {
      const id = await add({ link: "https://private.invalid/?key=secret" });
      const detail = await api().detail({ id });
      expect(detail.record).toMatchObject({
        link: null,
        linkUnavailable: true,
      });
      expect(JSON.stringify(detail)).not.toContain("secret");
      expect(
        (await q("SELECT link FROM notifications WHERE id=?", [id]))[0].link
      ).toContain("secret");
    });
    it("marks a reviewed notification read and verifies idempotence with a fresh revision", async () => {
      const id = await add(),
        before = await api().detail({ id });
      const input = {
        id,
        expectedRevision: before.record!.revision,
        action: "read" as const,
        reviewed: true as const,
      };
      const saved = await api().applyReviewed(input);
      expect(saved).toMatchObject({
        outcome: "read",
        detail: { id, record: { state: "read" } },
      });
      await expect(api().applyReviewed(input)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(
        (
          await api().applyReviewed({
            ...input,
            expectedRevision: saved.detail.record!.revision,
          })
        ).outcome
      ).toBe("already_read");
    });
    it("cannot mutate another account record even with its revision", async () => {
      const id = await add(),
        before = await api().detail({ id });
      for (const action of ["read", "delete"] as const)
        await expect(
          api(other.userId).applyReviewed({
            id,
            expectedRevision: before.record!.revision,
            action,
            reviewed: true,
          })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await api().detail({ id })).record?.state).toBe("unread");
    });
    it("blocks a changed body or link after review", async () => {
      const id = await add(),
        before = await api().detail({ id });
      await q(
        "UPDATE notifications SET message='Changed after review' WHERE id=?",
        [id]
      );
      await expect(
        api().applyReviewed({
          id,
          expectedRevision: before.record!.revision,
          action: "delete",
          reviewed: true,
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await api().detail({ id })).state).toBe("found");
    });
    it("confirms exact deletion and does not claim success for a missing record", async () => {
      const id = await add(),
        before = await api().detail({ id }),
        input = {
          id,
          expectedRevision: before.record!.revision,
          action: "delete" as const,
          reviewed: true as const,
        };
      expect(await api().applyReviewed(input)).toMatchObject({
        outcome: "deleted",
        detail: { actorId: owner.userId, id, state: "missing", record: null },
      });
      await expect(api().applyReviewed(input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
    it("bulk review leaves later arrivals and other accounts unread", async () => {
      const a = await add(),
        b = await add(),
        foreign = await add({ userId: other.userId }),
        review = (await api().list({})).markAll,
        later = await add();
      const result = await api().readAllReviewed({
        throughId: review.throughId!,
        unreadCount: review.unreadCount,
        expectedRevision: review.revision,
        reviewed: true,
      });
      expect(result).toMatchObject({ changed: 2, remainingUnread: 1 });
      const rows = await q(
        "SELECT id,isRead FROM notifications WHERE id IN (?,?,?,?)",
        [a, b, foreign, later]
      );
      expect(rows.find((r: any) => r.id === later).isRead).toBe(0);
      expect(rows.find((r: any) => r.id === foreign).isRead).toBe(0);
    });
    it("rolls back all bulk changes when the reviewed unread set changed", async () => {
      const a = await add(),
        b = await add(),
        review = (await api().list({})).markAll;
      await q("UPDATE notifications SET isRead=1 WHERE id=?", [a]);
      await expect(
        api().readAllReviewed({
          throughId: review.throughId!,
          unreadCount: review.unreadCount,
          expectedRevision: review.revision,
          reviewed: true,
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(
        (await q("SELECT isRead FROM notifications WHERE id=?", [b]))[0].isRead
      ).toBe(0);
    });
    it("rejects forged bulk bounds and foreign-account review proofs", async () => {
      await add();
      await add({ userId: other.userId });
      const review = (await api().list({})).markAll;
      const input = {
        throughId: review.throughId!,
        unreadCount: review.unreadCount,
        expectedRevision: review.revision,
        reviewed: true as const,
      };
      await expect(
        api().readAllReviewed({ ...input, throughId: input.throughId + 1 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        api(other.userId).readAllReviewed(input)
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
    it("serializes two identical bulk actions and rejects the stale second review", async () => {
      await add(); await add(); const review=(await api().list({})).markAll;
      const input={throughId:review.throughId!,unreadCount:review.unreadCount,expectedRevision:review.revision,reviewed:true as const};
      const outcomes=await Promise.allSettled([api().readAllReviewed(input),api().readAllReviewed(input)]);
      expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
      const rejected=outcomes.find(r=>r.status==='rejected');expect(rejected?.status==='rejected'&&rejected.reason.code).toBe('CONFLICT');
      expect((await api().list({})).markAll.unreadCount).toBe(0);
    });
    it("uses active account authority for reads and writes", async () => {
      const id = await add(),
        before = await api().detail({ id });
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        owner.userId,
      ]);
      await expect(api().list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        api().applyReviewed({
          id,
          expectedRevision: before.record!.revision,
          action: "read",
          reviewed: true,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(
        (await q("SELECT isRead FROM notifications WHERE id=?", [id]))[0].isRead
      ).toBe(0);
    });
  }
);
