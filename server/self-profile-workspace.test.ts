import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
import {
  readSelfProfile,
  renameSelfProfile,
  projectSelfProfile,
} from "./accounts/self-profile-workspace";
import {
  selfProfileWorkspace,
  selfProfileRename,
} from "../shared/self-profile-workspace";
const raw = {
  id: 1,
  name: "Local account",
  email: "local@example.test",
  email_verified_at: null,
  account_status: "active",
};
let current: any, tx: any;
const input = () => ({
  name: "New name",
  expectedRevision: projectSelfProfile(1, raw).revision,
});
beforeEach(() => {
  vi.resetAllMocks();
  current = { ...raw };
  tx = {
    query: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn(),
    execute: vi.fn(async (sql: string, args: any[]) => {
      if (sql.startsWith("SELECT")) return [[current]];
      if (sql.startsWith("UPDATE users")) {
        current.name = args[0];
        return [{ affectedRows: 1 }];
      }
      throw Error("Unexpected query");
    }),
  };
  m.pool.mockResolvedValue({ getConnection: async () => tx });
});
it("projects only the current account identity and verification state", () => {
  expect(
    projectSelfProfile(1, { ...raw, password: "private", role: "admin" })
  ).toEqual({
    actorId: 1,
    name: "Local account",
    email: "local@example.test",
    emailVerified: false,
    revision: projectSelfProfile(1, raw).revision,
  });
});
it.each([null, "broken", undefined])(
  "does not invent a valid email from %s",
  email => {
    expect(
      projectSelfProfile(1, { ...raw, email, email_verified_at: new Date() })
    ).toMatchObject({ email: null, emailVerified: null });
  }
);
it.each([null, "", "X", " ".repeat(3)])(
  "marks an invalid name %s without filling a fake one",
  name => {
    expect(projectSelfProfile(1, { ...raw, name }).name).toBeNull();
  }
);
it("keeps malformed verification evidence unknown", () => {
  expect(
    projectSelfProfile(1, { ...raw, email_verified_at: "bad" }).emailVerified
  ).toBeNull();
});
it.each([
  { actorId: 2 },
  { email: "new@example.test" },
  { role: "admin" },
  { name: "x" },
  { name: "x".repeat(121) },
])("rejects injected or invalid rename fields %j", delta => {
  expect(selfProfileRename.safeParse({ ...input(), ...delta }).success).toBe(
    false
  );
});
it("does not allow verification without an email in the shared contract", () => {
  expect(
    selfProfileWorkspace.safeParse({
      ...projectSelfProfile(1, raw),
      email: null,
      emailVerified: true,
    }).success
  ).toBe(false);
});
it("reads without updating", async () => {
  await readSelfProfile(1);
  expect(
    tx.execute.mock.calls.some(([sql]: string[]) => sql.startsWith("UPDATE"))
  ).toBe(false);
});
it("refuses inactive accounts even with a valid actor id", async () => {
  current.account_status = "deletion_pending";
  await expect(renameSelfProfile(1, input())).rejects.toMatchObject({
    reason: "forbidden",
  });
  expect(current.name).toBe(raw.name);
});
it("refuses a missing database", async () => {
  m.pool.mockResolvedValue(null);
  await expect(renameSelfProfile(1, input())).rejects.toMatchObject({
    reason: "unavailable",
  });
});
it("does not overwrite a changed identity snapshot", async () => {
  current.email = "changed@example.test";
  await expect(renameSelfProfile(1, input())).rejects.toMatchObject({
    reason: "stale",
  });
});
it("discards a connection on a lost commit acknowledgement", async () => {
  tx.commit.mockRejectedValue(Error("private"));
  await expect(renameSelfProfile(1, input())).rejects.toMatchObject({
    reason: "unknown",
  });
  expect(tx.destroy).toHaveBeenCalledOnce();
  expect(tx.release).not.toHaveBeenCalled();
  expect(tx.rollback).not.toHaveBeenCalled();
});
it("does not acknowledge a write with unchanged underlying name", async () => {
  const original = tx.execute.getMockImplementation();
  tx.execute.mockImplementation((sql: string, args: any[]) =>
    sql.startsWith("UPDATE")
      ? Promise.resolve([{ affectedRows: 1 }])
      : original(sql, args)
  );
  await expect(renameSelfProfile(1, input())).rejects.toMatchObject({
    reason: "unavailable",
  });
  expect(tx.commit).not.toHaveBeenCalled();
});
