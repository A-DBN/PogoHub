/**
 * Analyse des libellés d'espèce venus de LeekDuck.
 *
 * LeekDuck écrit la forme en préfixe (« Galarian Mr. Mime », « Mega Charizard Y »)
 * ou entre parenthèses (« Giratina (Altered) »), et les deux peuvent se cumuler,
 * alors qu'en base la forme est une colonne à part (`Pokemon.form` : "Galarian",
 * "Mega Y", "Altered", "Galarian Zen"…).
 */

/**
 * Formes que LeekDuck écrit en préfixe, orthographiées comme dans `Pokemon.form`.
 * Aucune espèce ne commence par un de ces mots, le préfixe est donc sans ambiguïté.
 */
const PREFIX_FORMS = ['Alolan', 'Galarian', 'Hisuian', 'Paldean', 'Primal'] as const;

export type SpeciesLabel = {
  /** Nom d'espèce nu, tel que `Pokemon.nameEn` / `nameFr`. */
  baseName: string;
  /** Formes de la plus précise à la plus large, à essayer dans l'ordre. */
  forms: string[];
  shadow: boolean;
};

export function parseSpeciesLabel(label: string): SpeciesLabel {
  let rest = label.trim();

  const shadow = /^shadow\s+/i.test(rest);
  if (shadow) rest = rest.replace(/^shadow\s+/i, '').trim();

  // « Giratina (Altered) » : forme entre parenthèses.
  let parenForm: string | null = null;
  const parens = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(rest);
  if (parens) {
    rest = parens[1].trim();
    parenForm = parens[2].trim();
  }

  // « Mega Charizard Y » → « Mega Y » ; « Mega Garchomp » → « Mega ».
  let prefixForm: string | null = null;
  const mega = /^mega\s+(.+)$/i.exec(rest);
  if (mega) {
    const letter = /\s+([XY])$/i.exec(mega[1]);
    rest = (letter ? mega[1].slice(0, letter.index) : mega[1]).trim();
    prefixForm = letter ? `Mega ${letter[1].toUpperCase()}` : 'Mega';
  } else {
    for (const prefix of PREFIX_FORMS) {
      const m = new RegExp(`^${prefix}\\s+(.+)$`, 'i').exec(rest);
      if (m) {
        rest = m[1].trim();
        prefixForm = prefix;
        break;
      }
    }
  }

  // « Galarian Darmanitan (Zen) » → forme « Galarian Zen », sinon l'une des deux.
  const forms: string[] = [];
  if (prefixForm && parenForm) forms.push(`${prefixForm} ${parenForm}`);
  if (prefixForm) forms.push(prefixForm);
  if (parenForm) forms.push(parenForm);

  return { baseName: rest, forms, shadow };
}
