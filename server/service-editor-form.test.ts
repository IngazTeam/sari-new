import {describe,it,expect} from 'vitest';
import {newServiceDraft,parseServiceDraft,serviceDraftFromRecord,serviceRouteId} from '../client/src/lib/service-editor-form';
const draft={...newServiceDraft,name:' Test ',basePrice:'0'};
describe('service editor field contracts',()=>{
 it('preserves exact zero settings and clears optional values explicitly',()=>{expect(parseServiceDraft({...draft,advanceBookingDays:'0',description:' ',category:' '}).value).toMatchObject({basePrice:0,advanceBookingDays:0,description:null,category:null,categoryId:null,maxBookingsPerDay:null,staffIds:[]});});
 it.each(['1.001','-1','12x','1e2','1,000','', '21474836.48'])('rejects price input %s without silently rounding',basePrice=>{expect(parseServiceDraft({...draft,basePrice})).toMatchObject({value:null,errors:{basePrice:'money'}});});
 it('accepts Arabic decimal and digit inputs without changing their precision',()=>{expect(parseServiceDraft({...draft,basePrice:'١٢٫٣٤',durationMinutes:'۴۵'}).value).toMatchObject({basePrice:1234,durationMinutes:45});});
 it.each(['1.5','2x','1e2','-1','', '1440'])('rejects invalid durations %s',durationMinutes=>{expect(parseServiceDraft({...draft,durationMinutes}).errors.durationMinutes).toBeTruthy();});
 it('checks price ranges and clears irrelevant prices',()=>{expect(parseServiceDraft({...draft,priceType:'variable',minPrice:'100',maxPrice:'99'}).errors.maxPrice).toBe('range');expect(parseServiceDraft({...draft,priceType:'custom',basePrice:'bad',minPrice:'-1'}).value).toMatchObject({basePrice:null,minPrice:null,maxPrice:null});});
 it('keeps malformed saved flags and staff selections invalid until explicitly repaired',()=>{expect(parseServiceDraft({...draft,staffIds:null,isActive:null,requiresAppointment:null}).errors).toMatchObject({staffIds:'invalid',isActive:'invalid',requiresAppointment:'invalid'});});
 it('preserves a saved free price during conversion to form strings',()=>{const parsed=parseServiceDraft(draft).value!;const record={entity:'service',fields:parsed} as any;expect(serviceDraftFromRecord(record)).toMatchObject({basePrice:'0.00',maxBookingsPerDay:'',category:'',description:''});});
 it.each(['1x','0','-1','1.5','2147483648','01'])('rejects partial or invalid route ids %s',id=>{expect(serviceRouteId(id)).toBeNull();});
 it('distinguishes creation from a valid edit route',()=>{expect(serviceRouteId(undefined)).toBeUndefined();expect(serviceRouteId('12')).toBe(12);});
});
