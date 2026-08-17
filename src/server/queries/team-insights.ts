import 'server-only';
import { prisma } from '@/server/db';
import { loadEvolutionIndex, evolutionLine, type EvolutionNode } from './evolution';
import type { TeamView } from './teams';

/** Un adversaire cité par PvPoke, résolu pour l'affichage. */
export type OpponentView = {
  speciesId: string;
  nameFr: string;
  nameEn: string;
  iconFile: string;
  types: string[];
  /** Note PvPoke du duel, sur 1000. Au-dessus de 500, le duel est gagné. */
  rating: number;
};

export type MemberInsight = {
  memberId: string;
  evolution: EvolutionNode[];
  /** Les duels les mieux tenus, puis les plus mal. Vides hors classement. */
  bestAgainst: OpponentView[];
  strugglesAgainst: OpponentView[];
};

type RawMatchup = { opponent: string; rating: number };

/** Le survol n'en montre qu'une poignée : en envoyer trente n'aiderait personne. */
const SHOWN = 5;

const asMatchups = (value: unknown): RawMatchup[] =>
  Array.isArray(value) ? (value as RawMatchup[]) : [];

/**
 * Lignée d'évolution et duels de référence, membre par membre.
 *
 * Les duels viennent de PvPoke et sont **propres à une ligue** : sans ligue
 * choisie sur l'équipe, ils n'auraient pas de sens et restent vides. La lignée,
 * elle, ne dépend de rien et s'affiche toujours.
 */
export async function getTeamInsights(team: TeamView): Promise<MemberInsight[]> {
  const evoIndex = await loadEvolutionIndex();

  const base: MemberInsight[] = team.members.map((member) => ({
    memberId: member.id,
    evolution: evolutionLine(evoIndex, member.pokemon.speciesId),
    bestAgainst: [],
    strugglesAgainst: [],
  }));

  if (!team.league) return base;

  const entries = await prisma.metaEntry.findMany({
    where: {
      league: { key: team.league.key },
      category: 'OVERALL',
      pokemon: { id: { in: team.members.map((member) => member.pokemon.id) } },
    },
    select: { matchups: true, counters: true, pokemon: { select: { id: true } } },
  });
  const byPokemon = new Map(entries.map((entry) => [entry.pokemon.id, entry]));

  // Une seule requête pour tous les adversaires cités, quel que soit le membre.
  const opponentIds = new Set<string>();
  for (const entry of entries) {
    for (const row of [...asMatchups(entry.matchups), ...asMatchups(entry.counters)]) {
      opponentIds.add(row.opponent);
    }
  }
  const opponents = opponentIds.size
    ? await prisma.pokemon.findMany({
        where: { speciesId: { in: [...opponentIds] } },
        select: { speciesId: true, nameFr: true, nameEn: true, iconFile: true, types: true },
      })
    : [];
  const opponentBySpecies = new Map(opponents.map((row) => [row.speciesId, row]));

  const resolve = (rows: RawMatchup[]): OpponentView[] =>
    rows
      .slice(0, SHOWN)
      .flatMap((row) => {
        const found = opponentBySpecies.get(row.opponent);
        return found ? [{ ...found, rating: row.rating }] : [];
      });

  return base.map((insight, index) => {
    const entry = byPokemon.get(team.members[index].pokemon.id);
    if (!entry) return insight;
    return {
      ...insight,
      bestAgainst: resolve(asMatchups(entry.matchups)),
      strugglesAgainst: resolve(asMatchups(entry.counters)),
    };
  });
}
