import {calendlyBookingUrl} from '../../shared/calendly-provider';
import {calendlyBookingLinksSchema} from '../../shared/calendly-booking-links';
import {getIntegrationByType} from '../db';
import {readCalendlyWorkspace} from './calendly-workspace';
import {CalendlyOperationFault} from './calendly-operation';
import {withCalendlyProviderCheckpoint} from './calendly-provider-checkpoint';
import {listCalendlyCollection} from './calendly-api';
/** A live read bound to the same account before, during and after pagination. */
export async function readCalendlyBookingLinks(actorId:number,merchantId:number){
 const source=await readCalendlyWorkspace(actorId,merchantId);
 if(source.state!=='configured'||!source.identityValid||!source.credentialsStored)throw new CalendlyOperationFault('changed');
 const checkpoint=async()=>{const current=await readCalendlyWorkspace(actorId,merchantId);if(current.revision!==source.revision)throw new CalendlyOperationFault('changed');};
 const integration=await getIntegrationByType(merchantId,'calendly');
 if(!integration?.accessToken||integration.storeUrl!==source.userUri)throw new CalendlyOperationFault('changed');
 const rows=await withCalendlyProviderCheckpoint(checkpoint,()=>listCalendlyCollection<Record<string,unknown>>(integration.accessToken!,`/event_types?user=${encodeURIComponent(source.userUri!)}&active=true&count=100`,100));
 await checkpoint();
 return calendlyBookingLinksSchema.parse({actorId,merchantId,revision:source.revision,checkedAt:new Date().toISOString(),rows:rows.map(row=>({name:typeof row.name==='string'?row.name.slice(0,255):null,duration:typeof row.duration==='number'&&Number.isInteger(row.duration)&&row.duration>0&&row.duration<=10080?row.duration:null,schedulingUrl:calendlyBookingUrl(row.scheduling_url)}))});
}
