import {useTranslation} from 'react-i18next';
import type {z} from 'zod';
import type {staffAttemptDiagnostic} from '@shared/staff-attempt-review';

export function StaffAttemptGuidance({diagnostic}:{diagnostic?:z.infer<typeof staffAttemptDiagnostic>}){
  const {t}=useTranslation();
  const guidance={
    upload_unconfirmed:t('merchantUx.staffAttempts.uploadUnconfirmed'),
    transport_unconfirmed:t('merchantUx.staffAttempts.transportUnconfirmed'),
    transport_pending:t('merchantUx.staffAttempts.transportPending'),
    outcome_unknown:t('merchantUx.staffAttempts.outcomeUnknown'),
    settlement_available:t('merchantUx.staffAttempts.settlementAvailable'),
    provider_failed:t('merchantUx.staffAttempts.providerFailed'),
    dispatch_suppressed:t('merchantUx.staffAttempts.dispatchSuppressed'),
    evidence_conflict:t('merchantUx.staffAttempts.evidenceConflict'),
  };
  return diagnostic?<p data-attempt-diagnostic={diagnostic} className="text-sm leading-relaxed text-muted-foreground">{guidance[diagnostic]}</p>:null;
}
