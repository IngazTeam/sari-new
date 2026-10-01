import {campaignReportExportSchema,type CampaignReportExport} from '@shared/campaign-report';

type Row=CampaignReportExport['rows'][number];
const formulaPrefix=new RegExp('^[\\s\\p{Cf}]*[=+@-]','u');
export type CampaignReportCsvLabels={
  phone:string;name:string;status:string;reason:string;recordedAt:string;attempts:string;quotaHeld:string;acceptedAt:string;yes:string;no:string;
  statusLabel:(status:Row['status'])=>string;
  reasonLabel:(reason:Row['reason'])=>string;
};

/** Quote every cell and neutralize spreadsheet formulas, including formulas
 * behind control/formatting characters. Keep phone numbers as text. */
export function campaignCsvCell(value:string,phone=false):string{
  let text=value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
  if(phone&&text!==''||formulaPrefix.test(text)||/^[\t\r\n]/.test(text))text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
export function campaignReportCsv(raw:unknown,labels:CampaignReportCsvLabels):string{
  const snapshot=campaignReportExportSchema.parse(raw),recipient=snapshot.selection.view==='recipients';
  const headers=[labels.phone,labels.name,labels.status,labels.reason,`${labels.recordedAt} (UTC)`,...(recipient?[labels.attempts,labels.quotaHeld,`${labels.acceptedAt} (UTC)`]:[])];
  const records=snapshot.rows.map(row=>{
    const values=[row.phone,row.name??'',labels.statusLabel(row.status),labels.reasonLabel(row.reason),row.recordedAt];
    if(row.kind==='recipient')values.push(String(row.attempts),row.quotaHeld?labels.yes:labels.no,row.acceptedAt??'');
    return values.map((value,index)=>campaignCsvCell(value,index===0)).join(',');
  });
  return '\ufeff'+[headers.map(value=>campaignCsvCell(value)).join(','),...records].join('\r\n')+'\r\n';
}
export function downloadCampaignReportCsv(snapshot:CampaignReportExport,labels:CampaignReportCsvLabels):void{
  const content=campaignReportCsv(snapshot,labels),blob=new Blob([content],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  try{link.href=url;link.download=`campaign_${snapshot.campaign.id}_${snapshot.selection.view}.csv`;link.hidden=true;document.body.append(link);link.click();}
  finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
