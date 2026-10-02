import {useTranslation} from 'react-i18next';
import {referralWorkspaceLabels} from '@/lib/referral-workspace-labels';
import type {ReferralWorkspaceRow} from '@shared/referral-workspace';
export function ReferralSummary({row}:{row:ReferralWorkspaceRow}){
 const {t,i18n}=useTranslation(),c=referralWorkspaceLabels(t),locale=i18n.language.startsWith('ar')?'ar':'en';
 const flag=(v:boolean|null)=>v===null?c.unknown:v?c.yes:c.no,stamp=(v:string|null)=>v?v.replace('T',' ').replace(/\.\d{3}Z$/,' UTC'):c.unknown;
 const entries:[string,string][]=[[c.state,c[row.state]]];
 if(row.kind==='code')entries.push([c.code,row.code||c.unknown],[c.name,row.referrerName||c.unknown],[c.phone,row.referrerPhone||c.unknown],[c.storedCount,row.recordedCount===null?c.unknown:row.recordedCount.toLocaleString(locale)],[c.rewardGiven,flag(row.rewardGiven)]);
 if(row.kind==='referral')entries.push([c.codeId,String(row.codeId)],[c.code,row.code||c.unknown],[c.name,row.referredName||c.unknown],[c.phone,row.referredPhone||c.unknown],[c.completedFlag,flag(row.orderCompleted)]);
 if(row.kind==='reward')entries.push([c.referralId,String(row.referralId)],[c.type,row.type?c[row.type]:c.unknown],[c.storedState,row.storedState?c[row.storedState]:c.unknown],[c.descriptionLabel,row.description||c.unknown],[c.expiry,stamp(row.expiresAt)],[c.claimedAt,row.claimedAt?stamp(row.claimedAt):row.issues.includes('claimed')||row.storedState==='claimed'?c.unknown:c.notRecorded],[c.sourceAvailable,flag(row.referralAvailable)]);
 entries.push([c.created,stamp(row.createdAt)],[c.updated,stamp(row.updatedAt)]);
 return <dl className="dc-summary">{entries.map(([label,value])=><div key={label}><dt>{label}</dt><dd><bdi>{value}</bdi></dd></div>)}</dl>;
}
