import { z } from 'zod';
import { bookingReadId } from './booking-read';
import { serviceBookingTime } from './service-details-workspace';
import { appointmentAvailabilitySchema } from './appointment-creation';
import { appointmentRequestLookupSchema } from './appointment-request';
const scope={actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime()};
export const appointmentSlotsView=z.object({...scope,selection:appointmentAvailabilitySchema,slots:z.array(serviceBookingTime).max(1440)}).strict().refine(v=>new Set(v.slots).size===v.slots.length,'Duplicate appointment slot');
const request={...scope,requestId:appointmentRequestLookupSchema.shape.requestId};
const recorded={...request,state:z.literal('recorded'),appointmentId:bookingReadId,appointmentStatus:z.enum(['pending','confirmed','cancelled','completed','no_show']),calendarSyncState:z.enum(['none','creating','create_unknown','synced','cancelling','cancel_unknown','cancelled','legacy'])};
export const appointmentRequestView=z.discriminatedUnion('state',[
  z.object({...request,state:z.literal('not_found')}).strict(),
  z.object({...request,state:z.literal('appointment_unavailable'),appointmentId:bookingReadId}).strict(),
  z.object(recorded).strict(),
]);
export const appointmentReceiptView=z.object({...recorded,success:z.literal(true),replayed:z.boolean()}).strict();
export type AppointmentRequestView=z.infer<typeof appointmentRequestView>;
export type AppointmentSlotsView=z.infer<typeof appointmentSlotsView>;
