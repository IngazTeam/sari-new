import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readCustomerAnnotations,
  writeCustomerAnnotation,
  readCustomerAnnotationReceipt,
  CustomerAnnotationConflict,
  CustomerAnnotationMissing,
  CustomerAnnotationForbidden,
} from "./customer-annotations";
const key = "966500000074";
describe.skipIf(!process.env.DATABASE_URL)(
  "customer annotations on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, values: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, values))[0];
    const contact = async (merchantId: number, phone = key) =>
      q(
        "INSERT INTO conversations (merchantId,customerPhone,customerName,createdAt,lastMessageAt) VALUES (?,?,'Test contact',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR),UTC_TIMESTAMP())",
        [merchantId, phone]
      );
    const write = (input: any) =>
      writeCustomerAnnotation(owner.merchantId, owner.userId, {
        key,
        requestId: randomUUID(),
        ...input,
      });
    const read = (page = 1, customerKey = key) =>
      readCustomerAnnotations(owner.merchantId, { key: customerKey, page });
    const note = (content = "ملاحظة خاصة") => ({ kind: "note", content });
    beforeEach(async () => {
      owner = await createDisposableMerchant("annotation74");
      other = await createDisposableMerchant("annotation74b");
      await contact(owner.merchantId);
      await contact(other.merchantId);
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("persists notes and versioned tags, and recovers the exact receipt without provider calls", async () => {
      expect(await read()).toMatchObject({
        revision: 0,
        tags: [],
        notes: [],
        pagination: { total: 0 },
      });
      const saved = await write(note("<script>literal</script>\nسطر ثان"));
      const tags = await write({
        kind: "tags",
        tags: ["عميل مهم", "تواصل لاحقًا"],
        expectedRevision: 0,
      });
      expect(tags).toMatchObject({
        revision: 1,
        tags: ["عميل مهم", "تواصل لاحقًا"],
        noteId: null,
      });
      expect(await read()).toMatchObject({
        revision: 1,
        tags: tags.tags,
        notes: [
          {
            id: saved.noteId,
            actorId: owner.userId,
            content: "<script>literal</script>\nسطر ثان",
          },
        ],
      });
      expect(
        await readCustomerAnnotationReceipt(owner.merchantId, owner.userId, {
          requestId: saved.requestId,
        })
      ).toEqual(saved);
      expect(
        await readCustomerAnnotations(other.merchantId, { key })
      ).toMatchObject({ tags: [], notes: [] });
    });
    it("serializes concurrent retries into one note and one receipt", async () => {
      const input = { ...note(), key, requestId: randomUUID() };
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          writeCustomerAnnotation(owner.merchantId, owner.userId, input)
        )
      );
      expect(results.every(result => result.noteId === results[0].noteId)).toBe(
        true
      );
      expect((await read()).pagination.total).toBe(1);
      expect(
        (
          await q(
            "SELECT COUNT(*) total FROM customer_annotation_receipts WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].total
      ).toBe(1);
    });
    it("rejects payload and actor reuse and hides receipts from other tenants", async () => {
      const saved = await write(note());
      await expect(
        write({ ...note("Different"), requestId: saved.requestId })
      ).rejects.toBeInstanceOf(CustomerAnnotationConflict);
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        writeCustomerAnnotation(owner.merchantId, other.userId, {
          ...note(),
          key,
          requestId: saved.requestId,
        })
      ).rejects.toBeInstanceOf(CustomerAnnotationConflict);
      await expect(
        readCustomerAnnotationReceipt(owner.merchantId, other.userId, {
          requestId: saved.requestId,
        })
      ).rejects.toBeInstanceOf(CustomerAnnotationConflict);
      expect(
        await readCustomerAnnotationReceipt(other.merchantId, other.userId, {
          requestId: saved.requestId,
        })
      ).toBeNull();
      expect((await read()).pagination.total).toBe(1);
    });
    it("lets only one concurrent tag replacement use a revision and requires re-reading before clearing", async () => {
      const results = await Promise.allSettled([
        write({ kind: "tags", tags: ["A"], expectedRevision: 0 }),
        write({ kind: "tags", tags: ["B"], expectedRevision: 0 }),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
      expect(
        (results.find(r => r.status === "rejected") as PromiseRejectedResult)
          .reason
      ).toBeInstanceOf(CustomerAnnotationConflict);
      await expect(
        write({ kind: "tags", tags: [], expectedRevision: 0 })
      ).rejects.toBeInstanceOf(CustomerAnnotationConflict);
      await write({ kind: "tags", tags: [], expectedRevision: 1 });
      expect(await read()).toMatchObject({ revision: 2, tags: [] });
    });
    it("rolls back a note if its receipt cannot be stored", async () => {
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      const spy = vi
        .spyOn(pool, "getConnection")
        .mockImplementation(async () => {
          const c = await original();
          return new Proxy(c, {
            get(target, prop) {
              if (prop === "execute")
                return async (statement: string, values: any[]) => {
                  if (
                    statement.startsWith(
                      "INSERT INTO customer_annotation_receipts"
                    )
                  )
                    throw Error("receipt store failed");
                  return target.execute(statement, values);
                };
              const value = Reflect.get(target, prop);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        });
      try {
        await expect(write(note())).rejects.toThrow("receipt store failed");
      } finally {
        spy.mockRestore();
      }
      expect((await read()).pagination.total).toBe(0);
    });
    it("recovers a committed note after acknowledgement loss without duplicating it", async () => {
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool),
        input = { ...note(), key, requestId: randomUUID() };
      let lost = false;
      const spy = vi
        .spyOn(pool, "getConnection")
        .mockImplementation(async () => {
          const c = await original();
          return new Proxy(c, {
            get(target, prop) {
              if (prop === "commit")
                return async () => {
                  await target.commit();
                  lost = true;
                  throw Error("acknowledgement lost");
                };
              const value = Reflect.get(target, prop);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        });
      try {
        await expect(
          writeCustomerAnnotation(owner.merchantId, owner.userId, input)
        ).rejects.toThrow("acknowledgement lost");
      } finally {
        spy.mockRestore();
      }
      expect(lost).toBe(true);
      const recovered = await readCustomerAnnotationReceipt(
        owner.merchantId,
        owner.userId,
        { requestId: input.requestId }
      );
      expect(recovered?.noteId).toBeGreaterThan(0);
      expect(
        await writeCustomerAnnotation(owner.merchantId, owner.userId, input)
      ).toEqual(recovered);
      expect((await read()).pagination.total).toBe(1);
    });
    it("checks current membership and account status inside the write transaction", async () => {
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [owner.merchantId, owner.userId]
      );
      await expect(write(note())).rejects.toBeInstanceOf(
        CustomerAnnotationForbidden
      );
      await q(
        "UPDATE merchant_members SET role='manager',is_active=0 WHERE merchant_id=? AND user_id=?",
        [owner.merchantId, owner.userId]
      );
      await expect(write(note())).rejects.toBeInstanceOf(
        CustomerAnnotationForbidden
      );
      await q(
        "UPDATE merchant_members SET is_active=1 WHERE merchant_id=? AND user_id=?",
        [owner.merchantId, owner.userId]
      );
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        owner.userId,
      ]);
      await expect(write(note())).rejects.toBeInstanceOf(
        CustomerAnnotationForbidden
      );
      expect((await read()).pagination.total).toBe(0);
    });
    it("paginates notes, rejects absent identities, and keeps case-sensitive group keys apart", async () => {
      for (let i = 0; i < 26; i++) await write(note(String(i)));
      expect((await read()).notes).toHaveLength(25);
      expect((await read(2)).notes).toHaveLength(1);
      expect((await read(2)).pagination.total).toBe(26);
      await expect(write({ ...note(), key: "missing" })).rejects.toBeInstanceOf(
        CustomerAnnotationMissing
      );
      for (const phone of ["group_A", "group_a"]) {
        await contact(owner.merchantId, phone);
        await write({
          key: phone,
          kind: "tags",
          tags: [phone],
          expectedRevision: 0,
        });
      }
      expect((await read(1, "group_A")).tags).toEqual(["group_A"]);
      expect((await read(1, "group_a")).tags).toEqual(["group_a"]);
    });
  }
);
