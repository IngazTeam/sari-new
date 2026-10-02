import { appointmentCreationSchema } from "@shared/appointment-creation";
import { appointmentRequestLookupSchema } from "@shared/appointment-request";
import {
  appointmentRequestView,
  appointmentSlotsView,
} from "@shared/appointment-workspace";
export const emptyAppointmentDraft = {
  serviceId: 0,
  staffId: 0,
  appointmentDate: "",
  startTime: "",
  customerPhone: "",
  customerName: "",
  notes: "",
};
export type AppointmentDraft = typeof emptyAppointmentDraft;
export function parseAppointmentDraft(draft: AppointmentDraft) {
  const result = appointmentCreationSchema.safeParse({
    ...draft,
    staffId: draft.staffId || undefined,
    customerName: draft.customerName.trim() || undefined,
    notes: draft.notes || undefined,
  });
  return {
    data: result.success ? result.data : null,
    errors: result.success
      ? {}
      : Object.fromEntries(
          result.error.issues.map(issue => [String(issue.path[0]), true])
        ),
  };
}
export function scopedAppointmentRequest(
  raw: unknown,
  actorId: number,
  merchantId: number,
  requestId: string
) {
  const p = appointmentRequestView.safeParse(raw);
  return p.success &&
    p.data.actorId === actorId &&
    p.data.merchantId === merchantId &&
    p.data.requestId === requestId
    ? p.data
    : null;
}
export function scopedAppointmentSlots(
  raw: unknown,
  actorId: number,
  merchantId: number,
  selection: unknown
) {
  const p = appointmentSlotsView.safeParse(raw);
  return p.success &&
    p.data.actorId === actorId &&
    p.data.merchantId === merchantId &&
    JSON.stringify(p.data.selection) === JSON.stringify(selection)
    ? p.data
    : null;
}
const key = (actorId: number, merchantId: number) =>
  `sari:appointment-request:v1:${actorId}:${merchantId}`;
export function pendingAppointmentRequest(
  storage: Pick<Storage, "getItem">,
  actorId: number,
  merchantId: number
): string | null {
  const raw = storage.getItem(key(actorId, merchantId));
  if (raw === null) return null;
  return appointmentRequestLookupSchema.parse({ requestId: raw }).requestId;
}
export function rememberAppointmentRequest(
  storage: Pick<Storage, "setItem" | "getItem">,
  actorId: number,
  merchantId: number,
  requestId: string
) {
  const id = appointmentRequestLookupSchema.parse({ requestId }).requestId;
  const previous = pendingAppointmentRequest(storage, actorId, merchantId);
  if (previous && previous !== id) throw Error("Pending appointment exists");
  storage.setItem(key(actorId, merchantId), id);
  if (storage.getItem(key(actorId, merchantId)) !== id)
    throw Error("Request could not be retained");
}
export function clearAppointmentRequest(
  storage: Pick<Storage, "getItem" | "removeItem">,
  actorId: number,
  merchantId: number,
  requestId: string
) {
  if (storage.getItem(key(actorId, merchantId)) === requestId)
    storage.removeItem(key(actorId, merchantId));
}
