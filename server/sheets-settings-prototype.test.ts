import { beforeEach, describe, expect, it } from "vitest";
import {
  SheetsSettingsStore,
  settingsModes,
} from "../prototypes/tenant-dashboard/src/sheets-settings-model";
import { sheetsSetupAttempt, sheetsSetupTabs } from "../shared/sheets-setup";
import { sheetsSettingsView } from "../shared/sheets-settings";
let store: SheetsSettingsStore;
const id = "22222222-2222-4222-8222-222222222222";
const input = () => ({
  requestId: id,
  reviewed: true,
  expectedDigest: store.status().digest,
});
beforeEach(() => {
  store = new SheetsSettingsStore();
});
describe("settings prototype preserves workflow boundaries", () => {
  it("contains 22 scenarios and keeps all well-formed read fixtures on shared contracts", () => {
    expect(Object.keys(settingsModes)).toHaveLength(22);
    for (const mode of Object.keys(
      settingsModes
    ) as (keyof typeof settingsModes)[]) {
      store.setMode(mode);
      if (["forbidden", "session", "readError", "malformed"].includes(mode))
        continue;
      expect(sheetsSettingsView.safeParse(store.status()).success, mode).toBe(
        true
      );
      if (store.read())
        expect(sheetsSetupAttempt.safeParse(store.read()).success, mode).toBe(
          true
        );
    }
  });
  it("requires explicit local account completion and creates all four actual tab templates once", async () => {
    expect(store.starts).toBe(0);
    await store.begin();
    expect(store.status().state).toBe("unlinked");
    store.finishConnect();
    const request = input(),
      r = await store.start(request);
    expect(r?.state).toBe("completed");
    expect(store.starts).toBe(1);
    expect(store.files.get(r!.spreadsheetId!)).toEqual(sheetsSetupTabs);
    expect(await store.start(request)).toEqual(r);
    expect(store.starts).toBe(1);
  });
  it("restores successful lost reply without a second creation", async () => {
    store.setMode("lostReply");
    const request = input();
    await expect(store.start(request)).rejects.toThrow();
    await store.refresh();
    expect(store.read()?.state).toBe("completed");
    expect(store.status().state).toBe("ready");
    expect(await store.start(request)).toEqual(store.read());
    expect(store.starts).toBe(1);
  });
  it("restores a created receipt without writing a file", async () => {
    store.setMode("created");
    const attempt = store.read()!;
    expect((await store.recover({ requestId: attempt.requestId }))?.state).toBe(
      "completed"
    );
    expect(store.status().spreadsheetId).toBe(attempt.spreadsheetId);
    expect(store.starts).toBe(0);
  });
  it.each(["uncertain", "dispatching", "created"] as const)(
    "blocks new creation in %s",
    async mode => {
      store.setMode(mode);
      await expect(store.start(input())).rejects.toThrow();
      expect(store.starts).toBe(0);
    }
  );
  it("requires explicit review and matching attempt for acknowledgement and keeps the old file", async () => {
    store.setMode("detached");
    const a = store.read()!;
    await expect(
      store.acknowledge({ requestId: a.requestId })
    ).rejects.toThrow();
    await expect(
      store.acknowledge({ requestId: id, reviewed: true })
    ).rejects.toThrow();
    const r = await store.acknowledge({
      requestId: a.requestId,
      reviewed: true,
    });
    expect(r?.state).toBe("acknowledged");
    expect(store.files.has(a.spreadsheetId!)).toBe(true);
    expect(store.starts).toBe(0);
  });
  it.each(["forbidden", "session", "readError"] as const)(
    "blocks reads and writes when %s",
    async mode => {
      store.setMode(mode);
      expect(() => store.status()).toThrow();
      expect(() => store.read()).toThrow();
      await expect(store.begin()).rejects.toThrow();
      expect(store.oauth).toBe(0);
    }
  );
  it("rejects missing consent and stale digest before creation", async () => {
    store.setMode("needsDestination");
    await expect(
      store.start({ ...input(), reviewed: false })
    ).rejects.toThrow();
    await expect(
      store.start({ ...input(), expectedDigest: "f".repeat(64) })
    ).rejects.toThrow();
    expect(store.starts).toBe(0);
  });
  it("does not enable reports without a destination", async () => {
    store.setMode("needsDestination");
    await expect(
      store.save({
        expectedDigest: store.status().digest,
        reviewed: true,
        changes: { sendDailyReports: true },
      })
    ).rejects.toThrow();
    expect(store.saves).toBe(0);
  });
  it("exposes saved reports after a lost reply without repeating the save", async () => {
    store.setMode("saveLostReply");
    await expect(
      store.save({
        expectedDigest: store.status().digest,
        reviewed: true,
        changes: { sendDailyReports: true },
      })
    ).rejects.toThrow();
    await store.refresh();
    expect(store.status().reports.sendDailyReports).toBe(true);
    expect(store.saves).toBe(1);
  });
  it("preserves local files when disconnecting and reflects an uncertain reply through a fresh read", async () => {
    store.setMode("disconnectLostReply");
    const count = store.files.size;
    await expect(
      store.disconnect({
        expectedDigest: store.status().digest,
        reviewed: true,
      })
    ).rejects.toThrow();
    expect(store.status()).toMatchObject({
      state: "unlinked",
      reports: {
        sendDailyReports: false,
        sendWeeklyReports: false,
        sendMonthlyReports: false,
      },
    });
    expect(store.files.size).toBe(count);
    expect(store.disconnects).toBe(1);
  });
  it("models a save conflict without accepting the draft and distinguishes an old receipt from current destination", async () => {
    store.setMode("conflict");
    await expect(
      store.save({
        expectedDigest: store.status().digest,
        reviewed: true,
        changes: { sendDailyReports: true },
      })
    ).rejects.toThrow();
    expect(store.saves).toBe(0);
    store.setMode("oldReceipt");
    expect(store.status().spreadsheetId).not.toBe(store.read()?.spreadsheetId);
  });
});
