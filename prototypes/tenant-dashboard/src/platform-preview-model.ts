import {platformIds,platformWorkspaceSchema,type PlatformSummary} from '../../../shared/platform-workspace';
import {sheetsSettingsView} from '../../../shared/sheets-settings';
export const platformSamples=['byaan','salla','zid','woocommerce','conflict','pending','unlinked','byaan-paused','byaan-error','byaan-disabled','byaan-unknown','salla-paused','salla-error','salla-unknown','salla-identity-missing','salla-events-pending'] as const;
export type PlatformSample=typeof platformSamples[number];
export const platformPreviewQueries=['integrations.workspace','sheets.getStatus'] as const;
export const platformPreviewMutations=['integrations.testByaanConnection'] as const;
export function platformPreviewRead(name:string,actorId:number,merchantId:number,now:string,mode:string,sample:PlatformSample) {
  if(name==='sheets.getStatus') {
    const state=mode==='empty'||mode==='unlinked'?'unlinked':mode==='oauth-disabled'?'oauth_disabled':mode==='credentials-invalid'?'credentials_invalid':mode==='destination-missing'?'needs_destination':'ready';
    return sheetsSettingsView.parse({actorId,merchantId,digest:merchantId.toString(16).padStart(64,'0'),hasIntegration:state!=='unlinked',isConnected:state==='ready',oauthReady:mode!=='oauth-disabled',state,...state==='ready'?{spreadsheetId:'local-preview-'+merchantId,lastSync:now}:{},reports:{sendDailyReports:false,sendWeeklyReports:true,sendMonthlyReports:false}});
  }
  if(name!=='integrations.workspace')throw Error('Unmapped integration preview read');
  const empty=mode==='empty'||mode==='unlinked'||sample==='unlinked';
  const platforms:PlatformSummary[]=platformIds.map(platform=>{
    const present=!empty&&(platform===sample||sample.startsWith('salla-')&&platform==='salla'||sample==='conflict'&&['salla','zid','byaan'].includes(platform)||(sample==='pending'||sample.startsWith('byaan-'))&&platform==='byaan');
    const state:PlatformSummary['state']=!present?platform==='shopify'?'unavailable':'unlinked':sample.startsWith('salla-')&&['paused','error','unknown'].includes(sample.slice(6))?sample.slice(6) as PlatformSummary['state']:sample==='pending'?'pending_verification':sample.startsWith('byaan-')?sample.slice(6) as PlatformSummary['state']:sample==='conflict'&&platform==='salla'?'error':'configured';
    return{platform,present,occupiesSlot:present&&state!=='disabled',state,storeUrl:present?`https://${platform}-${merchantId}.example.test/`:null,createdAt:present?now:null,lastSyncAt:present&&sample!=='pending'?now:null,hasSyncErrors:state==='error',legacy:present&&platform==='zid'&&mode==='legacy'};
  });
  const occupied=platforms.filter(p=>p.occupiesSlot).length,source=!empty&&(['byaan','conflict','pending'].includes(sample)||sample.startsWith('byaan-'))?'byaan':empty?'none':sample.startsWith('salla-')?'salla':sample;
  return platformWorkspaceSchema.parse({actorId,merchantId,checkedAt:now,source,platforms,occupied,conflict:occupied>1,stats:{products:empty?0:merchantId===269?601:712,customers:empty?0:merchantId===269?501:612,audience:source==='byaan'?'trainees':'customers'}});
}
export function platformPreviewHealth(actorId:number,merchantId:number,now:string,mode:string,sample:PlatformSample) {
  const data=platformPreviewRead('integrations.workspace',actorId,merchantId,now,mode,sample);
  if(!('platforms' in data))throw Error('Invalid preview');
  const byaan=data.platforms.find(p=>p.platform==='byaan')!;
  return !byaan.present?{success:false,status:'not_connected',message:'Local simulation'}:byaan.state==='pending_verification'?{success:false,status:'pending_verification',message:'Local simulation'}:{success:true,status:'active',message:'Local simulation; no provider request'};
}
