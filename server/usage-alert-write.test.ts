import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ authority: vi.fn(), execute: vi.fn() }));
vi.mock("./accounts/merchant-settings-authority", () => ({
  withMerchantOwnerSettings: m.authority,
}));
import { writeUsageAlert } from "./notifications/usage-alert-write";
const notice = {
  type: "warning" as const,
  title: "Usage sample",
  message: "Synthetic counter",
  link: "/merchant/usage",
};
beforeEach(() => {
  vi.resetAllMocks();
  m.authority.mockImplementation((_owner, _merchant, _write, work) =>
    work({ execute: m.execute })
  );
  m.execute.mockResolvedValue([{ affectedRows: 1, insertId: 51 }]);
});
it("checks live write authority and inserts for the same current owner only", async () => {
  expect(await writeUsageAlert(21, 20, notice)).toBe(51);
  expect(m.authority).toHaveBeenCalledWith(21, 20, true, expect.any(Function));
  expect(m.execute).toHaveBeenCalledWith(
    expect.stringContaining("FROM merchants WHERE id=? AND userId=?"),
    ["warning", "Usage sample", "Synthetic counter", "/merchant/usage", 20, 21]
  );
});
it.each([
  null,
  {},
  { affectedRows: 0, insertId: 51 },
  { affectedRows: 2, insertId: 51 },
  { affectedRows: 1, insertId: 0 },
  { affectedRows: 1, insertId: 1.5 },
  { affectedRows: 1, insertId: 2147483648 },
])("rejects unconfirmed database receipt %j", async ack => {
  m.execute.mockResolvedValue([ack]);
  await expect(writeUsageAlert(21, 20, notice)).rejects.toThrow(
    "usage_alerts:unconfirmed"
  );
  expect(m.execute).toHaveBeenCalledOnce();
});
it("does not write after lost authority or retry an unknown commit", async () => {
  m.authority.mockRejectedValue(Error("Authority unavailable"));
  await expect(writeUsageAlert(21, 20, notice)).rejects.toThrow();
  expect(m.execute).not.toHaveBeenCalled();
  expect(m.authority).toHaveBeenCalledOnce();
});
