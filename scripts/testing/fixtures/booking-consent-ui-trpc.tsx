import {useEffect,useState} from "react";
import type {BookingConsentReview} from "../../../shared/booking-consent-review";
const mode=new URL(location.href).searchParams.get("case")||"";
export const consentFixture={useQuery:()=>{
  const [revision,setRevision]=useState(0),[recovered,setRecovered]=useState(false);
  useEffect(()=>{const changed=()=>setRevision(n=>n+1);window.addEventListener("booking-consent-change",changed);(window as any).__changeBookingConsent=()=>window.dispatchEvent(new Event("booking-consent-change"));return()=>window.removeEventListener("booking-consent-change",changed);},[]);
  const reason=["missing","integrity","source","terms","refused","unavailable","truncated"].find(value=>mode===`booking-ops-consent-${value}`) as BookingConsentReview["reason"]|undefined;
  const xss=mode==="booking-ops-consent-xss",text=xss?'<img src=x onerror="window.__consentXss=1">'+"x".repeat(420):"أرغب في حجز استشارة في الموعد الموضح.";
  const msg={id:42,text,at:"2026-09-24T07:00:00Z",truncated:false};
  const data:BookingConsentReview=mode.startsWith("booking-ops-consent-")?{
    state:reason?"blocked":"ready",reason:reason??null,agreementId:91,evidence:reason?null:(revision?"b":"a").repeat(64),
    offerText:"ملخص حجز استشارة\n"+text,source:msg,consent:{...msg,id:43,text:"نعم"},latest:{...msg,id:44,text:"هل تتوفر مواقف؟"},
    refusal:reason==="refused"?{...msg,id:45,text:"لا تحجز"}:null,
    terms:{serviceName:xss?text:"استشارة",staffName:"سارة",bookingDate:"2026-12-20",startTime:"10:00",endTime:"11:00",durationMinutes:60,amountMinor:12500,currency:"SAR"},
  }:{state:"none",reason:null,agreementId:null,evidence:null,offerText:null,source:null,consent:null,latest:null,refusal:null,terms:null};
  return {data,isLoading:mode==="booking-ops-consent-loading",isError:mode==="booking-ops-consent-error"&&!recovered,isFetching:mode==="booking-ops-consent-fetching",
    refetch:async()=>{setRecovered(true);setRevision(n=>n+1);return {isError:mode==="booking-ops-consent-refresh-error",data};}};
}};
