import { useState } from 'react';
import { getSalesSectorPlaybook, salesSectorPlaybooks } from '../../../shared/sales-sector-playbooks';
const parameters = new URL(location.href).searchParams;
const mode = parameters.get('case') || 'ready';
const fixture = { totalConversations: 1234, totalSignals: 4567, dnaInsights: [{ dimension: 'tone', insight: 'تعليمات قديمة محفوظة للمراجعة؛ لا تستخدم في الردود الحالية.' }],
  learningEvidence: { proposalCount: 4, verifiedPurchases: 11, verifiedRefunds: 1,
    proposals: [{ id: 16, insight: 'اقتراح اختبار توضيح القيمة المرتبطة باحتياج العميل قبل مناقشة الخصم. '.repeat(9), evidenceCount: 3,
      evidence: [{ signalId: 7, relation: 'supporting', excerpt: 'السعر لا يناسب ميزانيتي، هل يوجد خيار أقل تكلفة؟' },
        { signalId: 8, relation: 'contrary', excerpt: 'أحتاج التأكد من المميزات المشمولة والموعد المتاح قبل القرار.' }] }] } };
export const trpc = {
  sariBrain: {
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
