/**
 * useIntegration — provides platform terminology + lock state across merchant dashboard
 * 
 * Fetches /api/v1/integration once and caches for the session.
 * Components use this to show "دورات" instead of "منتجات" when Byaan is connected.
 */

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';

// Default terminology for non-integrated accounts
const DEFAULT_TERMINOLOGY: Record<string, string> = {
  products: 'منتجات',
  customers: 'عملاء',
  orders: 'طلبات',
  category: 'قسم',
  price: 'السعر',
  item: 'منتج',
};

interface IntegrationState {
  source: string;       // 'none' | 'byaan' | 'salla' | 'zid'
  isLocked: boolean;    // true when content is managed by external platform
  terminology: Record<string, string>;
  loading: boolean;
  /** Helper: get a term by key, with fallback */
  term: (key: string) => string;
}

const IntegrationContext = createContext<IntegrationState>({
  source: 'none',
  isLocked: false,
  terminology: DEFAULT_TERMINOLOGY,
  loading: true,
  term: (key: string) => DEFAULT_TERMINOLOGY[key] || key,
});

// In-memory cache to avoid refetching across navigation
let _cachedIntegration: { source: string; isLocked: boolean; terminology: Record<string, string> } | null = null;

export function IntegrationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    source: string;
    isLocked: boolean;
    terminology: Record<string, string>;
    loading: boolean;
  }>({
    source: _cachedIntegration?.source || 'none',
    isLocked: _cachedIntegration?.isLocked || false,
    terminology: _cachedIntegration?.terminology || DEFAULT_TERMINOLOGY,
    loading: !_cachedIntegration,
  });

  useEffect(() => {
    if (_cachedIntegration) return; // Already loaded

    const apiKey = sessionStorage.getItem('sari_api_key') || localStorage.getItem('sari_api_key') || '';
    if (!apiKey) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    fetch('/api/v1/integration', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          _cachedIntegration = {
            source: data.source || 'none',
            isLocked: data.isLocked || false,
            terminology: { ...DEFAULT_TERMINOLOGY, ...data.terminology },
          };
          setState({ ..._cachedIntegration, loading: false });
        } else {
          setState(prev => ({ ...prev, loading: false }));
        }
      })
      .catch(() => setState(prev => ({ ...prev, loading: false })));
  }, []);

  const term = useCallback(
    (key: string) => state.terminology[key] || DEFAULT_TERMINOLOGY[key] || key,
    [state.terminology]
  );

  return (
    <IntegrationContext.Provider value={{ ...state, term }}>
      {children}
    </IntegrationContext.Provider>
  );
}

/**
 * Hook to use integration terminology and lock state
 * 
 * Usage:
 *   const { term, isLocked, source } = useIntegration();
 *   <h1>{term('products')}</h1>  // "دورات" if Byaan, "منتجات" otherwise
 *   {isLocked && <Badge>🔒 مربوط</Badge>}
 */
export function useIntegration(): IntegrationState {
  return useContext(IntegrationContext);
}

/**
 * Component: Shows a lock banner when content is managed externally
 */
export function IntegrationLockBanner() {
  const { isLocked, source, term } = useIntegration();
  if (!isLocked) return null;

  const platformName = source === 'byaan' ? 'بيان' : source === 'salla' ? 'سلّة' : source === 'zid' ? 'زد' : source;

  return (
    <div className="flex items-center gap-3 p-3 mb-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/50">
        <svg className="h-4 w-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          مربوط بـ{platformName} — {term('products')} تُدار تلقائياً
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          التعديل اليدوي مقفل لمنع التضارب مع المزامنة
        </p>
      </div>
    </div>
  );
}

/** Reset the cache (call on logout or reconnect) */
export function resetIntegrationCache() {
  _cachedIntegration = null;
}
