import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ICON_SOURCE } from '@/lib/pogo/icons';
import { SPRITE_DIR } from '@/server/ingest/sprites';

/**
 * Sert les sprites PokeMiners depuis notre domaine.
 *
 * Les charger directement depuis `raw.githubusercontent.com` marche jusqu'au
 * jour où ça ne marche plus : ce n'est pas un CDN, et il répond **HTTP 429**
 * dès qu'une page en demande beaucoup — le Shiny Dex en affiche un millier.
 * Résultat côté utilisateur : des icônes qui disparaissent sans explication.
 *
 * Ici le navigateur ne parle qu'à nous. Un nom de fichier désigne toujours la
 * même image, d'où un cache `immutable` d'un an : en production le CDN sert
 * tout le monde et GitHub n'est appelé qu'une fois par sprite.
 */

/** 1×1 transparent : mieux qu'une icône cassée quand l'amont refuse. */
const BLANK = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const ONE_YEAR = 60 * 60 * 24 * 365;
const UPSTREAM_TIMEOUT_MS = 3000;

/** Un sprite est un simple nom de fichier : pas de chemin, pas de remontée. */
const SAFE_NAME = /^[A-Za-z0-9._-]+\.png$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (!SAFE_NAME.test(file)) {
    return new Response('nom de fichier invalide', { status: 400 });
  }

  // Servi localement si `npm run ingest -- sprites` est passé : c'est le cas
  // normal, GitHub n'est alors jamais sollicité.
  try {
    const local = await readFile(path.join(SPRITE_DIR, file));
    return new Response(new Uint8Array(local), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': `public, max-age=${ONE_YEAR}, immutable`,
      },
    });
  } catch {
    // pas encore rapatrié : on passe par l'amont
  }

  try {
    const upstream = await fetch(`${ICON_SOURCE}${encodeURIComponent(file)}`, {
      headers: { 'User-Agent': 'pogo-pvp-hub' },
      cache: 'force-cache',
      // amont muet ou bridé : on rend la main vite plutôt que de retenir la page
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      // 429 ou 404 : on renvoie du vide en cache court, pour réessayer plus tard
      return new Response(BLANK, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': `public, max-age=${ONE_YEAR}, immutable`,
      },
    });
  } catch {
    return new Response(BLANK, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' },
    });
  }
}
