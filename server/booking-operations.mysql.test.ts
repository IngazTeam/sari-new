import { randomUUID } from "node:crypto";
import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  updateBookingOperation,
  deleteBookingOperation,
  getBookingOperationHistory,
} from "./booking-operations";
import {
  issueCanonicalBookingPaymentLink,
  createDurableBookingCheckout,
} from "./payment/booking-checkout";
import { applyTapOrderPaymentState } from "./payment/order-payment-state";
import * as db from "./db";
import * as tap from "./payment/tap-client";

describe.skipIf(!process.env.DATABASE_URL)(
  "booking operational writes on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      bookingId: number,
      serviceId: number,
      staffId: number,
      foreignStaffId: number;
    const query = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const booking = async () =>
      (await query("SELECT * FROM bookings WHERE id=?", [bookingId]))[0];
    const audits = () =>
      query(
        "SELECT * FROM booking_operation_audits WHERE merchant_id=? AND booking_reference=? ORDER BY id",
        [owner.merchantId, bookingId]
      );
    const input = (patch: any = {}) => ({
      bookingId,
      operationId: randomUUID(),
      expectedStatus: "pending",
      ...patch,
    });
    const update = (patch: any = { status: "confirmed" }) =>
      updateBookingOperation(owner.merchantId, owner.userId, input(patch));
    const remove = (patch: any = {}) =>
      deleteBookingOperation(owner.merchantId, owner.userId, input(patch));
    const issue = () =>
      issueCanonicalBookingPaymentLink({
        merchantId: owner.merchantId,
        bookingId,
        amount: 30000,
        title: "Test booking",
      });
    const checkout = async () => {
      const link = await issue();
      return createDurableBookingCheckout({
        linkId: link.linkId,
        checkoutAttemptId: randomUUID(),
        customerName: "Test Customer",
        customerPhone: "0500987654",
      });
    };
    const settle = async (providerStatus: string) => {
      const [payment] = await query(
        "SELECT * FROM order_payments WHERE booking_id=?",
        [bookingId]
      );
      return applyTapOrderPaymentState({
        paymentId: payment.id,
        tapChargeId: payment.tap_charge_id,
        providerStatus,
        expectedMerchantId: owner.merchantId,
        expectedAmount: 30000,
        expectedCurrency: "SAR",
      });
    };
    const create = (patch: Record<string, unknown> = {}) =>
      db.createBooking({
        merchantId: owner.merchantId,
        serviceId,
        customerPhone: "966500987654",
        bookingDate: "2026-12-20",
        startTime: "10:00",
        endTime: "11:00",
        durationMinutes: 60,
        basePrice: 30000,
        finalPrice: 30000,
        ...patch,
      });
    beforeEach(async () => {
      owner = await createDisposableMerchant("booking-operation");
      other = await createDisposableMerchant("other-operation");
      serviceId = (
        await query(
          "INSERT INTO services (merchant_id,name,duration_minutes,base_price) VALUES (?,'Test service',60,30000)",
          [owner.merchantId]
        )
      ).insertId;
      staffId = (
        await query(
          "INSERT INTO staff_members (merchant_id,name) VALUES (?,'Local staff')",
          [owner.merchantId]
        )
      ).insertId;
      foreignStaffId = (
        await query(
          "INSERT INTO staff_members (merchant_id,name) VALUES (?,'Foreign staff')",
          [other.merchantId]
        )
      ).insertId;
      bookingId = await create();
      vi.spyOn(db, "getMerchantPaymentSettings").mockResolvedValue({
        tapEnabled: 1,
        tapTestMode: 1,
        isVerified: 1,
        tapPublicKey: "pk_test_fixture",
        tapSecretKey: "sk_test_fixture",
      } as any);
      vi.spyOn(tap, "postTapCharge").mockImplementation(async () => ({
        ok: true,
        status: 200,
        body: {
          id: `chg_${randomUUID()}`,
          status: "INITIATED",
          amount: 300,
          currency: "SAR",
          live_mode: false,
          transaction: {
            url: "https://sandbox.payments.tap.company/session/fixture",
            expiry: { period: 30, type: "MINUTE" },
          },
        },
      }));
      vi.spyOn(tap, "retrieveTapCharge").mockRejectedValue(
        Error("Operational changes never contact Tap")
      );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([owner.userId, other.userId]);
    });
    afterAll(closeDb);
    it("returns the real inserted booking id and reads the canonical ORM booking, list and stats", async () => {
      expect(Number.isSafeInteger(bookingId)).toBe(true);
      expect(bookingId).toBeGreaterThan(0);
      expect(await db.getBookingById(bookingId)).toMatchObject({
        merchantId: owner.merchantId,
        status: "pending",
        paymentStatus: "unpaid",
      });
      expect(await db.getBookingsByMerchant(owner.merchantId)).toHaveLength(1);
      expect(await db.getBookingStats(owner.merchantId)).toMatchObject({
        pending: 1,
        totalRevenue: 0,
      });
    });
    it("records operational confirmation without fabricating payment, learning or a provider call", async () => {
      const request = input({
        status: "confirmed",
        notes: "Private customer note",
      });
      await updateBookingOperation(owner.merchantId, owner.userId, request);
      expect(await booking()).toMatchObject({
        status: "confirmed",
        payment_status: "unpaid",
        notes: "Private customer note",
      });
      expect((await booking()).confirmed_at).not.toBeNull();
      expect((await audits())[0]).toMatchObject({
        merchant_id: owner.merchantId,
        booking_reference: bookingId,
        actor_user_id: owner.userId,
        request_id: request.operationId,
        operation: "update",
      });
      expect(JSON.stringify(await audits())).not.toContain(
        "Private customer note"
      );
      expect(JSON.stringify(await audits())).not.toContain("966500987654");
      expect(
        await query("SELECT id FROM ai_purchase_outcomes WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toEqual([]);
      expect(tap.postTapCharge).not.toHaveBeenCalled();
      expect(tap.retrieveTapCharge).not.toHaveBeenCalled();
      expect(
        await getBookingOperationHistory(owner.merchantId, bookingId)
      ).toMatchObject([
        {
          actorUserId: owner.userId,
          beforeStatus: "pending",
          afterStatus: "confirmed",
          changedFields: ["status", "notes"],
        },
      ]);
    });
    it.each(["paid", "refunded", "unpaid"])(
      "rejects direct financial state %s through module and old helper",
      async paymentStatus => {
        await expect(update({ paymentStatus })).rejects.toThrow();
        await expect(
          db.updateBooking(
            bookingId,
            input({ paymentStatus }) as any,
            owner.merchantId,
            owner.userId
          )
        ).rejects.toThrow();
        expect((await booking()).payment_status).toBe("unpaid");
        expect(await audits()).toEqual([]);
      }
    );
    it.each([
      { merchantId: 1 },
      { actorUserId: 1 },
      { basePrice: 1 },
      { finalPrice: 1 },
      { discountAmount: 1 },
      { googleEventId: "fake" },
      { cancelledBy: "customer" },
      { confirmedAt: "2020-01-01" },
    ])("rejects untrusted authority %j", async patch => {
      await expect(update({ ...patch, status: "confirmed" })).rejects.toThrow();
      expect((await booking()).status).toBe("pending");
    });
    it.each(["merchant", "service", "link", "payment"])(
      "does not mutate a cross-tenant %s graph",
      async target => {
        if (target === "merchant") {
          await expect(
            updateBookingOperation(
              other.merchantId,
              other.userId,
              input({ status: "confirmed" })
            )
          ).rejects.toThrow();
          await expect(
            deleteBookingOperation(other.merchantId, other.userId, input())
          ).rejects.toThrow();
        }
        if (target === "service") {
          await query("UPDATE services SET merchant_id=? WHERE id=?", [
            other.merchantId,
            serviceId,
          ]);
          await expect(update()).rejects.toThrow();
        }
        if (target === "link") {
          await issue();
          await query(
            "UPDATE payment_links SET merchant_id=? WHERE booking_id=?",
            [other.merchantId, bookingId]
          );
          await expect(update({ status: "cancelled" })).rejects.toThrow();
        }
        if (target === "payment") {
          await checkout();
          await query(
            "UPDATE order_payments SET merchant_id=? WHERE booking_id=?",
            [other.merchantId, bookingId]
          );
          await expect(update()).rejects.toThrow();
        }
        expect((await booking()).status).toBe("pending");
        expect(await audits()).toEqual([]);
      }
    );
    it.each([
      ["pending", "confirmed"],
      ["pending", "cancelled"],
      ["pending", "no_show"],
      ["confirmed", "in_progress"],
      ["confirmed", "completed"],
      ["confirmed", "cancelled"],
      ["confirmed", "no_show"],
      ["in_progress", "completed"],
      ["in_progress", "cancelled"],
      ["in_progress", "no_show"],
    ])(
      "permits operational transition %s to %s without changing payment",
      async (from, to) => {
        await query("UPDATE bookings SET status=? WHERE id=?", [
          from,
          bookingId,
        ]);
        await update({ expectedStatus: from, status: to });
        expect(await booking()).toMatchObject({
          status: to,
          payment_status: "unpaid",
        });
      }
    );
    it.each([
      ["cancelled", "pending"],
      ["cancelled", "confirmed"],
      ["completed", "pending"],
      ["completed", "confirmed"],
      ["no_show", "confirmed"],
      ["in_progress", "pending"],
      ["confirmed", "pending"],
      ["pending", "completed"],
    ])(
      "blocks operational revival or skipped transition %s to %s",
      async (from, to) => {
        await query("UPDATE bookings SET status=? WHERE id=?", [
          from,
          bookingId,
        ]);
        await expect(
          update({ expectedStatus: from, status: to })
        ).rejects.toThrow();
        expect((await booking()).status).toBe(from);
        expect(await audits()).toEqual([]);
      }
    );
    it("cancels a pending checkout and disables its local link without deleting financial history", async () => {
      await checkout();
      const [payment] = await query(
        "SELECT * FROM order_payments WHERE booking_id=?",
        [bookingId]
      );
      await update({
        status: "cancelled",
        cancellationReason: "Customer requested cancellation",
      });
      expect(await booking()).toMatchObject({
        status: "cancelled",
        payment_status: "unpaid",
        cancelled_by: "merchant",
        cancellation_reason: "Customer requested cancellation",
      });
      expect(
        (
          await query("SELECT * FROM payment_links WHERE booking_id=?", [
            bookingId,
          ])
        )[0]
      ).toMatchObject({ is_active: 0, status: "disabled" });
      expect(
        (
          await query("SELECT * FROM order_payments WHERE booking_id=?", [
            bookingId,
          ])
        )[0]
      ).toEqual(payment);
      expect(
        await query(
          "SELECT id FROM booking_checkout_attempts WHERE booking_id=?",
          [bookingId]
        )
      ).toHaveLength(1);
      await expect(remove({ expectedStatus: "cancelled" })).rejects.toThrow();
    });
    it("settles a late capture after cancellation without reopening or rewriting the cancellation audit", async () => {
      await checkout();
      await update({ status: "cancelled" });
      const audit = await audits();
      await settle("CAPTURED");
      expect(await booking()).toMatchObject({
        status: "cancelled",
        payment_status: "paid",
      });
      expect(await audits()).toEqual(audit);
      expect(
        (
          await query(
            "SELECT is_active FROM payment_links WHERE booking_id=?",
            [bookingId]
          )
        )[0].is_active
      ).toBe(0);
    });
    it("fences an in-flight POST while retaining its eventual result for reconciliation", async () => {
      vi.mocked(tap.postTapCharge).mockImplementationOnce(async () => {
        await update({ status: "cancelled" });
        return {
          ok: true,
          status: 200,
          body: {
            id: "chg_late_fixture",
            status: "INITIATED",
            amount: 300,
            currency: "SAR",
            live_mode: false,
            transaction: {
              url: "https://sandbox.payments.tap.company/session/late",
              expiry: { period: 30, type: "MINUTE" },
            },
          },
        };
      });
      await expect(checkout()).rejects.toThrow();
      expect((await booking()).status).toBe("cancelled");
      expect(
        await query("SELECT id FROM order_payments WHERE booking_id=?", [
          bookingId,
        ])
      ).toHaveLength(1);
    });
    it("never changes captured or refunded payment state through operational notes or cancellation", async () => {
      await checkout();
      await settle("CAPTURED");
      await update({ expectedStatus: "confirmed", status: "cancelled" });
      expect((await booking()).payment_status).toBe("paid");
      await settle("REFUNDED");
      await update({
        expectedStatus: "cancelled",
        notes: "Review the customer request",
      });
      expect((await booking()).payment_status).toBe("refunded");
      await expect(
        update({ expectedStatus: "cancelled", status: "confirmed" })
      ).rejects.toThrow();
    });
    it("deletes only an unused draft, retains its audit, and retries a lost response without another deletion", async () => {
      const request = input();
      await db.deleteBooking(
        bookingId,
        request,
        owner.merchantId,
        owner.userId
      );
      expect(await booking()).toBeUndefined();
      expect(await audits()).toHaveLength(1);
      expect(
        await deleteBookingOperation(owner.merchantId, owner.userId, request)
      ).toMatchObject({ alreadyApplied: true, deleted: true });
      expect(
        await getBookingOperationHistory(owner.merchantId, bookingId)
      ).toMatchObject([
        { operation: "delete", beforeStatus: "pending", afterStatus: null },
      ]);
      await expect(
        getBookingOperationHistory(other.merchantId, bookingId)
      ).rejects.toThrow();
      expect(await audits()).toHaveLength(1);
    });
    it.each([
      "link",
      "failed_payment",
      "unknown_attempt",
      "paid",
      "refunded",
      "confirmed",
      "completed",
      "in_progress",
      "no_show",
      "calendar",
      "historical_confirmation",
      "review",
    ])("preserves bookings with %s history", async kind => {
      if (kind === "link") await issue();
      if (kind === "failed_payment") {
        await checkout();
        await settle("FAILED");
      }
      if (kind === "unknown_attempt") {
        vi.mocked(tap.postTapCharge).mockRejectedValueOnce(Error("lost"));
        await expect(checkout()).rejects.toThrow();
      }
      if (["paid", "refunded"].includes(kind))
        await query("UPDATE bookings SET payment_status=? WHERE id=?", [
          kind,
          bookingId,
        ]);
      if (["confirmed", "completed", "in_progress", "no_show"].includes(kind))
        await query("UPDATE bookings SET status=? WHERE id=?", [
          kind,
          bookingId,
        ]);
      if (kind === "calendar")
        await query(
          "UPDATE bookings SET google_event_id='external-calendar' WHERE id=?",
          [bookingId]
        );
      if (kind === "historical_confirmation")
        await query(
          "UPDATE bookings SET confirmed_at=UTC_TIMESTAMP() WHERE id=?",
          [bookingId]
        );
      if (kind === "review")
        await query(
          "INSERT INTO booking_reviews (merchant_id,booking_id,service_id,customer_phone,overall_rating) VALUES (?,?,?,'966500987654',5)",
          [owner.merchantId, bookingId, serviceId]
        );
      const before = await booking();
      await expect(remove({ expectedStatus: before.status })).rejects.toThrow();
      expect(await booking()).toEqual(before);
      expect(await audits()).toEqual([]);
    });
    it("service deletion continues to deactivate without cascading away booking payments", async () => {
      await checkout();
      await db.deleteService(serviceId);
      expect(
        (
          await query("SELECT is_active FROM services WHERE id=?", [serviceId])
        )[0].is_active
      ).toBe(0);
      expect(await booking()).toBeDefined();
      expect(
        await query(
          "SELECT id FROM booking_checkout_attempts WHERE booking_id=?",
          [bookingId]
        )
      ).toHaveLength(1);
    });
    it("rejects stale state and idempotency-key reuse with another actor or payload", async () => {
      const request = input({ status: "confirmed" });
      await updateBookingOperation(owner.merchantId, owner.userId, request);
      const before = await booking();
      await expect(update({ status: "cancelled" })).rejects.toThrow();
      await expect(
        updateBookingOperation(owner.merchantId, other.userId, request)
      ).rejects.toThrow();
      await expect(
        updateBookingOperation(owner.merchantId, owner.userId, {
          ...request,
          status: "cancelled",
        })
      ).rejects.toThrow();
      expect(
        await updateBookingOperation(owner.merchantId, owner.userId, request)
      ).toMatchObject({ alreadyApplied: true });
      expect(await booking()).toEqual(before);
      expect(await audits()).toHaveLength(1);
    });
    it("serializes double clicks and competing state changes", async () => {
      const request = input({ status: "confirmed" });
      const results = await Promise.all(
        [1, 2, 3].map(() =>
          updateBookingOperation(owner.merchantId, owner.userId, request)
        )
      );
      expect(results.filter(result => !result.alreadyApplied)).toHaveLength(1);
      expect(await audits()).toHaveLength(1);
      const raced = await Promise.allSettled([
        update({ expectedStatus: "confirmed", status: "completed" }),
        update({ expectedStatus: "confirmed", status: "cancelled" }),
      ]);
      expect(
        raced.filter(result => result.status === "fulfilled")
      ).toHaveLength(1);
      expect(await audits()).toHaveLength(2);
    });
    it.each(["update", "delete"])(
      "rolls back %s if its audit cannot be saved",
      async operation => {
        if (operation === "update") await issue();
        const before = await booking();
        const pool = (await getPool())!,
          original = pool.getConnection.bind(pool);
        vi.spyOn(pool, "getConnection").mockImplementation(async () => {
          const c = await original();
          return new Proxy(c, {
            get(target, key) {
              if (key === "execute")
                return async (sql: string, args: any[]) => {
                  if (sql.includes("INSERT INTO booking_operation_audits"))
                    throw Error("storage failure");
                  return target.execute(sql, args);
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        });
        await expect(
          operation === "update" ? update({ status: "cancelled" }) : remove()
        ).rejects.toThrow();
        vi.spyOn(pool, "getConnection").mockRestore();
        expect(await booking()).toEqual(before);
        expect(await audits()).toEqual([]);
        if (operation === "update")
          expect(
            (
              await query(
                "SELECT is_active FROM payment_links WHERE booking_id=?",
                [bookingId]
              )
            )[0].is_active
          ).toBe(1);
      }
    );
    it.each(["update", "delete"])(
      "recovers %s after a lost commit acknowledgement",
      async operation => {
        const request = input(
          operation === "update" ? { status: "confirmed" } : {}
        );
        const pool = (await getPool())!,
          original = pool.getConnection.bind(pool);
        let destroyed = 0;
        vi.spyOn(pool, "getConnection").mockImplementation(async () => {
          const c = await original();
          return new Proxy(c, {
            get(target, key) {
              if (key === "commit")
                return async () => {
                  await target.commit();
                  throw Error("lost acknowledgement");
                };
              if (key === "destroy")
                return () => {
                  destroyed++;
                  target.destroy();
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        });
        const run = () =>
          operation === "update"
            ? updateBookingOperation(owner.merchantId, owner.userId, request)
            : deleteBookingOperation(owner.merchantId, owner.userId, request);
        await expect(run()).rejects.toThrow();
        vi.spyOn(pool, "getConnection").mockRestore();
        expect(destroyed).toBe(1);
        expect(await run()).toMatchObject({ alreadyApplied: true });
        expect(await audits()).toHaveLength(1);
      }
    );
    it("retains bounded notes edits on a closed booking without reopening it", async () => {
      await update({ status: "cancelled" });
      await update({
        expectedStatus: "cancelled",
        notes: "Follow-up for the team",
      });
      expect((await booking()).status).toBe("cancelled");
    });
    it("retains a valid unpaid reschedule and staff assignment without financial side effects", async () => {
      await update({
        bookingDate: "2026-12-21",
        startTime: "12:00",
        endTime: "13:00",
        staffId,
      });
      expect(await booking()).toMatchObject({
        start_time: "12:00",
        end_time: "13:00",
        staff_id: staffId,
        payment_status: "unpaid",
      });
    });
    it.each([
      "foreign_staff",
      "inactive_staff",
      "unassigned_staff",
      "invalid_assignment",
      "duration",
      "linked",
      "calendar",
      "conflict",
      "inactive_service",
    ])("rejects unsafe reschedule: %s", async kind => {
      const patch: any = { startTime: "12:00", endTime: "13:00", staffId };
      if (kind === "foreign_staff") patch.staffId = foreignStaffId;
      if (kind === "inactive_staff")
        await query("UPDATE staff_members SET is_active=0 WHERE id=?", [
          staffId,
        ]);
      if (kind === "unassigned_staff")
        await query("UPDATE services SET staff_ids=? WHERE id=?", [
          JSON.stringify([foreignStaffId]),
          serviceId,
        ]);
      if (kind === "invalid_assignment")
        await query("UPDATE services SET staff_ids='invalid json' WHERE id=?", [
          serviceId,
        ]);
      if (kind === "duration") patch.endTime = "13:30";
      if (kind === "linked") await issue();
      if (kind === "calendar")
        await query(
          "UPDATE bookings SET google_event_id='calendar' WHERE id=?",
          [bookingId]
        );
      if (kind === "inactive_service") await db.deleteService(serviceId);
      if (kind === "conflict") {
        const otherId = await create({ startTime: "12:00", endTime: "13:00" });
        await query(
          "UPDATE bookings SET start_time='12:00',end_time='13:00' WHERE id=?",
          [otherId]
        );
      }
      const before = await booking();
      await expect(update(patch)).rejects.toThrow();
      expect(await booking()).toEqual(before);
      expect(await audits()).toEqual([]);
    });
    it("requires scoped context even when an old helper is called directly", async () => {
      await expect(
        (db.updateBooking as any)(bookingId, { paymentStatus: "paid" })
      ).rejects.toThrow();
      await expect((db.deleteBooking as any)(bookingId)).rejects.toThrow();
      expect(await booking()).toBeDefined();
      expect(await audits()).toEqual([]);
    });
    it("serializes link issuance against deletion without leaving orphaned payment history", async () => {
      const results = await Promise.allSettled([issue(), remove()]);
      expect(
        results.filter(result => result.status === "fulfilled")
      ).toHaveLength(1);
      const retained = await booking(),
        links = await query("SELECT id FROM payment_links WHERE booking_id=?", [
          bookingId,
        ]);
      if (retained) {
        expect(links).toHaveLength(1);
        expect(await audits()).toHaveLength(0);
      } else {
        expect(links).toHaveLength(0);
        expect(await audits()).toHaveLength(1);
      }
    });
    it("retains captured payment when cancellation competes with settlement", async () => {
      await checkout();
      const results = await Promise.allSettled([
        settle("CAPTURED"),
        update({ status: "cancelled" }),
      ]);
      expect(results[0].status).toBe("fulfilled");
      const retained = await booking();
      expect(retained.payment_status).toBe("paid");
      expect(["confirmed", "cancelled"]).toContain(retained.status);
      expect(
        await query(
          "SELECT id FROM order_payments WHERE booking_id=? AND status='captured'",
          [bookingId]
        )
      ).toHaveLength(1);
      expect(await audits()).toHaveLength(
        retained.status === "cancelled" ? 1 : 0
      );
    });
    it("rejects reusing a mutation key against another booking without modifying either record", async () => {
      const request = input({ status: "confirmed" });
      await updateBookingOperation(owner.merchantId, owner.userId, request);
      const anotherId = await create({ bookingDate: "2026-12-21" });
      await expect(
        updateBookingOperation(owner.merchantId, owner.userId, {
          ...request,
          bookingId: anotherId,
        })
      ).rejects.toThrow();
      expect((await booking()).status).toBe("confirmed");
      expect((await db.getBookingById(anotherId))?.status).toBe("pending");
      expect(await audits()).toHaveLength(1);
    });
  }
);
