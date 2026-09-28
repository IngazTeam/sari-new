import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db/connection";
import { virtualAgents } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  cleanupDisposableMerchants,
  createDisposableMerchant,
} from "../tests/helpers/disposable-merchant";
import {
  getMerchantVirtualAgent,
  listMerchantVirtualAgents,
} from "./virtual-agent-context";

describe.skipIf(!process.env.DATABASE_URL)(
  "saved persona context tenant isolation in MySQL",
  () => {
    let first: { merchantId: number; userId: number }, second: typeof first;
    let firstId: number, secondId: number;
    beforeEach(async () => {
      first = await createDisposableMerchant("persona-a");
      second = await createDisposableMerchant("persona-b");
      const db = (await getDb())!;
      const base = {
        role: "دعم",
        personalityPrompt: "معرفة خاصة",
        tone: "friendly" as const,
        sortOrder: 0,
      };
      const [a] = await db
        .insert(virtualAgents)
        .values({ ...base, merchantId: first.merchantId, name: "أ" });
      firstId = a.insertId;
      const [b] = await db
        .insert(virtualAgents)
        .values({ ...base, merchantId: second.merchantId, name: "ب" });
      secondId = b.insertId;
    });
    afterEach(async () =>
      cleanupDisposableMerchants(
        [first?.userId, second?.userId].filter(Boolean)
      )
    );
    afterAll(closeDb);
    it("resolves an owned ID and hides the same ID from another tenant", async () => {
      expect(
        await getMerchantVirtualAgent(first.merchantId, firstId)
      ).toMatchObject({ name: "أ", merchantId: first.merchantId });
      expect(
        await getMerchantVirtualAgent(first.merchantId, secondId)
      ).toBeNull();
      expect(
        await getMerchantVirtualAgent(second.merchantId, firstId)
      ).toBeNull();
    });
    it("lists only current saved personas within the tenant in routing order", async () => {
      const db = (await getDb())!;
      const [later] = await db
        .insert(virtualAgents)
        .values({
          merchantId: first.merchantId,
          name: "لاحق",
          role: "مبيعات",
          personalityPrompt: "حفظ",
          sortOrder: 2,
        });
      expect(
        (await listMerchantVirtualAgents(first.merchantId)).map(a => a.id)
      ).toEqual([firstId, later.insertId]);
      await db
        .update(virtualAgents)
        .set({ sortOrder: -1, name: "محفوظ حديثًا" })
        .where(eq(virtualAgents.id, later.insertId));
      const result = await listMerchantVirtualAgents(first.merchantId);
      expect(result.map(a => a.id)).toEqual([later.insertId, firstId]);
      expect(result[0].name).toBe("محفوظ حديثًا");
      expect(result.some(a => a.id === secondId)).toBe(false);
    });
  }
);
