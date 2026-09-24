import { useEffect, useMemo, useState } from 'react';
import { calendarFixture } from './calendar-ui-trpc';
import { defaultFollowupPolicy } from '../../../shared/followup-policy';
import { getSalesSectorPlaybook, salesSectorPlaybooks } from '../../../shared/sales-sector-playbooks';
const parameters = new URL(location.href).searchParams;
const mode = parameters.get('case') || 'ready';
const fixture = { totalConversations: 1234, totalSignals: 4567, dnaInsights: [{ dimension: 'tone', insight: 'تعليمات قديمة محفوظة للمراجعة؛ لا تستخدم في الردود الحالية.' }],
  learningEvidence: { proposalCount: 4, verifiedPurchases: 11, verifiedRefunds: 1,
    proposals: [{ id: 16, insight: 'اقتراح اختبار توضيح القيمة المرتبطة باحتياج العميل قبل مناقشة الخصم. '.repeat(9), evidenceCount: 3,
      evidence: [{ signalId: 7, relation: 'supporting', excerpt: 'السعر لا يناسب ميزانيتي، هل يوجد خيار أقل تكلفة؟' },
        { signalId: 8, relation: 'contrary', excerpt: 'أحتاج التأكد من المميزات المشمولة والموعد المتاح قبل القرار.' }] }] } };
export const trpc = {
  calendar: calendarFixture,
  bookings: {
    getOperationHistory:{useQuery:()=>{
      const [recovered,setRecovered]=useState(false),[version,setVersion]=useState(0);
      const saved=(window as any).__operationSaved;
      const data=saved||mode==='booking-ops-audit'?[{actorUserId:7,operation:(window as any).__operationDelete?'delete':'update',beforeStatus:'pending',afterStatus:(window as any).__operationDelete?null:'confirmed',changedFields:['status'],at:'2026-09-24T00:00:00Z'}]:[];
      return {data,isLoading:mode==='booking-ops-loading',isError:mode==='booking-ops-error'&&!recovered,isFetching:mode==='booking-ops-fetching',
        refetch:async()=>{setRecovered(true);setVersion(version+1);if(mode==='booking-ops-refresh-error')return {isError:true,data};
          return {isError:false,data:(window as any).__operationSaved?[{...data[0],operation:(window as any).__operationDelete?'delete':'update',afterStatus:(window as any).__operationDelete?null:'confirmed'}]:data};}};
    }},
    update:{useMutation:()=>{
      const [isPending,setPending]=useState(false);return {isPending,mutateAsync:async(input:any)=>{
        setPending(true);(window as any).__operationInput=input;(window as any).__operationCount=((window as any).__operationCount||0)+1;await new Promise(r=>setTimeout(r,250));setPending(false);
        if(mode==='booking-ops-write-error')throw Error('private financial record');(window as any).__operationSaved=true;return {success:true,deleted:false,alreadyApplied:false};
      }};
    }},
    delete:{useMutation:()=>{
      const [isPending,setPending]=useState(false);return {isPending,mutateAsync:async(input:any)=>{
        setPending(true);(window as any).__operationInput=input;(window as any).__operationCount=((window as any).__operationCount||0)+1;await new Promise(r=>setTimeout(r,250));setPending(false);
        if(mode==='booking-ops-delete-blocked')throw Error('private payment link');(window as any).__operationSaved=true;(window as any).__operationDelete=true;return {success:true,deleted:true,alreadyApplied:false};
      }};
    }},
    getPaymentLinkRenewal:{useQuery:()=>{
      const [recovered,setRecovered]=useState(false),[revision,setRevision]=useState(0),[saved,setSaved]=useState(false);
      useEffect(()=>{const changed=()=>setRevision(n=>n+1);window.addEventListener('renewal-evidence-change',changed);(window as any).__changeRenewalEvidence=()=>window.dispatchEvent(new Event('renewal-evidence-change'));return()=>window.removeEventListener('renewal-evidence-change',changed);},[]);
      const blocker=['booking','legacy','identity','link','payment'].find(value=>mode===`booking-renewal-${value}`)??null;
      const audit=saved||['booking-renewal-audit','booking-renewal-xss'].includes(mode)?{actorUserId:7,reason:mode==='booking-renewal-xss'?'<img src=x onerror="window.__renewalXss=1">'+ 'x'.repeat(450):'Customer requested another day to pay',
        priorExpiresAt:'2026-09-23T00:00:00Z',renewedExpiresAt:'2026-09-25T00:00:00Z',at:'2026-09-24T00:00:00Z'}:null;
      const data=mode.startsWith('booking-renewal-')&&mode!=='booking-renewal-empty'?{state:blocker||saved?'blocked':'eligible',blocker:saved?'link':blocker,evidence:(revision?'b':'a').repeat(64),expiresAt:saved?'2026-09-25T00:00:00Z':'2026-09-23T00:00:00Z',audit}:null;
      return {data,isLoading:mode==='booking-renewal-loading',isError:mode==='booking-renewal-error'&&!recovered,isFetching:mode==='booking-renewal-fetching',
        refetch:async()=>{setRecovered(true);if(mode==='booking-renewal-refresh-error')return {isError:true};
          if((window as any).__renewalSuccess&&!['booking-renewal-stale-response'].includes(mode))setSaved(true);return {isError:false};}};
    }},
    renewPaymentLink:{useMutation:()=>{
      const [isPending,setPending]=useState(false);return {isPending,mutateAsync:async(input:any)=>{
        setPending(true);(window as any).__renewalInput=input;(window as any).__renewalCount=((window as any).__renewalCount||0)+1;
        await new Promise(r=>setTimeout(r,300));setPending(false);if(mode==='booking-renewal-write-error')throw Error('private financial record');
        (window as any).__renewalSuccess=true;return {renewed:true,alreadyRenewed:false,expiresAt:'2026-09-25T00:00:00Z'};
      }};
    }},
    getCheckoutAttempts:{useQuery:()=>{
      const [recovered,setRecovered]=useState(false),[revision,setRevision]=useState(0);
      useEffect(()=>{const changed=()=>setRevision(n=>n+1);window.addEventListener('booking-evidence-change',changed);(window as any).__changeBookingEvidence=()=>window.dispatchEvent(new Event('booking-evidence-change'));return()=>window.removeEventListener('booking-evidence-change',changed);},[]);
      return {isLoading:mode==='booking-review-loading',isError:mode==='booking-review-error'&&!recovered,
        data:mode.startsWith('booking-review-')&&mode!=='booking-review-empty'?['unknown','dispatching','created','failed'].map((state,id)=>({
          id:`00000000-0000-4000-8000-00000000000${id}`,state,evidence:(revision?'b':'a').repeat(64),reviewRevision:revision,canReview:mode!=='booking-review-blocked'&&(id===0||id===2),
          lastReview:mode==='booking-review-audit'?{outcome:'verified',at:'2026-09-24T00:00:00.000Z'}:null,
          reference:mode==='booking-review-xss'?'<img src=x onerror="window.__bookingXss=1">':'sari_pl_'+'f'.repeat(64),amountMinor:26998,currency:'SAR',
          paymentId:null,createdAt:'2026-09-24T00:00:00.000Z',updatedAt:'2026-09-24T00:00:00.000Z'})):[],
        refetch:async()=>{setRecovered(true);(window as any).__bookingEvidenceRefreshed=true;return {isError:false};}};
    }},
    reconcileCheckoutAttempt:{useMutation:()=>{
      const [isPending,setPending]=useState(false);return {isPending,mutateAsync:async(input:any)=>{
        setPending(true);(window as any).__bookingReviewInput=input;(window as any).__bookingReviewCount=((window as any).__bookingReviewCount||0)+1;
        await new Promise(r=>setTimeout(r,150));setPending(false);if(mode==='booking-review-write-error')throw Error('private provider failure');
        return {outcome:mode==='booking-review-unverified'?'unverified':'verified',status:'captured'};
      }};
    }},
  },
  botSettings: {
    getMarginPolicy:{useQuery:()=>{
      const [revision,setRevision]=useState(0),[retry,setRetry]=useState(false);
      useEffect(()=>{const changed=()=>setRevision(r=>r+1);window.addEventListener('margin-change',changed);(window as any).__changeMarginPolicy=()=>window.dispatchEvent(new Event('margin-change'));return()=>window.removeEventListener('margin-change',changed);},[]);
      const data=useMemo(()=>({policy:(window as any).__marginPolicyInput?.policy||{enabled:mode.startsWith('margin-'),minPercent:30},revision,
        evidence:(revision?'b':'a').repeat(64),canManage:mode!=='viewer'&&mode!=='margin-supervisor',history:revision?[{revision,actorUserId:7,createdAt:'2026-09-23T10:00:00Z',
          beforePolicy:{enabled:false,minPercent:30},afterPolicy:(window as any).__marginPolicyInput?.policy||{enabled:true,minPercent:30}}]:[]}),[revision]);
      return {data,isLoading:mode==='loading'&&!retry,isError:mode==='error'&&!retry,isFetching:false,
        refetch:async()=>{setRetry(true);const next=(window as any).__marginPolicyInput?revision+1:revision;setRevision(next);return{data:{...data,revision:next,evidence:(next?'b':'a').repeat(64)},isError:false};}};
    }},
    updateMarginPolicy:{useMutation:(options:{onSuccess:(data:any)=>void})=>{
      const [state,setState]=useState('idle'),[attempts,setAttempts]=useState(0);
      return {isPending:state==='pending',isSuccess:state==='success',isError:state==='error',reset:()=>setState('idle'),mutate:(input:any)=>{
        setState('pending');setAttempts(attempts+1);setTimeout(()=>{if(mode==='mutation-error'&&attempts===0)setState('error');else{
          (window as any).__marginPolicyInput=input;setState('success');options.onSuccess({policy:input.policy,revision:input.expectedRevision+1,evidence:'b'.repeat(64),history:[]});}},50);
      }};
    }},
    getDiscountPolicy: { useQuery: () => {
      const [revision,setRevision]=useState(0),[retry,setRetry]=useState(false);
      const data=useMemo(()=>({policy:(window as any).__discountInput?.policy||{enabled:false,maxPercent:3,expireHours:24},revision,
        evidence:(revision?'b':'a').repeat(64),canManage:mode!=='viewer',history:revision?[{revision,actorUserId:7,createdAt:'2026-09-23T10:00:00Z',
          beforePolicy:{enabled:false,maxPercent:3,expireHours:24},afterPolicy:(window as any).__discountInput?.policy||{enabled:false,maxPercent:3,expireHours:24}}]:[]}),[revision]);
      useEffect(()=>{(window as any).__discountChanged=()=>setRevision(r=>r+1);},[]);
      return {data,isLoading:mode==='loading'&&!retry,isError:mode==='error'&&!retry,isFetching:false,
        refetch:async()=>{setRetry(true);const next=(window as any).__discountInput?revision+1:revision;setRevision(next);
          return {data:{...data,revision:next,evidence:(next?'b':'a').repeat(64)},isError:false};}};
    } },
    updateDiscountPolicy: {useMutation:(options:{onSuccess:(data:any)=>void})=>{
      const [state,setState]=useState('idle'),[attempts,setAttempts]=useState(0);
      return {isPending:state==='pending',isError:state==='error',isSuccess:state==='success',reset:()=>setState('idle'),
        mutate:(input:any)=>{setState('pending');setAttempts(attempts+1);setTimeout(()=>{
          if(mode==='mutation-error'&&attempts===0)setState('error');else{(window as any).__discountInput=input;setState('success');
            options.onSuccess({policy:input.policy,revision:input.expectedRevision+1,evidence:'b'.repeat(64),history:[]});}
        },50);}};
    } },
  },
  conversations: {
    listSalesOfferAttempts:{useQuery:(input:{beforeSourceId?:number},options:{enabled:boolean})=>{
      const [retry,setRetry]=useState(false),[revision,setRevision]=useState(0);
      const id=input.beforeSourceId?'98a9f3db-a76c-4413-baff-558ad0b1d73b':'1c2e9491-2555-4fa3-a5e9-846efea99780';
      useEffect(()=>{if(options.enabled)(window as any).__offerReads=((window as any).__offerReads||0)+1;},[options.enabled,input.beforeSourceId]);
      useEffect(()=>{(window as any).__changeOfferEvidence=()=>setRevision(r=>r+1);},[]);
      const saved=(window as any).__offerInput;
      const state=mode==='offer-failed'?'failed':mode==='offer-read'?'read':mode==='offer-conflict'?'sent':'pending';
      const accepted=['offer-failed','offer-read','offer-conflict'].includes(mode);
      const item={id,revision,evidence:(revision?'b':'a').repeat(64),state,accepted,projected:accepted&&mode!=='offer-conflict',projectionConflict:mode==='offer-conflict',
        attemptState:'unknown',sourceMessageId:input.beforeSourceId?71:81,sourceText:mode==='offer-source-missing'?null:'هل يوجد خصم؟ <img src=x onerror=alert(1)> '+ 'long-customer-request-'.repeat(45),
        text:'كود الخصم المتاح: REVIEW10\nقيمة الخصم: 10%\n'+ 'شروط العرض المحفوظة '.repeat(55),createdAt:'2026-09-23T10:00:00Z',receipt:accepted?'receipt-'+'A'.repeat(240):null,
        lastReview:saved?.attemptId===id?{actorUserId:7,note:saved.note,outcome:'unresolved',deliveryState:'pending',at:'2026-09-23T11:00:00Z'}:null};
      return {isLoading:options.enabled&&mode==='loading'&&!retry,isError:options.enabled&&mode==='error'&&!retry,isFetching:mode==='offer-fetching',
        data:options.enabled?{items:mode==='empty'?[]:[item],canManage:mode!=='viewer',nextCursor:input.beforeSourceId?null:81}:undefined,
        refetch:async()=>{setRetry(true);if((window as any).__offerInput)setRevision(r=>r+1);},};
    }},
    reviewSalesOffer:{useMutation:(options:{onSuccess:(result:unknown)=>void})=>{
      const [state,setState]=useState('idle'),[attempts,setAttempts]=useState(0);
      return {isPending:state==='pending',isError:state==='error',reset:()=>setState('idle'),mutate:(input:unknown)=>{
        setState('pending');setAttempts(attempts+1);setTimeout(()=>{
          if(mode==='mutation-error'&&attempts===0)setState('error');else{(window as any).__offerInput=input;setState('success');options.onSuccess({outcome:'unresolved'});}
        },75);
      }};
    }},
    listEscalationRelays: { useQuery: (input: {beforeId?:number}) => {
      const [retry,setRetry]=useState(false),[revision,setRevision]=useState(0);
      const saved=(window as any).__relayInput;
      const item={id:input.beforeId?4:5,revision,evidence:(revision?'b':'a').repeat(64),state:'pending',outcome:'unresolved',projected:false,sourceMessageId:81,
        question:'سؤال عن الموعد <img src=x onerror=alert(1)> '+ 'long-question-'.repeat(45),reply:'موعد الخميس متاح. '+ 'تفاصيل '.repeat(100),authorPhone:'966500000082',
        createdAt:'2026-09-23T10:00:00Z',receipt:null,lastReview:saved?{actorUserId:7,note:saved.note,outcome:'unresolved',at:'2026-09-23T11:00:00Z'}:null};
      return {isLoading:mode==='loading'&&!retry,isError:mode==='error'&&!retry,isFetching:false,
        data:{canManage:mode!=='viewer',items:mode==='empty'?[]:[item],nextCursor:input.beforeId?null:5},
        refetch:async()=>{setRetry(true); if((window as any).__relayInput) setRevision(revision+1);},};
    } },
    reviewEscalationRelay: { useMutation:(options:{onSuccess:()=>void})=>{
      const [state,setState]=useState('idle'),[attempts,setAttempts]=useState(0);
      return {isPending:state==='pending',isError:state==='error',isSuccess:state==='success',data:{outcome:'unresolved'},reset:()=>setState('idle'),
        mutate:(input:unknown)=>{setState('pending');setAttempts(attempts+1);setTimeout(()=>{
          if(mode==='mutation-error'&&attempts===0)setState('error');else{(window as any).__relayInput=input;setState('success');options.onSuccess();}
        },50);},};
    } },
    getHandoffSource: { useQuery: (input: { messageId: number }) => {
      const [retry, setRetry] = useState(false);
      return { data: { id: input.messageId, role: 'customer', at: '2026-09-23T10:00:00Z', text: 'دليل كامل من رسالة أصلية. <img src=x onerror=alert(1)> ' + 'long-source-'.repeat(70) },
        isFetching: false, isError: mode === 'source-error' && !retry, refetch: async () => setRetry(true) };
    } },
    getHandoff: { useQuery: () => {
      const [revision, setRevision] = useState(0), [retry, setRetry] = useState(false);
      const data = useMemo(() => ({ conversationId: 42, version: revision, lastMessageId: 82, humanOwned: (window as any).__handoffInput?.action === 'takeover',
        canManage: mode !== 'viewer', expiresAt: null, dealStage: 'interested', lossReason: null,
        facts: mode === 'empty' ? [] : [{ field: 'budget', value: { amountMinor: 50000, currency: 'SAR' }, kind: 'explicit', sourceMessageId: 81 },
          { field: 'lastObjection', value: 'price', kind: 'inferred', sourceMessageId: 81 }],
        offers: mode === 'empty' ? [] : [{ id: 8, number: 'Q-8', current: false, sourceMessageId: 81, orderId: null, items: [{ name: 'دورة مسائية', quantity: 1 }] }],
        messages: mode === 'empty' ? [] : [{ id: 81, role: 'customer', text: 'أحتاج دورة مسائية وميزانيتي 500 ريال. '.repeat(8) },
          { id: 82, role: 'merchant', text: 'أوضحت مواعيد الدورة. <img src=x onerror=alert(1)>' }],
      }), [revision]);
      return { data, isLoading: mode === 'loading' && !retry, isError: mode === 'error' && !retry,
        refetch: async () => { setRetry(true); setRevision(revision + 1); } };
    } },
    setOwnership: { useMutation: (options: { onSuccess: () => void }) => {
      const [state, setState] = useState('idle'), [attempts, setAttempts] = useState(0);
      return { isPending: state === 'pending', isError: state === 'error', isSuccess: state === 'success', reset: () => setState('idle'),
        mutate: (input: unknown) => { setState('pending'); setAttempts(attempts + 1);
          setTimeout(() => { if (mode === 'mutation-error' && attempts === 0) setState('error'); else {
            (window as any).__handoffInput = input; setState('success'); options.onSuccess(); } }, 50);
        } };
    } },
  },
  sariBrain: {
    getFollowupPolicy: { useQuery: () => {
      const [revision, setRevision] = useState(0), [retry, setRetry] = useState(false);
      const data = useMemo(() => ({ policy: (window as any).__followupInput?.policy || defaultFollowupPolicy,
        revision, canManage: mode !== 'viewer' }), [revision]);
      return { data, isLoading: mode === 'loading' && !retry, isError: mode === 'error' && !retry,
        refetch: async () => { setRetry(true); setRevision(revision + 1); } };
    } },
    updateFollowupPolicy: { useMutation: (options: { onSuccess: () => void }) => {
      const [state, setState] = useState('idle'), [attempts, setAttempts] = useState(0);
      return { isPending: state === 'pending', isError: state === 'error', isSuccess: state === 'success', reset: () => setState('idle'),
        mutate: (input: unknown) => { setState('pending'); setAttempts(attempts + 1);
          setTimeout(() => { if (mode === 'mutation-error' && attempts === 0) setState('error'); else {
            (window as any).__followupInput = input; setState('success'); options.onSuccess(); } }, 50);
        } };
    } },
    getSalesSector: { useQuery: () => {
      const [revision, setRevision] = useState(0), [retry, setRetry] = useState(false);
      return { isLoading: mode === 'loading' && !retry, isError: mode === 'error' && !retry,
        data: { playbook: getSalesSectorPlaybook((window as any).__sectorInput?.playbookId || 'general'), revision,
          canManage: mode !== 'viewer', available: salesSectorPlaybooks },
        refetch: async () => { setRetry(true); setRevision(revision + 1); } };
    } },
    updateSalesSector: { useMutation: (options: { onSuccess: () => void }) => {
      const [state, setState] = useState('idle'), [attempts, setAttempts] = useState(0);
      return { isPending: state === 'pending', isError: state === 'error', isSuccess: state === 'success', reset: () => setState('idle'),
        mutate: (input: unknown) => { setState('pending'); setAttempts(attempts + 1);
          setTimeout(() => { if (mode === 'mutation-error' && attempts === 0) setState('error'); else {
            (window as any).__sectorInput = input; setState('success'); options.onSuccess(); } }, 50);
        } };
    } },
    getLearningDashboard: { useQuery: () => {
    const [retry, setRetry] = useState(false);
    return { data: mode === 'ready' || mode === 'mutation-error' || retry ? fixture : undefined,
      isLoading: mode === 'loading' && !retry, isError: mode === 'error' && !retry, refetch: async () => setRetry(true) };
  } } },
  orders: {
    getCheckoutDiscountRelease:{useQuery:()=>{
      const [recovered,setRecovered]=useState(false),[saved,setSaved]=useState(false),[revision,setRevision]=useState(0);
      useEffect(()=>{const changed=()=>setRevision(n=>n+1);window.addEventListener('coupon-release-change',changed);(window as any).__changeCouponRelease=()=>window.dispatchEvent(new Event('coupon-release-change'));return()=>window.removeEventListener('coupon-release-change',changed);},[]);
      const blocker=['legacy','order','identity','payment','coupon','counter'].find(b=>mode===`coupon-release-${b}`);
      const released=saved||mode==='coupon-release-audit';
      return {isLoading:mode==='coupon-release-loading'&&!recovered,isError:mode==='coupon-release-error'&&!recovered,
        data:mode.startsWith('coupon-release-')&&mode!=='coupon-release-empty'?{code:'LOCAL_'+'X'.repeat(44),discountMinor:2999,state:released?'released':blocker?'blocked':'eligible',blocker:blocker||null,evidence:(revision?'b':'a').repeat(64),
          audit:released?{actorUserId:7,reason:(window as any).__couponReleaseInput?.reason||'<img src=x onerror="window.__couponXss=1"> '+ 'long-audit-word-'.repeat(30),usedBefore:4,usedAfter:3,at:'2026-09-24T00:00:00.000Z'}:null}:null,
        refetch:async()=>{setRecovered(true);setSaved(!!(window as any).__couponReleased);return {isError:false};}};
    }},
    releaseCheckoutDiscount:{useMutation:()=>{
      const [isPending,setPending]=useState(false);
      return {isPending,mutateAsync:async(input:any)=>{setPending(true);(window as any).__couponReleaseInput=input;
        (window as any).__couponReleaseCount=((window as any).__couponReleaseCount||0)+1;await new Promise(r=>setTimeout(r,80));setPending(false);
        if(mode==='coupon-release-write-error')throw Error('private coupon storage');(window as any).__couponReleased=true;return {released:true,alreadyReleased:false};}};
    }},
    getCheckoutAttempts: {useQuery:()=>{
      const [recovered,setRecovered]=useState(false);
      return {isLoading:mode==='checkout-attempts-loading',isError:mode==='checkout-attempts-error'&&!recovered,
        data:mode.startsWith('checkout-attempts-')&&mode!=='checkout-attempts-empty'?['unknown','dispatching','created','failed'].map((state,id)=>({
          id:`00000000-0000-4000-8000-00000000000${id}`,state,evidence:'a'.repeat(64),reviewRevision:0,canReview:id===0||id===2,
          lastReview:null,reference:mode==='checkout-attempts-xss'?'<img src=x onerror="window.__attemptXss=1">':'sari_pl_'+'f'.repeat(64),
          amountMinor:26998,currency:'SAR',paymentId:null,createdAt:'2026-09-24T00:00:00.000Z',updatedAt:'2026-09-24T00:00:00.000Z'})):[],
        refetch:async()=>{setRecovered(true);(window as any).__attemptRefreshed=true;return {isError:false};}};
    }},
    reconcileCheckoutAttempt:{useMutation:()=>{
      const [isPending,setPending]=useState(false);
      return {isPending,mutateAsync:async(input:any)=>{setPending(true);(window as any).__checkoutReviewInput=input;
        (window as any).__checkoutReviewCount=((window as any).__checkoutReviewCount||0)+1;await new Promise(r=>setTimeout(r,80));setPending(false);
        if(mode==='checkout-attempts-reconcile-error')throw Error('private provider failure');
        return {outcome:mode==='checkout-attempts-unverified'?'unverified':'verified',status:'captured'};
      }};
    }},
    getCheckoutMarginException:{useQuery:({orderId}:{orderId:number})=>{
      const [retry,setRetry]=useState(false);
      const saved=(window as any).__invoiceInput?.margin?.exception;
      return {isLoading:mode==='margin-audit-loading'&&!retry,isError:mode==='margin-audit-error'&&!retry,
        data:(orderId===123&&saved)||(orderId===124&&mode.startsWith('margin-audit'))?{id:5,actorUserId:7,reason:saved?.reason||'سبب موثق <img src=x onerror=alert(1)> '+ 'audit-reason-with-long-word-'.repeat(35),
          createdAt:'2026-09-23T10:00:00Z',totalMinor:23000,policyRevision:1,policy:{minPercent:30},calculation:{netRevenueMinor:20000,totalCostMinor:23000,profitMinor:-3000,marginBps:-1500}}:null,
        refetch:async()=>setRetry(true)};
    }},
    previewCheckoutMargin:{useQuery:(input:any)=>{
      const [data,setData]=useState<any>(),[fetching,setFetching]=useState(false),[error,setError]=useState(false),[attempts,setAttempts]=useState(0);
      return {data,isFetching:fetching,isError:error,refetch:async()=>{
        setFetching(true);setError(false);setAttempts(attempts+1);(window as any).__marginPreviewInput=input;await new Promise(resolve=>setTimeout(resolve,50));
        if(mode==='margin-failure'&&attempts===0){setFetching(false);setError(true);return{data:undefined,isError:true};}
        const below=mode==='margin-below'||mode==='margin-supervisor'||mode.startsWith('margin-exception'),productCostMinor=below?16000:10000;
        const profitMinor=23000-productCostMinor-input.costs.taxMinor-input.costs.shippingCostMinor-input.costs.otherCostMinor;
        const result={status:mode==='margin-missing'?'missing_cost':below?'below_floor':'pass',totalMinor:23000,
          costs:input.costs,policy:{enabled:true,minPercent:30},policyRevision:0,evidence:'c'.repeat(64),productCostMinor,
          calculation:{netRevenueMinor:23000-input.costs.taxMinor,totalCostMinor:productCostMinor+input.costs.shippingCostMinor+input.costs.otherCostMinor,
            profitMinor,marginBps:Math.floor(profitMinor*10000/(23000-input.costs.taxMinor)),passes:!below},
          lines:[{productId:7,variantId:null,quantity:1,name:'منتج اختبار <img src=x onerror=alert(1)>',unitCostMinor:mode==='margin-missing'?null:productCostMinor}]};
        setData(result);setFetching(false);return{data:result,isError:false};
      }};
    }},
    listZidReconciliations: { useQuery: () => {
      const [retry, setRetry] = useState(false), [done, setDone] = useState(false);
      return { isLoading: mode === 'loading' && !retry, isError: mode === 'error' && !retry,
        data: { canManage: mode !== 'viewer', nextCursor: null, items: done || mode === 'empty' ? [] : [
          { id: 55, number: 'ZCHAT-55', customerName: 'عميل اختبار', phone: '966500000000', state: 'unknown', canReview: true,
            projectionPending: false, orderId: null, reference: 'SARY-CHECKOUT:804b6513-4780-4fb4-9d90-7ac5f0fc846a' },
          { id: 56, number: 'ZCHAT-LEGACY', customerName: 'طلب قديم', phone: '966500000001', state: 'unknown', canReview: false,
            projectionPending: false, orderId: null, reference: null } ] },
        refetch: async () => { setRetry(true); if ((window as any).__zidVerified) setDone(true); } };
    } },
    reconcileZidCheckout: { useMutation: (options: { onSuccess: (result: { projectionPending: boolean }) => void }) => {
      const [state, setState] = useState('idle'), [attempts, setAttempts] = useState(0);
      return { isPending: state === 'pending', isError: state === 'error', isSuccess: state === 'success', data: { projectionPending: false }, reset: () => setState('idle'),
        mutate: (input: unknown) => { (window as any).__zidInput = input; setState('pending'); setAttempts(attempts + 1);
          setTimeout(() => { if (mode === 'mutation-error' && attempts === 0) setState('error'); else { setState('success');
            (window as any).__zidVerified = true; options.onSuccess({ projectionPending: false }); } }, 50);
        } };
    } },
    approveCheckoutInvoice: { useMutation: (options: { onSuccess: () => void }) => {
    const [state, setState] = useState('idle'), [attempts, setAttempts] = useState(0);
    return { isSuccess: state === 'success', isPending: state === 'pending', isError: state === 'error',
      data: { paymentUrl: '/fixture-payment' }, mutate: (input: unknown) => {
        (window as any).__invoiceInput = input; setState('pending'); setAttempts(attempts + 1);
        setTimeout(() => { if ((mode === 'mutation-error'||mode==='margin-exception-failure') && attempts === 0) setState('error'); else { setState('success'); options.onSuccess(); } }, 50);
      } };
  } } },
};
