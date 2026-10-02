import { describe,it,expect } from 'vitest';
import { appointmentSlotsView,appointmentRequestView,appointmentReceiptView } from '../shared/appointment-workspace';
const scope={actorId:7,merchantId:20,checkedAt:'2026-10-02T10:00:00Z'},requestId='d4d3fd6f-bf97-435f-9562-25e527589490';
describe('appointment workspace evidence',()=>{
  const slots={...scope,selection:{serviceId:11,staffId:12,date:'2026-10-20'},slots:['09:00','10:00']};
  const record={...scope,requestId,state:'recorded',appointmentId:31,appointmentStatus:'confirmed',calendarSyncState:'create_unknown'};
  it('preserves uncertainty independently of the recorded appointment',()=>{expect(appointmentRequestView.parse(record)).toMatchObject({state:'recorded',calendarSyncState:'create_unknown'});expect(appointmentReceiptView.parse({...record,success:true,replayed:true})).toMatchObject({success:true,replayed:true,calendarSyncState:'create_unknown'});});
  it('distinguishes missing request from an unavailable recorded appointment',()=>{expect(appointmentRequestView.parse({...scope,requestId,state:'not_found'}).state).toBe('not_found');expect(appointmentRequestView.parse({...scope,requestId,state:'appointment_unavailable',appointmentId:31}).state).toBe('appointment_unavailable');});
  it('allows a verified empty suggestion set without asserting a reservation',()=>{expect(appointmentSlotsView.parse({...slots,slots:[]})).toEqual({...slots,slots:[]});});
  it.each([{actorId:0},{merchantId:20.5},{checkedAt:'invalid'},{selection:{serviceId:11,date:'2026-02-30'}},{slots:['24:00']},{slots:['09:00','09:00']},{slots:Array(1441).fill('09:00')},{credentials:'SECRET'}])('rejects malformed slots %j',patch=>expect(appointmentSlotsView.safeParse({...slots,...patch}).success).toBe(false));
  it.each([{requestId:'bad'},{appointmentId:0},{calendarSyncState:'successful'},{state:'not_found'},{state:'appointment_unavailable'},{credentials:'SECRET'},{checkedAt:null}])('rejects malformed record %j',patch=>expect(appointmentRequestView.safeParse({...record,...patch}).success).toBe(false));
});
