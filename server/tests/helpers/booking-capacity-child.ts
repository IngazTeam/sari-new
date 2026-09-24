import {
  createAtomicBooking,
  withBookingCapacityTransaction,
} from "../../booking-capacity";
import { closeDb } from "../../db/connection";
const [mode, json] = process.argv.slice(2),
  input = JSON.parse(json);
process.send?.({ phase: "ready" });
process.once("message", async () => {
  try {
    if (mode === "hold")
      await withBookingCapacityTransaction(
        input.merchantId,
        async connection => {
          await connection.execute(
            `INSERT INTO bookings (merchant_id,service_id,customer_phone,booking_date,start_time,end_time,duration_minutes,base_price,final_price) VALUES (?,?,?,?,'10:00','11:00',60,10000,10000)`,
            [
              input.merchantId,
              input.serviceId,
              input.customerPhone,
              input.bookingDate,
            ]
          );
          process.send?.({ phase: "holding" });
          await new Promise<void>(resolve =>
            process.once("message", () => resolve())
          );
        }
      );
    else {
      const id = await createAtomicBooking(input);
      process.send?.({ phase: "done", ok: true, id });
    }
  } catch {
    process.send?.({ phase: "done", ok: false });
  } finally {
    await closeDb();
    process.disconnect?.();
  }
});
