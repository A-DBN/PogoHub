/**
 * Statistiques JcE des attaques (raids, combats Dynamax).
 *
 * PvPoke ne publie que le modèle JcJ (par tours) : une attaque y a une durée en
 * tours de 0,5 s et une énergie recalibrée pour le JcJ. En raid, le jeu utilise
 * d'autres valeurs — puissance, durée d'animation en ms, fenêtre de dégâts —
 * qui ne vivent que dans le GAME_MASTER complet de PokeMiners.
 */
import { prisma } from '@/server/db';
import { SOURCES, fetchJson } from './sources';

type MoveSettings = {
  /** Généralement le nom de l'attaque, mais numérique pour quelques inédites. */
  movementId: string | number;
  power?: number;
  energyDelta?: number;
  durationMs?: number;
  damageWindowStartMs?: number;
};

type GameMasterTemplate = {
  templateId?: string;
  data?: { moveSettings?: MoveSettings };
};

/** Les modèles d'attaque JcE sont les `V0253_MOVE_…`, pas les `COMBAT_V…`. */
const PVE_MOVE_TEMPLATE = /^V\d{4}_MOVE_/;

/**
 * Écritures PvPoke sans équivalent direct dans le GAME_MASTER.
 * En JcE la puissance de Puissance Cachée ne dépend pas du type : la seule
 * entrée `HIDDEN_POWER_FAST` vaut donc pour toutes ses déclinaisons.
 */
function aliasesFor(moveId: string): string[] {
  const aliases = [moveId];
  if (moveId.startsWith('HIDDEN_POWER_')) aliases.push('HIDDEN_POWER_FAST');
  // PvPoke suffixe « _PLUS » les versions renforcées ; le JcE ne les distingue pas
  if (moveId.endsWith('_PLUS')) aliases.push(moveId.slice(0, -'_PLUS'.length));
  // les attaques chargées d'Aegislash reprennent l'attaque de base
  if (moveId.startsWith('AEGISLASH_CHARGE_')) {
    aliases.push(moveId.slice('AEGISLASH_CHARGE_'.length));
  }
  // le GAME_MASTER colle certains noms composés
  if (moveId === 'PYRO_BALL') aliases.push('PYROBALL');
  if (moveId.startsWith('FUTURE_SIGHT')) aliases.push('FUTURESIGHT');
  if (moveId === 'TECHNO_BLAST_DOUSE') aliases.push('TECHNO_BLAST_WATER');
  return aliases;
}

export type PveMoveIngestResult = {
  templates: number;
  updated: number;
  /** Attaques en base restées sans statistiques JcE. */
  missing: string[];
};

export async function ingestPveMoves(): Promise<PveMoveIngestResult> {
  const templates = await fetchJson<GameMasterTemplate[]>(SOURCES.gameMasterFull);

  // Le moveId en base perd le suffixe « _FAST » (sauf les variantes nommées,
  // type WATER_GUN_FAST_BLASTOISE) : on indexe les deux écritures.
  const byMoveId = new Map<string, MoveSettings>();
  let count = 0;
  for (const template of templates) {
    const templateId = template.templateId ?? '';
    if (!PVE_MOVE_TEMPLATE.test(templateId)) continue;
    const settings = template.data?.moveSettings;
    if (!settings) continue;
    // `movementId` est numérique pour quelques attaques inédites : le nom est
    // toujours dans le templateId, on part donc de là.
    const name = templateId.replace(PVE_MOVE_TEMPLATE, '');
    if (!name) continue;
    count++;
    byMoveId.set(name, settings);
    const stripped = name.replace(/_FAST$/, '');
    if (!byMoveId.has(stripped)) byMoveId.set(stripped, settings);
  }

  const moves = await prisma.move.findMany({ select: { id: true, moveId: true } });
  const missing: string[] = [];
  let updated = 0;

  for (const move of moves) {
    const settings = aliasesFor(move.moveId)
      .map((alias) => byMoveId.get(alias))
      .find((found) => found?.durationMs != null);
    if (!settings || settings.durationMs == null) {
      missing.push(move.moveId);
      continue;
    }
    await prisma.move.update({
      where: { id: move.id },
      data: {
        pvePower: settings.power ?? 0,
        pveEnergy: settings.energyDelta ?? 0,
        pveDurationMs: settings.durationMs,
        pveWindowMs: settings.damageWindowStartMs ?? settings.durationMs,
      },
    });
    updated++;
  }

  return { templates: count, updated, missing };
}
