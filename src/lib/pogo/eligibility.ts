/**
 * Règles d'éligibilité d'une ligue / coupe, avec la même sémantique que PvPoke :
 * une coupe définit des filtres `include` (au moins un doit passer) et `exclude`
 * (aucun ne doit passer), chacun portant sur le type, un tag ou une espèce.
 */

export type CupFilter = {
  filterType: 'type' | 'tag' | 'id' | 'dex' | string;
  values?: string[];
  name?: string;
};

export type LeagueFilters = {
  include?: CupFilter[];
  exclude?: CupFilter[];
};

export type EligibilityInput = {
  speciesId: string;
  dex: number;
  types: string[];
  tags: string[];
  cp?: number | null;
};

export type EligibilityResult = {
  eligible: boolean;
  reasons: string[]; // clés i18n : cp, type, tag:<tag>, species
};

function matches(filter: CupFilter, p: EligibilityInput): boolean {
  const values = (filter.values ?? []).map((v) => v.toLowerCase());
  switch (filter.filterType) {
    case 'type':
      return p.types.some((t) => values.includes(t.toLowerCase()));
    case 'tag':
      return p.tags.some((t) => values.includes(t.toLowerCase()));
    case 'id':
      return values.includes(p.speciesId.toLowerCase());
    case 'dex':
      return values.includes(String(p.dex));
    default:
      return false;
  }
}

export function checkEligibility(
  pokemon: EligibilityInput,
  league: { cpLimit: number | null; filters?: LeagueFilters | null },
): EligibilityResult {
  const reasons: string[] = [];

  if (league.cpLimit != null && pokemon.cp != null && pokemon.cp > league.cpLimit) {
    reasons.push('cp');
  }

  const filters = league.filters ?? {};
  const include = filters.include ?? [];
  const exclude = filters.exclude ?? [];

  if (include.length > 0 && !include.some((f) => matches(f, pokemon))) {
    reasons.push(include[0].filterType === 'type' ? 'type' : 'species');
  }

  for (const filter of exclude) {
    if (matches(filter, pokemon)) {
      if (filter.filterType === 'tag') {
        const hit = (filter.values ?? []).find((v) =>
          pokemon.tags.map((t) => t.toLowerCase()).includes(v.toLowerCase()),
        );
        reasons.push(`tag:${hit ?? 'unknown'}`);
      } else if (filter.filterType === 'type') {
        reasons.push('type');
      } else {
        reasons.push('species');
      }
    }
  }

  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function isEligible(
  pokemon: EligibilityInput,
  league: { cpLimit: number | null; filters?: LeagueFilters | null },
): boolean {
  return checkEligibility(pokemon, league).eligible;
}

/** Libellés localisés des tags de coupe et des types. */
const TAG_LABEL: Record<string, { fr: string; en: string }> = {
  mega: { fr: 'Méga-Évolutions', en: 'Mega Evolutions' },
  legendary: { fr: 'Légendaires', en: 'Legendaries' },
  mythical: { fr: 'Fabuleux', en: 'Mythicals' },
  ultrabeast: { fr: 'Ultra-Chimères', en: 'Ultra Beasts' },
  shadow: { fr: 'Pokémon Obscurs', en: 'Shadow Pokémon' },
  shadoweligible: { fr: 'Pokémon purifiables', en: 'shadow-eligible Pokémon' },
  starter: { fr: 'starters', en: 'starters' },
  regional: { fr: 'Pokémon régionaux', en: 'regional Pokémon' },
  untradeable: { fr: 'Pokémon non échangeables', en: 'untradeable Pokémon' },
  alolan: { fr: 'formes d’Alola', en: 'Alolan forms' },
  galarian: { fr: 'formes de Galar', en: 'Galarian forms' },
  hisuian: { fr: 'formes de Hisui', en: 'Hisuian forms' },
  paldean: { fr: 'formes de Paldea', en: 'Paldean forms' },
};

const TYPE_LABEL: Record<string, { fr: string; en: string }> = {
  bug: { fr: 'Insecte', en: 'Bug' }, dark: { fr: 'Ténèbres', en: 'Dark' },
  dragon: { fr: 'Dragon', en: 'Dragon' }, electric: { fr: 'Électrik', en: 'Electric' },
  fairy: { fr: 'Fée', en: 'Fairy' }, fighting: { fr: 'Combat', en: 'Fighting' },
  fire: { fr: 'Feu', en: 'Fire' }, flying: { fr: 'Vol', en: 'Flying' },
  ghost: { fr: 'Spectre', en: 'Ghost' }, grass: { fr: 'Plante', en: 'Grass' },
  ground: { fr: 'Sol', en: 'Ground' }, ice: { fr: 'Glace', en: 'Ice' },
  normal: { fr: 'Normal', en: 'Normal' }, poison: { fr: 'Poison', en: 'Poison' },
  psychic: { fr: 'Psy', en: 'Psychic' }, rock: { fr: 'Roche', en: 'Rock' },
  steel: { fr: 'Acier', en: 'Steel' }, water: { fr: 'Eau', en: 'Water' },
};

const listOf = (
  values: string[],
  dictionary: Record<string, { fr: string; en: string }>,
  locale: 'fr' | 'en',
) => values.map((value) => dictionary[value.toLowerCase()]?.[locale] ?? value).join(', ');

/** Résumé lisible des restrictions d'une ligue (valeurs traduites incluses). */
export function describeFilters(
  filters: LeagueFilters | null | undefined,
  cpLimit: number | null,
  locale: 'fr' | 'en' = 'fr',
): string[] {
  const out: string[] = [];
  const fr = locale === 'fr';

  out.push(
    cpLimit == null
      ? fr
        ? 'Pas de limite de PC.'
        : 'No CP limit.'
      : fr
        ? `PC maximum : ${cpLimit}.`
        : `Maximum CP: ${cpLimit}.`,
  );

  for (const f of filters?.include ?? []) {
    if (f.filterType === 'type' && f.values?.length) {
      const types = listOf(f.values, TYPE_LABEL, locale);
      out.push(fr ? `Types autorisés : ${types}.` : `Allowed types: ${types}.`);
    }
    if (f.filterType === 'tag' && f.values?.length) {
      const tags = listOf(f.values, TAG_LABEL, locale);
      out.push(fr ? `Uniquement : ${tags}.` : `Only: ${tags}.`);
    }
    if (f.filterType === 'id' && f.values?.length) {
      out.push(
        fr
          ? `Seules ${f.values.length} espèces sélectionnées sont autorisées.`
          : `Only ${f.values.length} selected species are allowed.`,
      );
    }
  }

  for (const f of filters?.exclude ?? []) {
    if (f.filterType === 'tag' && f.values?.length) {
      const tags = listOf(f.values, TAG_LABEL, locale);
      out.push(fr ? `Interdits : ${tags}.` : `Not allowed: ${tags}.`);
    }
    if (f.filterType === 'type' && f.values?.length) {
      const types = listOf(f.values, TYPE_LABEL, locale);
      out.push(fr ? `Types interdits : ${types}.` : `Banned types: ${types}.`);
    }
    if (f.filterType === 'id' && f.values?.length) {
      out.push(
        fr
          ? `${f.values.length} espèce(s) bannie(s) individuellement.`
          : `${f.values.length} individually banned species.`,
      );
    }
  }

  return out;
}
