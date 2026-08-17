/** Ingestion des Pokémon, attaques et movepools depuis le game master PvPoke. */
import { prisma } from '@/server/db';
import { generationOf } from '@/lib/pogo/stats';
import { SOURCES, fetchJson } from './sources';
import { loadGameText, splitSpeciesName, FORM_FR } from './i18n-game';
import { loadIconIndex, resolveIcon, shinyFile } from './icon-resolver';
import type { GameMaster, GmMove } from './pvpoke-types';

export type PokemonIngestResult = {
  pokemon: number;
  moves: number;
  movepool: number;
  iconsExact: number;
  iconsFallback: string[];
  movesWithoutFrench: string[];
};

const kindOf = (move: GmMove): 'FAST' | 'CHARGED' =>
  move.energyGain > 0 ? 'FAST' : 'CHARGED';

/** Le game master utilise parfois `false` là où l'on attend un nombre. */
const asInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;

export async function ingestPokemon(
  gameMaster?: GameMaster,
): Promise<PokemonIngestResult> {
  const gm = gameMaster ?? (await fetchJson<GameMaster>(SOURCES.gamemaster));
  const [text, icons] = await Promise.all([loadGameText(gm.moves), loadIconIndex()]);

  // --- attaques -------------------------------------------------------------
  for (const move of gm.moves) {
    const data = {
      nameEn: move.name,
      nameFr: text.moveFr.get(move.moveId) ?? move.name,
      type: move.type,
      kind: kindOf(move),
      power: move.power ?? 0,
      energy: move.energy ?? 0,
      energyGain: move.energyGain ?? 0,
      turns: move.cooldown ? Math.max(1, Math.round(move.cooldown / 500)) : 1,
      buffs: move.buffs ? { buffs: move.buffs, target: move.buffTarget, chance: move.buffApplyChance } : undefined,
    };
    await prisma.move.upsert({
      where: { moveId: move.moveId },
      create: { moveId: move.moveId, ...data },
      update: data,
    });
  }
  const moveIds = new Map(
    (await prisma.move.findMany({ select: { id: true, moveId: true } })).map((m) => [
      m.moveId,
      m.id,
    ]),
  );

  // --- pokémon --------------------------------------------------------------
  const iconsFallback: string[] = [];
  let iconsExact = 0;
  let movepool = 0;

  for (const p of gm.pokemon) {
    const { base, form, shadow } = splitSpeciesName(p.speciesName);
    const icon = resolveIcon(icons, p.dex, form);
    if (icon.exact) iconsExact++;
    else iconsFallback.push(p.speciesName);

    const data = {
      dex: p.dex,
      nameEn: base,
      nameFr: text.speciesFr.get(p.dex) ?? base,
      form,
      formFr: form ? (FORM_FR[form] ?? form) : null,
      isShadow: shadow,
      shadowEligible: (p.tags ?? []).includes('shadoweligible'),
      types: p.types.filter((t) => t && t !== 'none'),
      baseAtk: p.baseStats.atk,
      baseDef: p.baseStats.def,
      baseHp: p.baseStats.hp,
      tags: p.tags ?? [],
      familyId: p.family?.id ?? null,
      parentSpeciesId: p.family?.parent ?? null,
      evolutionIds: p.family?.evolutions ?? [],
      buddyKm: asInt(p.buddyDistance),
      thirdMoveCost: asInt(p.thirdMoveCost),
      thirdMoveStardust: asInt(p.thirdMoveStardust),
      eliteMoves: [...(p.eliteMoves ?? []), ...(p.legacyMoves ?? [])],
      iconFile: icon.file,
      shinyIconFile: shinyFile(icons, icon.file),
      generation: generationOf(p.dex),
      released: p.released !== false,
      defaultIvs: p.defaultIVs ?? undefined,
    };

    const row = await prisma.pokemon.upsert({
      where: { speciesId: p.speciesId },
      create: { speciesId: p.speciesId, ...data },
      update: data,
      select: { id: true },
    });

    const elite = new Set(data.eliteMoves);
    const pool = [...(p.fastMoves ?? []), ...(p.chargedMoves ?? [])]
      .map((moveId) => ({ moveId, dbId: moveIds.get(moveId) }))
      .filter((m): m is { moveId: string; dbId: string } => Boolean(m.dbId));

    await prisma.pokemonMove.deleteMany({ where: { pokemonId: row.id } });
    if (pool.length) {
      await prisma.pokemonMove.createMany({
        data: pool.map((m) => ({
          pokemonId: row.id,
          moveId: m.dbId,
          isElite: elite.has(m.moveId),
        })),
        skipDuplicates: true,
      });
      movepool += pool.length;
    }
  }

  return {
    pokemon: gm.pokemon.length,
    moves: gm.moves.length,
    movepool,
    iconsExact,
    iconsFallback,
    movesWithoutFrench: text.missingMoves,
  };
}
