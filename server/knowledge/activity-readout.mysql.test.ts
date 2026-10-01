import { beforeEach, afterEach, afterAll, describe, it, expect } from "vitest";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { getPool, closeDb } from "../db/connection";
import { readKnowledgeActivity } from "./activity-readout";
describe.skipIf(!process.env.DATABASE_URL)(
  "knowledge activity readonly feed (MySQL)",
  () => {
    const users: number[] = [];
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>;
    const account = async () => {
      const value = await createDisposableMerchant("activity");
      users.push(value.userId);
      return value;
    };
    const query = async (sql: string, args: unknown[] = []): Promise<any> =>
      (await (await getPool())!.execute(sql, args))[0];
    beforeEach(async () => {
      owner = await account();
    });
    afterEach(async () => {
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    const add = async (
      action = "file_uploaded",
      merchantId = owner.merchantId
    ) =>
      Number(
        (
          await query(
            "INSERT INTO sari_activity_log (merchant_id,action_type,description,details,created_at) VALUES (?,?,'Stored description','{malformed legacy payload','2020-01-01 01:02:03')",
            [merchantId, action]
          )
        ).insertId
      );
    it("keeps old records unchanged and does not expose or parse malformed payloads", async () => {
      await add();
      const before = await query(
        "SELECT * FROM sari_activity_log WHERE merchant_id=?",
        [owner.merchantId]
      );
      const first = await readKnowledgeActivity(owner.merchantId, undefined),
        second = await readKnowledgeActivity(owner.merchantId, undefined);
      expect(first).toEqual(second);
      expect(first.total).toBe(1);
      expect(first.items[0]).toMatchObject({
        createdAt: "2020-01-01T01:02:03.000Z",
        details: null,
        description: "Stored description",
      });
      expect(JSON.stringify(first)).not.toContain("malformed");
      expect(
        await query("SELECT * FROM sari_activity_log WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toEqual(before);
    });
    it("orders tied timestamps deterministically and clamps a now-empty high page", async () => {
      const ids = [];
      for (let i = 0; i < 12; i++) ids.push(await add());
      const first = await readKnowledgeActivity(owner.merchantId, {
          page: 1,
          pageSize: 5,
        }),
        last = await readKnowledgeActivity(owner.merchantId, {
          page: 999,
          pageSize: 5,
        });
      expect(first.items.map(r => r.id)).toEqual(ids.slice(7).reverse());
      expect(last.page).toBe(3);
      expect(last.items.map(r => r.id)).toEqual(ids.slice(0, 2).reverse());
      await query(
        "DELETE FROM sari_activity_log WHERE merchant_id=? AND id>?",
        [owner.merchantId, ids[0]]
      );
      expect(
        (
          await readKnowledgeActivity(owner.merchantId, {
            page: 3,
            pageSize: 5,
          })
        ).page
      ).toBe(1);
    });
    it("filters all stored action types exactly and keeps filter options for empty matches", async () => {
      await add("products_deleted");
      await add("website_deleted");
      await add("file_uploaded");
      const selected = await readKnowledgeActivity(owner.merchantId, {
        page: 1,
        pageSize: 5,
        actionType: "products_deleted",
      });
      expect(selected.total).toBe(1);
      expect(selected.actionTypes).toEqual([
        "file_uploaded",
        "products_deleted",
        "website_deleted",
      ]);
      const empty = await readKnowledgeActivity(owner.merchantId, {
        page: 20,
        pageSize: 5,
        actionType: "brain_reset",
      });
      expect(empty).toMatchObject({
        total: 0,
        totalPages: 0,
        page: 1,
        items: [],
      });
      expect(empty.actionTypes).toContain("products_deleted");
      expect(empty.actionTypes).toContain("brain_reset");
    });
    it("isolates both rows and available filters from another merchant", async () => {
      const other = await account();
      await add("private_foreign_action", other.merchantId);
      await add("document_deleted");
      const own = await readKnowledgeActivity(owner.merchantId, undefined);
      expect(own.total).toBe(1);
      expect(own.actionTypes).toEqual(["document_deleted"]);
      expect(
        (
          await readKnowledgeActivity(owner.merchantId, {
            actionType: "private_foreign_action",
          })
        ).items
      ).toEqual([]);
    });
    it("treats quoted and legacy action labels as exact values, never SQL", async () => {
      await add("Legacy Action");
      await add("file_uploaded");
      expect(
        (
          await readKnowledgeActivity(owner.merchantId, {
            actionType: "Legacy Action",
          })
        ).total
      ).toBe(1);
      expect(
        (
          await readKnowledgeActivity(owner.merchantId, {
            actionType: "' OR 1=1",
          })
        ).total
      ).toBe(0);
      expect(
        (await readKnowledgeActivity(owner.merchantId, undefined)).total
      ).toBe(2);
    });
    it("returns an explicit bounded filter list, retaining the selected action beyond the cap", async () => {
      for (let i = 0; i < 202; i++)
        await add("action_" + String(i).padStart(3, "0"));
      const result = await readKnowledgeActivity(owner.merchantId, {
        actionType: "action_201",
      });
      expect(result.actionTypesTruncated).toBe(true);
      expect(result.actionTypes).toHaveLength(201);
      expect(result.actionTypes).toContain("action_201");
      expect(result.total).toBe(1);
    });
  }
);
