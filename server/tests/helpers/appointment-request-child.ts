import { reserveCalendarAppointmentRequest } from "../../appointment-creation-requests";
import { closeDb } from "../../db/connection";
const { input, identity } = JSON.parse(process.argv[2]);
process.send?.({ phase: "ready" });
process.once("message", async () => {
  try {
    const result = await reserveCalendarAppointmentRequest(input, identity);
    process.send?.({
      phase: "done",
      ok: true,
      kind: result.kind,
      id:
        result.kind === "new"
          ? result.reservation.appointmentId
          : result.result.appointmentId,
    });
  } catch {
    process.send?.({ phase: "done", ok: false });
  } finally {
    await closeDb();
    process.disconnect?.();
  }
});
