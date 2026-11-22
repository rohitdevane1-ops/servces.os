import { createContext, useContext } from 'react';

export type AppLocale = 'en' | 'ar';

export const TRANSLATIONS: Record<AppLocale, Record<string, string>> = {
  en: {
    demoBanner: 'Live Interactive Sandbox — Sample Dubai Data Resets Daily.',
    demoBadge: 'DUBAI SANDBOX',
    switchLang: 'العربية',
    oneClickDemo: 'One-Click Dubai Sandbox Login',
    demoAdmin: 'Demo Admin',
    demoStaff: 'Demo Dispatcher',
    demoProtected: 'Protected in Demo Mode',
    vatLabel: 'UAE VAT (5%)',
    subtotalLabel: 'Subtotal (Excl. VAT)',
    totalInclVat: 'Total (Incl. 5% VAT)',
    currencyCode: 'AED',
  },
  ar: {
    demoBanner: 'بيئة تجريبية تفاعلية مباشرة — يتم إعادة تعيين بيانات دبي النموذجية يومياً.',
    demoBadge: 'بيئة دبي التجريبية',
    switchLang: 'English',
    oneClickDemo: 'تسجيل دخول فوري لبيئة دبي التجريبية',
    demoAdmin: 'دخول المدير التجريبي',
    demoStaff: 'دخول المنسق التجريبي',
    demoProtected: 'محمي في الوضع التجريبي',
    vatLabel: 'ضريبة القيمة المضافة (5%)',
    subtotalLabel: 'المجموع الفرعي (قبل الضريبة)',
    totalInclVat: 'الإجمالي (شامل 5% ضريبة)',
    currencyCode: 'د.إ',
  },
};

export const IS_DEMO_MODE =
  String(import.meta.env.VITE_DEMO_MODE || import.meta.env.NEXT_PUBLIC_DEMO_MODE || 'false').toLowerCase() === 'true';

export function calculateUAEVat(subtotal: number, vatRatePercent = 5): {
  subtotal: number;
  vatAmount: number;
  total: number;
} {
  const safeSub = Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;
  const vatAmount = Number(((safeSub * vatRatePercent) / 100).toFixed(2));
  const total = Number((safeSub + vatAmount).toFixed(2));
  return { subtotal: Number(safeSub.toFixed(2)), vatAmount, total };
}

export function formatCurrencyAED(amount: number, currency = 'AED'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${currency} ${safe.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface LocaleContextValue {
  locale: AppLocale;
  dir: 'ltr' | 'rtl';
  isRtl: boolean;
  setLocale: (next: AppLocale) => void;
  toggleLocale: () => void;
  t: (key: string) => string;
}

export const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return ctx;
}
