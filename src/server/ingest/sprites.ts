/**
 * Rapatrie les sprites utilisés dans `public/sprites/`.
 *
 * PokeMiners est un dépôt Git, pas un CDN : servi depuis `raw.githubusercontent.com`
 * il répond **HTTP 429** dès qu'une page demande beaucoup d'images — le Shiny Dex
 * en affiche un millier — et les icônes disparaissent sans message. Les miroirs
 * habituels (jsDelivr, statically) refusent ce dépôt, trop volumineux.
 *
 * On télécharge donc une fois ce dont on se sert réellement : les `iconFile` et
 * `shinyIconFile` référencés en base, soit quelques milliers de PNG de ~15 Ko.
 * Ensuite l'application ne dépend plus de GitHub à l'exécution.
 */
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/server/db';
import { ICON_SOURCE } from '@/lib/pogo/icons';

export const SPRITE_DIR = path.join(process.cwd(), 'public', 'sprites');

/** Assez pour avancer, assez peu pour ne pas déclencher la limitation. */
const CONCURRENCY = 6;
const RETRIES = 4;
/** Échecs d'affilée sans le moindre succès : l'amont nous refuse, on arrête. */
const GIVE_UP_AFTER = 12;

export type SpriteIngestResult = {
  referenced: number;
  alreadyThere: number;
  downloaded: number;
  failed: string[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Un 429 se traite en ralentissant, pas en abandonnant : l'attente double à
 * chaque essai. Sans cela un lot entier échoue dès que la limite est touchée.
 */
async function download(file: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const response = await fetch(`${ICON_SOURCE}${encodeURIComponent(file)}`, {
        headers: { 'User-Agent': 'pogo-pvp-hub' },
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      if (response.status === 404) return null; // inutile d'insister
      if (response.status !== 429 && response.status < 500) return null;
    } catch {
      // réseau : on retente comme pour un 429
    }
    await sleep(1000 * 2 ** attempt);
  }
  return null;
}

export async function ingestSprites(): Promise<SpriteIngestResult> {
  await mkdir(SPRITE_DIR, { recursive: true });

  const rows = await prisma.pokemon.findMany({
    select: { iconFile: true, shinyIconFile: true },
  });
  const wanted = new Set<string>();
  for (const row of rows) {
    if (row.iconFile) wanted.add(row.iconFile);
    if (row.shinyIconFile) wanted.add(row.shinyIconFile);
  }

  const present = new Set(await readdir(SPRITE_DIR).catch(() => []));
  const missing = [...wanted].filter((file) => !present.has(file));

  const failed: string[] = [];
  let downloaded = 0;
  let consecutiveFailures = 0;
  let abandoned = false;

  // file d'attente à parallélisme borné
  let cursor = 0;
  const worker = async () => {
    while (cursor < missing.length && !abandoned) {
      const file = missing[cursor++];
      const data = await download(file);
      if (!data) {
        failed.push(file);
        // Quand GitHub bride l'adresse IP, *tout* échoue : insister pendant une
        // heure ne sert à rien. On s'arrête net pour que le rapport le dise,
        // au lieu de tourner à vide. Relancer plus tard reprend où on en est.
        if (++consecutiveFailures >= GIVE_UP_AFTER && downloaded === 0) {
          abandoned = true;
        }
        continue;
      }
      consecutiveFailures = 0;
      await writeFile(path.join(SPRITE_DIR, file), data);
      downloaded++;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (abandoned) {
    throw new Error(
      'Amont indisponible (HTTP 429 : GitHub limite cette adresse IP). ' +
        'Relancer `npm run ingest -- sprites` plus tard ; les fichiers déjà ' +
        'récupérés sont conservés.',
    );
  }

  return {
    referenced: wanted.size,
    alreadyThere: wanted.size - missing.length,
    downloaded,
    failed,
  };
}
