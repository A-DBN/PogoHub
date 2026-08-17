import { fr, type Dictionary } from './dictionaries/fr';
import { en } from './dictionaries/en';
import { DEFAULT_LOCALE, isLocale, type Locale } from './config';

const DICTIONARIES: Record<Locale, Dictionary> = { fr, en };

export function getDictionary(locale: string | undefined): Dictionary {
  return DICTIONARIES[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

/** Remplace {clé} par la valeur fournie. */
export function interpolate(
  template: string,
  values: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}

/** Nom localisé d'un Pokémon ou d'une attaque. */
export function localizedName(
  locale: Locale,
  value: { nameFr: string; nameEn: string },
): string {
  return locale === 'fr' ? value.nameFr : value.nameEn;
}

export type { Dictionary };
export * from './config';
