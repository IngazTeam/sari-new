import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Currency = 'SAR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'KWD';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  formatCurrency: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const currencySymbols: Record<Currency, string> = {
  SAR: 'ر.س',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'د.إ',
  KWD: 'د.ك',
};

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const saved = localStorage.getItem('currency');
    return (saved as Currency) || 'SAR';
  });

  useEffect(() => {
    localStorage.setItem('currency', currency);
  }, [currency]);

  const setCurrency = (newCurrency: Currency) => {
    setCurrencyState(newCurrency);
  };

  const formatCurrency = (amount: number): string => {
    const symbol = currencySymbols[currency];
    const formattedAmount = new Intl.NumberFormat('ar-SA', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
    
    // For Arabic currencies (SAR, AED, KWD), put symbol after number
    // For Western currencies (USD, EUR, GBP), put symbol before number
    if (currency === 'SAR' || currency === 'AED' || currency === 'KWD') {
      return `${formattedAmount} ${symbol}`;
    } else {
      return `${symbol}${formattedAmount}`;
    }
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
