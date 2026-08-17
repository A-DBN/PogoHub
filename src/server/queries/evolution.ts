import 'server-only';
import { prisma } from '@/server/db';

export type EvolutionNode = {
  speciesId: string;
  nameFr: string;
  nameEn: string;
  formFr: string | null;
  form: string | null;
  iconFile: string;
  current: boolean;
};

type Entry = {
  speciesId: string;
  nameFr: string;
  nameEn: string;
  form: string | null;
  formFr: string | null;
  iconFile: string;
  parentSpeciesId: string | null;
  evolutionIds: string[];
};

export type EvolutionIndex = Map<string, Entry>;

/** Index chargé une fois par requête pour construire les lignées sans N+1. */
export async function loadEvolutionIndex(): Promise<EvolutionIndex> {
  const rows = await prisma.pokemon.findMany({
    where: { isShadow: false },
    select: {
      speciesId: true, nameFr: true, nameEn: true, form: true, formFr: true,
      iconFile: true, parentSpeciesId: true, evolutionIds: true,
    },
  });
  return new Map(rows.map((row) => [row.speciesId, row]));
}

/** Pré-évolutions puis évolutions (familles à embranchements incluses). */
export function evolutionLine(
  index: EvolutionIndex,
  speciesId: string,
): EvolutionNode[] {
  const start = index.get(speciesId.replace(/_shadow$/, ''));
  if (!start) return [];

  const chain: Entry[] = [];
  let cursor: Entry | undefined = start;
  let guard = 0;
  while (cursor?.parentSpeciesId && guard++ < 5) {
    const parent = index.get(cursor.parentSpeciesId);
    if (!parent) break;
    chain.unshift(parent);
    cursor = parent;
  }

  chain.push(start);

  let last: Entry | undefined = start;
  guard = 0;
  while (last?.evolutionIds?.length && guard++ < 5) {
    const children: Entry[] = last.evolutionIds
      .map((id) => index.get(id))
      .filter((child): child is Entry => Boolean(child));
    if (!children.length) break;
    chain.push(...children);
    last = children.length === 1 ? children[0] : undefined;
  }

  return chain.map((entry) => ({
    speciesId: entry.speciesId,
    nameFr: entry.nameFr,
    nameEn: entry.nameEn,
    form: entry.form,
    formFr: entry.formFr,
    iconFile: entry.iconFile,
    current: entry.speciesId === start.speciesId,
  }));
}
