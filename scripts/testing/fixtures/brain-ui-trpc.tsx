import { useEffect, useMemo, useState } from 'react';
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
        setTimeout(() => { if (mode === 'mutation-error' && attempts === 0) setState('error'); else { setState('success'); options.onSuccess(); } }, 50);
      } };
  } } },
};
