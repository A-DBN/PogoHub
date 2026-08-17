'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Dictionary } from './dictionaries/fr';
import { interpolate, type Locale } from './index';

type I18nValue = { locale: Locale; dict: Dictionary };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: I18nValue & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n doit être utilisé dans un I18nProvider');
  return value;
}

/** Raccourci : const { dict, t, locale } = useT() */
export function useT() {
  const { locale, dict } = useI18n();
  return {
    locale,
    dict,
    t: (template: string, values?: Record<string, string | number>) =>
      interpolate(template, values),
    /** Nom localisé d'une entité qui possède nameFr/nameEn */
    name: (value: { nameFr: string; nameEn: string }) =>
      locale === 'fr' ? value.nameFr : value.nameEn,
  };
}
