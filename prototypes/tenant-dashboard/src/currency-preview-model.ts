import {
  currencySave,
  currencyWorkspace,
  type CurrencyWorkspace,
} from "../../../shared/currency-workspace";
import type { ServiceMode } from "./service-preview-model";
export class CurrencyPreviewStore {
  writes = 0;
  private value: CurrencyWorkspace["currency"] = "SAR";
  constructor(
    readonly actorId: number,
    readonly merchantId: number,
    private mode: () => ServiceMode
  ) {
    if (mode() === "legacy") this.value = null;
  }
  read() {
    return currencyWorkspace.parse({
      actorId: this.actorId,
      merchantId: this.merchantId,
      canManage: this.mode() !== "readonly",
      currency: this.value,
      revision: [
        this.actorId,
        this.merchantId,
        this.value === "SAR" ? 1 : this.value === "USD" ? 2 : 0,
        0,
        0,
        0,
        0,
        0,
      ]
        .map(n => n.toString(16).padStart(8, "0"))
        .join(""),
      convertsAmounts: false,
    });
  }
  mutate(input: unknown) {
    const parsed = currencySave.parse(input),
      before = this.read();
    if (!before.canManage) throw { data: { code: "FORBIDDEN" } };
    if (before.revision !== parsed.expectedRevision)
      throw { data: { code: "CONFLICT" } };
    const changed = this.value !== parsed.currency;
    if (changed) {
      this.value = parsed.currency;
      this.writes++;
    }
    return { changed, workspace: this.read() };
  }
}
