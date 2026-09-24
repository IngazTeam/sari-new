import { acceptBookingAgreement } from "../../ai/booking-agreements";
import { closeDb } from "../../db/connection";
const { input, agreementId } = JSON.parse(process.argv[2]);
process.send?.({ phase: "ready" });
process.once("message", async () => {
  try {
    const result = await acceptBookingAgreement(input, agreementId);
    process.send?.({ phase: "done", ok: true, ...result });
  } catch {
    process.send?.({ phase: "done", ok: false });
  } finally {
    await closeDb();
    process.disconnect?.();
  }
});
