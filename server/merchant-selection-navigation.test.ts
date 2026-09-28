import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectMerchant } from "../client/src/lib/merchant-selection";
const storage = vi.fn(),
  reload = vi.fn(),
  assign = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("sessionStorage", { setItem: storage });
  vi.stubGlobal("window", { location: { reload, assign } });
});
afterEach(() => vi.unstubAllGlobals());
describe("merchant selection navigation isolation", () => {
  it("keeps an initial deep link using a full reload after recording the only tenant", () => {
    selectMerchant(20, { preservePath: true });
    expect(storage).toHaveBeenCalledWith("sari.selectedMerchant", "20");
    expect(reload).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });
  it("still clears page state and returns home on a deliberate tenant switch", () => {
    selectMerchant(21);
    expect(storage).toHaveBeenCalledWith("sari.selectedMerchant", "21");
    expect(assign).toHaveBeenCalledWith("/merchant/dashboard");
    expect(reload).not.toHaveBeenCalled();
  });
  it("does not navigate if tenant selection fails to persist", () => {
    storage.mockImplementationOnce(() => {
      throw Error("storage blocked");
    });
    expect(() => selectMerchant(20, { preservePath: true })).toThrow();
    expect(reload).not.toHaveBeenCalled();
  });
});
