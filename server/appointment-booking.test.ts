import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db/connection", () => ({ getPool: vi.fn() }));
vi.mock("./db/schema-readiness", () => ({ assertRuntimeSchema: vi.fn() }));

import { getPool } from "./db/connection";
import {
  AppointmentConflictError,
  calculateAppointmentEndTime,
  createConfirmedAppointment,
  formatServicePrice,
} from "./appointment-booking";

function connectionWith(conflict = false) {
  const connection = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    destroy: vi.fn(),
    query: vi.fn(),
    execute: vi.fn(async (statement: string) => {
      if (statement.includes("booking_capacity_locks")) return [[]];
      if (statement.includes("FROM bookings")) return [[]];
      if (statement.includes("FROM services")) {
        return [
          [
            {
              id: 11,
              merchant_id: 7,
              name: "استشارة",
              duration_minutes: 45,
              base_price: 12500,
              staff_ids: "[3]",
            },
          ],
        ];
      }
      if (statement.includes("FROM staff_members")) {
        return [[{ id: 3, merchantId: 7, name: "سارة" }]];
      }
      if (statement.includes("FROM appointments"))
        return [conflict ? [{ id: 99 }] : []];
      if (statement.includes("INSERT INTO appointments"))
        return [{ insertId: 42 }];
      throw new Error(`Unexpected SQL: ${statement}`);
    }),
  };
  return connection;
}

describe("atomic appointment booking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calculates the real end time and formats minor-unit service prices", () => {
    expect(calculateAppointmentEndTime("09:30", 45)).toBe("10:15");
    expect(formatServicePrice(12500)).toBe(
      `${new Intl.NumberFormat("ar-SA").format(125)} ريال`
    );
    expect(formatServicePrice(null)).toBe("حسب الطلب");
  });
  it.each([
    ["23:00", 60],
    ["23:45", 30],
    ["25:00", 30],
    ["09:60", 30],
    ["9:30", 30],
    ["09:30", 0],
    ["09:30", 1.5],
  ])("rejects invalid or cross-date intervals %s %s", (start, duration) => {
    expect(() =>
      calculateAppointmentEndTime(String(start), Number(duration))
    ).toThrow();
  });

  it("locks ownership and conflicts before inserting a confirmed appointment", async () => {
    const connection = connectionWith(false);
    vi.mocked(getPool).mockResolvedValue({
      getConnection: async () => connection,
    } as any);

    const result = await createConfirmedAppointment({
      merchantId: 7,
      customerPhone: "966500000000",
      customerName: "عميل",
      serviceId: 11,
      staffId: 3,
      date: "2026-09-01",
      startTime: "09:30",
    });

    expect(result).toMatchObject({ appointmentId: 42, endTime: "10:15" });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO appointments"),
      expect.arrayContaining([7, "966500000000", 11, 3, "09:30", "10:15"])
    );
  });

  it("rolls back instead of double-booking an overlapping slot", async () => {
    const connection = connectionWith(true);
    vi.mocked(getPool).mockResolvedValue({
      getConnection: async () => connection,
    } as any);

    await expect(
      createConfirmedAppointment({
        merchantId: 7,
        customerPhone: "966500000000",
        customerName: "عميل",
        serviceId: 11,
        staffId: 3,
        date: "2026-09-01",
        startTime: "09:30",
      })
    ).rejects.toBeInstanceOf(AppointmentConflictError);

    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.execute).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO appointments"),
      expect.anything()
    );
  });
});
