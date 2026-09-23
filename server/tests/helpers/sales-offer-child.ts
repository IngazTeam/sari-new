import { generateAutoDiscount } from "../../ai/auto-discount";
import {
  reserveSalesOfferShare,
  beginSalesOfferDispatch,
} from "../../ai/sales-offer-authority";
import { selectSalesDiscounts } from "../../ai/sales-offer-evidence";
import { closeDb, getPool } from "../../db/connection";

const [mode, raw, endpoint] = process.argv.slice(2);
process.send?.({ phase: "ready" });
process.once("message", async () => {
  try {
    const input = JSON.parse(raw);
    let result: unknown;
    if (mode === "issue") result = await generateAutoDiscount(input);
    else {
      const [rows] = await (await getPool())!.execute<any[]>(
        "SELECT *,customer_phone AS customerPhone FROM discount_codes WHERE merchantId=?",
        [input.merchantId]
      );
      const offer = selectSalesDiscounts(rows, {
        merchantId: input.merchantId,
        customerPhone: input.customerPhone,
      })[0];
      const share = offer && (await reserveSalesOfferShare(input, offer));
      if (share && (await beginSalesOfferDispatch(input, share))) {
        const response = await fetch(endpoint, {
          method: "POST",
          body: "synthetic offer",
        });
        if (!response.ok) throw new Error("Synthetic transport failed");
        if (mode === "crash-after-accept") {
          process.send?.({ phase: "accepted" });
          await new Promise(() => {});
        }
      }
    }
    await closeDb();
    process.send?.({ phase: "done", result });
    process.disconnect?.();
  } catch {
    await closeDb();
    process.send?.({ phase: "failed" });
    process.disconnect?.();
    process.exitCode = 1;
  }
});
