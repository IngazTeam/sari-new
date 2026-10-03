import {Link} from 'wouter';
import type {OccasionWorkspaceRow} from '@shared/occasion-workspace';
import type {occasionWorkspaceEn} from '@/locales/occasion-workspace';
import {occasionStamp} from '@/lib/occasion-workspace';
import {Button} from '@/components/ui/button';
export function OccasionRecord({row,c}:{row:OccasionWorkspaceRow;c:typeof occasionWorkspaceEn}){
 const fields=[[c.id,String(row.id)],[c.year,row.year],[c.discount,row.discountPercentage===null?null:row.discountPercentage+'%'],[c.code,row.discountCode],
 [c.enabledFlag,row.enabled===null?null:row.enabled?c.yes:c.no],[c.storedStatus,row.storedStatus==='pending'?c.pending:row.storedStatus&&row.storedStatus in c?c[row.storedStatus as keyof typeof c]:row.storedStatus],
 [c.storedRecipients,row.recipientCount],[c.campaign,row.linkedCampaign?.name??(row.campaignId?'#'+row.campaignId:null)],
 [c.sentAt,occasionStamp(row.sentAt,c.notRecorded)],[c.created,occasionStamp(row.createdAt,c.unknown)],[c.updated,occasionStamp(row.updatedAt,c.unknown)]];
 return <div className="oc-detail"><p>{c.evidence}</p>{row.issues.length>0&&<p className="sc-feedback">{c.dataHelp}</p>}<dl className="oc-facts">{fields.map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{value??c.notRecorded}</dd></div>)}</dl>
 {row.linkedCampaign&&<Button variant="outline" asChild><Link href={'/merchant/campaigns/'+row.linkedCampaign.id}>{c.openCampaign}</Link></Button>}
 <section><h3>{c.delivery}</h3>{row.delivery?<dl className="oc-facts">{(['total','pending','processing','accepted','retryable','suppressed','manualReview','unknown'] as const).map(k=><div key={k}><dt>{k==='total'?c.deliveryTotal:k==='unknown'?c.unknownDelivery:c[k]}</dt><dd>{row.delivery![k]}</dd></div>)}</dl>:<p>{c.noDelivery}</p>}</section>
 <section><h3>{c.template}</h3><p className="sc-muted">{c.templateHelp}</p><pre>{row.messageTemplate??c.notRecorded}</pre></section></div>;
}
