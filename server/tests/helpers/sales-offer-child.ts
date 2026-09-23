import { generateAutoDiscount } from "../../ai/auto-discount";
import { executeAction } from "../../ai/action-selector";
import { closeDb } from "../../db/connection";

const [mode, raw, endpoint] = process.argv.slice(2);
process.send?.({ phase: "ready" });
process.once("message", async () => {
  try {
    const input = JSON.parse(raw);
    let result: unknown;
    if (mode === "issue") result = await generateAutoDiscount(input);
    else
      await executeAction({
        ...input,
        action: { type: "offer_discount", reason: "fixture" },
        sendMessage: async () => {
          const response = await fetch(endpoint, {
            method: "POST",
            body: "synthetic offer",
          });
          if (!response.ok) throw new Error("Synthetic transport failed");
          if (mode === "crash-after-accept") {
            process.send?.({ phase: "accepted" });
            await new Promise(() => {});
          }
        },
      });
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
