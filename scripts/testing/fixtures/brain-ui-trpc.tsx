import { useState } from 'react';
const parameters = new URL(location.href).searchParams;
const mode = parameters.get('case') || 'ready';
const fixture = { totalConversations: 1234, totalSignals: 4567, dnaInsights: [{ dimension: 'tone', insight: 'تعليمات قديمة محفوظة للمراجعة؛ لا تستخدم في الردود الحالية.' }],
  learningEvidence: { proposalCount: 4, verifiedPurchases: 11, verifiedRefunds: 1,
    proposals: [{ id: 16, insight: 'اقتراح اختبار توضيح القيمة المرتبطة باحتياج العميل قبل مناقشة الخصم. '.repeat(9), evidenceCount: 3,
      evidence: [{ signalId: 7, relation: 'supporting', excerpt: 'السعر لا يناسب ميزانيتي، هل يوجد خيار أقل تكلفة؟' },
        { signalId: 8, relation: 'contrary', excerpt: 'أحتاج التأكد من المميزات المشمولة والموعد المتاح قبل القرار.' }] }] } };
export const trpc = {
  sariBrain: { getLearningDashboard: { useQuery: () => {
    const [retry, setRetry] = useState(false);
    return { data: mode === 'ready' || mode === 'mutation-error' || retry ? fixture : undefined,
      isLoading: mode === 'loading' && !retry, isError: mode === 'error' && !retry, refetch: async () => setRetry(true) };
  } } },
  orders: { approveCheckoutInvoice: { useMutation: (options: { onSuccess: () => void }) => {
    const [state, setState] = useState('idle'), [attempts, setAttempts] = useState(0);
    return { isSuccess: state === 'success', isPending: state === 'pending', isError: state === 'error',
      data: { paymentUrl: '/fixture-payment' }, mutate: (input: unknown) => {
        (window as any).__invoiceInput = input; setState('pending'); setAttempts(attempts + 1);
        setTimeout(() => { if (mode === 'mutation-error' && attempts === 0) setState('error'); else { setState('success'); options.onSuccess(); } }, 50);
      } };
  } } },
};
