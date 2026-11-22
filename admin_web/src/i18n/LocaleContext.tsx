import React, { useEffect, useMemo, useState } from 'react';
import { AppLocale, LocaleContext, LocaleContextValue, TRANSLATIONS } from './localeCore';

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<AppLocale>(() => {
    const saved = localStorage.getItem('servicepro_locale');
    return saved === 'ar' ? 'ar' : 'en';
  });

  const dir: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    localStorage.setItem('servicepro_locale', locale);
  }, [locale, dir]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir,
      isRtl: dir === 'rtl',
      setLocale: setLocaleState,
      toggleLocale: () => setLocaleState((prev) => (prev === 'en' ? 'ar' : 'en')),
      t: (key: string) => TRANSLATIONS[locale][key] || TRANSLATIONS.en[key] || key,
    }),
    [locale, dir]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};
