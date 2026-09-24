import { useEffect, useId } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { selectedMerchantId, selectMerchant } from '@/lib/merchant-selection';

export function MerchantSelector() {
  const selectId = useId();
  const { t } = useTranslation();
  const stores = trpc.merchantSelection.list.useQuery();
  const mutations = useIsMutating();
  const selected = selectedMerchantId();
  const validSelection = stores.data?.some(store => String(store.merchantId) === selected);
  useEffect(() => {
    if (stores.data?.length === 1 && !validSelection && !mutations) selectMerchant(stores.data[0].merchantId);
  }, [stores.data, validSelection, mutations]);
  if (stores.error) return <p role="alert" className="px-3 text-sm">{t('merchantSelector.loadError')}</p>;
  if (!stores.data?.length) return null;
  return <div className="px-3 py-2 space-y-1">
    <label htmlFor={selectId} className="text-xs text-muted-foreground">{t('merchantSelector.label')}</label>
    <select id={selectId} className="w-full rounded border bg-background p-2 text-sm" value={validSelection ? selected : ''}
      disabled={mutations > 0} onChange={event => { if (event.target.value) selectMerchant(Number(event.target.value)); }}>
      <option value="" disabled>{t('merchantSelector.choose')}</option>
      {stores.data.map(store => <option key={store.merchantId} value={store.merchantId}>{store.businessName}</option>)}
    </select>
  </div>;
}
