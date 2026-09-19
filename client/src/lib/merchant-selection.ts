const key = 'sari.selectedMerchant';
export function selectedMerchantId(): string | undefined {
  try {
    const value = sessionStorage.getItem(key);
    return value && /^[1-9]\d{0,9}$/.test(value) ? value : undefined;
  } catch { return undefined; }
}
export function selectMerchant(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid merchant selection');
  sessionStorage.setItem(key, String(id));
  // Clear every in-memory query and page state by starting a new page lifetime.
  window.location.assign('/merchant/dashboard');
}
