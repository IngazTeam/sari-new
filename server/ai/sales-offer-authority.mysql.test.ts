import { fork, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { generateAutoDiscount } from "./auto-discount";
import { executeAction } from "./action-selector";
import { selectSalesDiscounts } from "./sales-offer-evidence";
import {
  reserveSalesOfferShare,
  beginSalesOfferDispatch,
  finishSalesOfferDispatch,
  type SalesOfferIdentity,
} from "./sales-offer-authority";

describe.skipIf(!process.env.DATABASE_URL)(
  "durable sales offer authority on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    let input: SalesOfferIdentity & { customerMessage: string };
    const phone = "966550123456";
    const children: ChildProcess[] = [];
    const provider = createServer((req, res) => {
      req.resume();
      received++;
      res.end("accepted");
    });
    let received = 0;
    const query = async (sql: string, values: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, values))[0];
    const request = async (
      merchantId: number,
      customerPhone = phone,
      content = "ممكن خصم؟"
    ) => {
      const c = await query(
        "INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)",
        [merchantId, customerPhone]
      );
      const m = await query(
        "INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming',?)",
        [c.insertId, content]
      );
      return {
        merchantId,
        customerPhone,
        conversationId: Number(c.insertId),
        incomingMessageId: Number(m.insertId),
        customerMessage: content,
      };
    };
    const coupon = async (merchantId = owner.merchantId, customer = phone) => {
      const r = await query(
        `INSERT INTO discount_codes (merchantId,code,type,value,maxUses,customer_phone)
      VALUES (?,'OWNED10','percentage',10,1,?)`,
        [merchantId, customer]
      );
      return Number(r.insertId);
    };
    const offer = async (id: number) => {
      const rows = await query(
        "SELECT *,customer_phone AS customerPhone FROM discount_codes WHERE id=?",
        [id]
      );
      return selectSalesDiscounts(rows, {
        merchantId: owner.merchantId,
        customerPhone: phone,
      })[0];
    };
    const action = (
      request = input,
      send = vi.fn().mockResolvedValue(undefined)
    ) =>
      executeAction({
        ...request,
        action: { type: "offer_discount", reason: "fixture" },
        sendMessage: send,
      });
    beforeEach(async () => {
      owner = await createDisposableMerchant("offer-ledger");
      other = await createDisposableMerchant("other-ledger");
      input = await request(owner.merchantId);
      await query(
        `INSERT INTO bot_settings (merchant_id,auto_discount_enabled,auto_discount_max_percent,auto_discount_expire_hours)
      VALUES (?,1,3,24)`,
        [owner.merchantId]
      );
      received = 0;
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      for (const child of children.splice(0))
        if (child.exitCode === null && child.signalCode === null) {
          const stopped = new Promise<void>(done =>
            child.once("exit", () => done())
          );
          child.kill("SIGKILL");
          await stopped;
        }
      if (provider.listening)
        await new Promise<void>(done => provider.close(() => done()));
      await cleanupDisposableMerchants([owner.userId, other.userId]);
    });
    afterAll(closeDb);
    function startChild(mode: string, data: typeof input, endpoint = "") {
      const child = fork(
        resolve("server/tests/helpers/sales-offer-child.ts"),
        [mode, JSON.stringify(data), endpoint],
        {
          execArgv: ["--import", "tsx"],
          stdio: ["ignore", "ignore", "pipe", "ipc"],
          windowsHide: true,
        }
      );
      children.push(child);
      const events = new Map<string, any>(),
        listeners = new Map<string, (v: any) => void>();
      child.on("message", (event: any) => {
        events.set(event.phase, event);
        listeners.get(event.phase)?.(event);
      });
      const phase = (name: string) =>
        events.has(name)
          ? Promise.resolve(events.get(name))
          : new Promise<any>((done, reject) => {
              const timer = setTimeout(
                () => reject(new Error(`Worker did not reach ${name}`)),
                25000
              );
              listeners.set(name, result => {
                clearTimeout(timer);
                done(result);
              });
              child.once("error", error => {
                clearTimeout(timer);
                reject(error);
              });
            });
      return { child, phase };
    }
    it("issues only once across four real processes, phone formats and conversations", async () => {
      const inputs = await Promise.all(
        [phone, "+966550123456", "0550123456", phone + "@c.us"].map(p =>
          request(owner.merchantId, p)
        )
      );
      const workers = inputs.map(i => startChild("issue", i));
      await Promise.all(workers.map(w => w.phase("ready")));
      workers.forEach(w => w.child.send("run"));
      const results = await Promise.all(workers.map(w => w.phase("done")));
      expect(results.filter(r => r.result)).toHaveLength(1);
      expect(
        await query("SELECT id FROM discount_codes WHERE merchantId=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
      expect(
        await query(
          "SELECT customer_phone,state FROM sales_offer_attempts WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toEqual([{ customer_phone: phone, state: "issued" }]);
    }, 60000);
    it("commits issuance and its limit together, respects the current ceiling, and survives deletion/reconnection", async () => {
      expect(await generateAutoDiscount(input)).toMatchObject({ value: 3 });
      await query("DELETE FROM discount_codes WHERE merchantId=?", [
        owner.merchantId,
      ]);
      await closeDb();
      expect(
        await generateAutoDiscount(await request(owner.merchantId))
      ).toBeNull();
      expect(
        await query("SELECT id FROM sales_offer_attempts WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
    });
    it("honours the rolling 24-hour boundary but never reissues the same source", async () => {
      expect(await generateAutoDiscount(input)).not.toBeNull();
      await query("DELETE FROM discount_codes WHERE merchantId=?", [
        owner.merchantId,
      ]);
      await query(
        "UPDATE sales_offer_limits SET last_issued_at=TIMESTAMPADD(HOUR,-25,UTC_TIMESTAMP(3)) WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(await generateAutoDiscount(input)).toBeNull();
      expect(
        await generateAutoDiscount(await request(owner.merchantId))
      ).not.toBeNull();
    });
    it("honours recent pre-migration codes even when exhausted or deactivated", async () => {
      await query(
        `INSERT INTO discount_codes (merchantId,code,type,value,maxUses,usedCount,isActive,is_auto_generated,customer_phone)
      VALUES (?,'LEGACY','percentage',3,1,1,0,'1','+966550123456')`,
        [owner.merchantId]
      );
      expect(await generateAutoDiscount(input)).toBeNull();
    });
    it("uses saved customer text, not a forged claim of stronger objection", async () => {
      await query(
        "UPDATE bot_settings SET auto_discount_max_percent=20 WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(
        await generateAutoDiscount({
          ...input,
          customerMessage: "بروح لغيركم لو ما فيه خصم",
        })
      ).toMatchObject({ value: 5 });
    });
    it.each([
      "merchant",
      "customer",
      "source",
      "outgoing",
      "refusal",
      "newer",
      "takeover",
      "handoff",
      "group",
    ])(
      "rejects forged or stale authority before issuance: %s",
      async attack => {
        const data = { ...input };
        if (attack === "merchant") data.merchantId = other.merchantId;
        if (attack === "customer") data.customerPhone = "966500000099";
        if (attack === "source")
          data.incomingMessageId = (
            await request(other.merchantId)
          ).incomingMessageId;
        if (attack === "outgoing")
          await query("UPDATE messages SET direction='outgoing' WHERE id=?", [
            data.incomingMessageId,
          ]);
        if (attack === "refusal")
          await query(
            "UPDATE messages SET content='لا أريد الشراء ولو بخصم' WHERE id=?",
            [data.incomingMessageId]
          );
        if (attack === "newer")
          await query(
            "INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','غيرت رأيي')",
            [data.conversationId]
          );
        if (attack === "takeover")
          await query("UPDATE conversations SET human_takeover=1 WHERE id=?", [
            data.conversationId,
          ]);
        if (attack === "handoff")
          await query(
            "UPDATE conversations SET automation_after_message_id=? WHERE id=?",
            [data.incomingMessageId, data.conversationId]
          );
        if (attack === "group") data.customerPhone = phone + "@g.us";
        expect(await generateAutoDiscount(data)).toBeNull();
        expect(
          await query("SELECT id FROM discount_codes WHERE merchantId=?", [
            owner.merchantId,
          ])
        ).toHaveLength(0);
      }
    );
    it("rolls the coupon back when recording its attempt fails", async () => {
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const connection = await original(),
          execute = connection.execute.bind(connection);
        connection.execute = ((sql: any, ...args: any[]) =>
          String(sql).startsWith("INSERT INTO sales_offer_attempts")
            ? Promise.reject(new Error("fixture record failure"))
            : (execute as any)(sql, ...args)) as any;
        const release = connection.release.bind(connection);
        connection.release = () => {
          connection.execute = execute as any;
          connection.release = release;
          release();
        };
        return connection;
      });
      expect(await generateAutoDiscount(input)).toBeNull();
      vi.restoreAllMocks();
      expect(
        await query("SELECT id FROM discount_codes WHERE merchantId=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
      expect(await generateAutoDiscount(input)).not.toBeNull();
    });
    it("does not issue twice when commit succeeded but its acknowledgement was lost", async () => {
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const connection = await original(),
          commit = connection.commit.bind(connection),
          release = connection.release.bind(connection);
        connection.commit = async () => {
          await commit();
          throw new Error("lost commit acknowledgement");
        };
        connection.release = () => {
          connection.commit = commit;
          connection.release = release;
          release();
        };
        return connection;
      });
      expect(await generateAutoDiscount(input)).toBeNull();
      vi.restoreAllMocks();
      expect(
        await query("SELECT id FROM discount_codes WHERE merchantId=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
      await closeDb();
      expect(await generateAutoDiscount(input)).toBeNull();
      expect(
        await query("SELECT id FROM discount_codes WHERE merchantId=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
    });
    it("does not select a permissive policy when duplicate merchant settings disagree", async () => {
      await query(
        "INSERT INTO bot_settings (merchant_id,auto_discount_enabled) VALUES (?,0)",
        [owner.merchantId]
      );
      expect(await generateAutoDiscount(input)).toBeNull();
      expect(
        await query("SELECT id FROM discount_codes WHERE merchantId=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
    });
    it("isolates issuance and sharing limits by merchant", async () => {
      await query(
        "INSERT INTO bot_settings (merchant_id,auto_discount_enabled) VALUES (?,1)",
        [other.merchantId]
      );
      const another = await request(other.merchantId);
      expect(await generateAutoDiscount(input)).not.toBeNull();
      expect(await generateAutoDiscount(another)).not.toBeNull();
      const send = vi.fn().mockResolvedValue(undefined);
      await action(input, send);
      await action(another, send);
      expect(send).toHaveBeenCalledTimes(2);
    });
    it("does not replay after transport succeeded and saving its confirmation failed", async () => {
      await coupon();
      const pool = (await getPool())!,
        execute = pool.execute.bind(pool),
        send = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(pool, "execute").mockImplementation(((
        sql: any,
        values: any[]
      ) =>
        String(sql).includes("UPDATE sales_offer_attempts SET state=?") &&
        values[0] === "accepted"
          ? Promise.reject(new Error("confirmation unavailable"))
          : (execute as any)(sql, values)) as any);
      await expect(action(input, send)).rejects.toThrow(
        "confirmation unavailable"
      );
      vi.restoreAllMocks();
      expect(
        (
          await query(
            "SELECT state FROM sales_offer_attempts WHERE merchant_id=? AND kind='share'",
            [owner.merchantId]
          )
        )[0].state
      ).toBe("unknown");
      await closeDb();
      await action(input, send);
      expect(send).toHaveBeenCalledTimes(1);
    });
    it("shares only once across concurrent conversations and preserves the canonical recipient and code usage", async () => {
      const id = await coupon(),
        send = vi.fn().mockResolvedValue(undefined);
      const inputs = await Promise.all(
        [phone, "+966550123456", "0550123456", phone + "@c.us"].map(p =>
          request(owner.merchantId, p)
        )
      );
      await Promise.all(inputs.map(i => action(i, send)));
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toBe(phone);
      expect(
        (
          await query("SELECT usedCount FROM discount_codes WHERE id=?", [id])
        )[0].usedCount
      ).toBe(0);
      expect(
        await query(
          "SELECT state FROM sales_offer_attempts WHERE merchant_id=? AND kind='share'",
          [owner.merchantId]
        )
      ).toEqual([{ state: "accepted" }]);
    });
    it("does not reset sharing after source/conversation deletion or restart", async () => {
      await coupon();
      await action();
      await query("DELETE FROM conversations WHERE id=?", [
        input.conversationId,
      ]);
      await closeDb();
      const send = vi.fn();
      await action(await request(owner.merchantId), send);
      expect(send).not.toHaveBeenCalled();
    });
    it("requires a real incoming source to share even a public offer", async () => {
      await coupon();
      const send = vi.fn();
      await expect(
        action({ ...input, incomingMessageId: undefined } as any, send)
      ).rejects.toThrow("incoming source");
      expect(send).not.toHaveBeenCalled();
    });
    it("holds the hourly slot and source fence after a timeout and a new process connection", async () => {
      await coupon();
      const send = vi
        .fn()
        .mockRejectedValue(new Error("timeout after acceptance"));
      await expect(action(input, send)).rejects.toThrow("timeout");
      await closeDb();
      await action(input, send);
      expect(send).toHaveBeenCalledTimes(1);
      expect(
        (
          await query(
            "SELECT state FROM sales_offer_attempts WHERE merchant_id=? AND kind='share'",
            [owner.merchantId]
          )
        )[0].state
      ).toBe("unknown");
      await query(
        "UPDATE sales_offer_limits SET last_share_at=TIMESTAMPADD(HOUR,-2,UTC_TIMESTAMP(3)) WHERE merchant_id=?",
        [owner.merchantId]
      );
      await action(input, send);
      expect(send).toHaveBeenCalledTimes(1);
      const next = vi.fn().mockResolvedValue(undefined);
      await action(await request(owner.merchantId), next);
      expect(next).toHaveBeenCalledTimes(1);
    });
    it.each([
      "disabled",
      "expired",
      "exhausted",
      "amount",
      "customer",
      "text",
      "newer",
      "takeover",
    ])(
      "rechecks immediately before transport and cancels changed authority: %s",
      async change => {
        const id = await coupon(),
          share = (await reserveSalesOfferShare(input, await offer(id)))!;
        expect(share).not.toBeNull();
        if (change === "disabled")
          await query("UPDATE discount_codes SET isActive=0 WHERE id=?", [id]);
        if (change === "expired")
          await query(
            "UPDATE discount_codes SET expiresAt=UTC_TIMESTAMP() WHERE id=?",
            [id]
          );
        if (change === "exhausted")
          await query("UPDATE discount_codes SET usedCount=1 WHERE id=?", [id]);
        if (change === "amount")
          await query("UPDATE discount_codes SET value=20 WHERE id=?", [id]);
        if (change === "customer")
          await query(
            "UPDATE discount_codes SET customer_phone='966500000099' WHERE id=?",
            [id]
          );
        if (change === "text") share.text += " forged";
        if (change === "newer")
          await query(
            "INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','لا أريد')",
            [input.conversationId]
          );
        if (change === "takeover")
          await query("UPDATE conversations SET human_takeover=1 WHERE id=?", [
            input.conversationId,
          ]);
        const began = await beginSalesOfferDispatch(input, share).catch(
          () => false
        );
        expect(began).toBe(false);
        expect(
          (
            await query("SELECT state FROM sales_offer_attempts WHERE id=?", [
              share.id,
            ])
          )[0].state
        ).toBe("cancelled");
      }
    );
    it("allows only one transport transition and rejects cross-tenant completion", async () => {
      const id = await coupon(),
        share = (await reserveSalesOfferShare(input, await offer(id)))!;
      expect(
        (
          await Promise.all([
            beginSalesOfferDispatch(input, share),
            beginSalesOfferDispatch(input, share),
          ])
        ).sort()
      ).toEqual([false, true]);
      await expect(
        finishSalesOfferDispatch(
          { ...input, merchantId: other.merchantId },
          share.id,
          "accepted"
        )
      ).rejects.toThrow("requires review");
      expect(
        (
          await query("SELECT state FROM sales_offer_attempts WHERE id=?", [
            share.id,
          ])
        )[0].state
      ).toBe("dispatching");
    });
    it("cancels an aged reservation rather than sending it alongside a fresh hourly slot", async () => {
      const id = await coupon(),
        share = (await reserveSalesOfferShare(input, await offer(id)))!;
      await query(
        "UPDATE sales_offer_attempts SET created_at=TIMESTAMPADD(MINUTE,-3,UTC_TIMESTAMP(3)) WHERE id=?",
        [share.id]
      );
      expect(await beginSalesOfferDispatch(input, share)).toBe(false);
      expect(
        (
          await query("SELECT state FROM sales_offer_attempts WHERE id=?", [
            share.id,
          ])
        )[0].state
      ).toBe("cancelled");
      expect(await reserveSalesOfferShare(input, await offer(id))).toBeNull();
    });
    it("rejects a coupon which expires while its row is locked by another connection", async () => {
      const id = await coupon();
      await query(
        "UPDATE discount_codes SET expiresAt=TIMESTAMPADD(SECOND,2,UTC_TIMESTAMP()) WHERE id=?",
        [id]
      );
      const expected = await offer(id),
        connection = await (await getPool())!.getConnection();
      await connection.beginTransaction();
      await connection.execute(
        "SELECT id FROM discount_codes WHERE id=? FOR UPDATE",
        [id]
      );
      let completed = false;
      const reserved = reserveSalesOfferShare(input, expected).finally(() => {
        completed = true;
      });
      try {
        await connection.query("SELECT SLEEP(2.1)");
        expect(completed).toBe(false);
        await connection.commit();
        expect(await reserved).toBeNull();
      } finally {
        await connection.rollback();
        connection.release();
        await reserved;
      }
    });
    it("retains a dispatching attempt after a real worker dies after local provider acceptance, without replay", async () => {
      await coupon();
      await new Promise<void>(done => provider.listen(0, "127.0.0.1", done));
      const worker = startChild(
        "crash-after-accept",
        input,
        `http://127.0.0.1:${(provider.address() as any).port}`
      );
      await worker.phase("ready");
      worker.child.send("run");
      await worker.phase("accepted");
      const stopped = new Promise<void>(done =>
        worker.child.once("exit", () => done())
      );
      worker.child.kill("SIGKILL");
      await stopped;
      expect(received).toBe(1);
      expect(
        (
          await query(
            "SELECT state FROM sales_offer_attempts WHERE merchant_id=? AND kind='share'",
            [owner.merchantId]
          )
        )[0].state
      ).toBe("dispatching");
      await action(
        input,
        vi.fn().mockImplementation(() => {
          throw new Error("must not replay");
        })
      );
      expect(received).toBe(1);
    }, 60000);
  }
);
