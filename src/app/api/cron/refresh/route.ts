import { runIngest, type IngestKind } from '@/server/ingest';
import { invalidateCounterCandidates } from '@/server/queries/counters';

/**
 * Rafraîchissement périodique des données externes.
 *
 * Appelé par Vercel Cron, qui envoie `Authorization: Bearer $CRON_SECRET`.
 * Sans ce jeton la route refuse : elle déclenche des ingestions lourdes et
 * serait sinon un moyen commode de saturer la base.
 *
 * `?kinds=news,raids` restreint aux étapes voulues ; par défaut on rafraîchit
 * ce qui bouge d'une semaine à l'autre — le catalogue Pokémon, lui, ne bouge
 * qu'à une mise à jour du jeu et se relance à la main depuis `/admin`.
 */
const DEFAULT_KINDS: IngestKind[] = ['news', 'raids', 'shiny', 'meta'];
const ALLOWED = new Set<IngestKind>([
  'pokemon', 'pvemoves', 'sprites', 'leagues', 'meta', 'news', 'shiny', 'raids',
]);

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ ok: false, error: 'CRON_SECRET manquant' }, { status: 500 });
  }

  const header = request.headers.get('authorization');
  if (header !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'non autorisé' }, { status: 401 });
  }

  const requested = new URL(request.url).searchParams.get('kinds');
  const kinds = requested
    ? (requested.split(',').filter((kind) => ALLOWED.has(kind as IngestKind)) as IngestKind[])
    : DEFAULT_KINDS;
  if (!kinds.length) {
    return Response.json({ ok: false, error: 'aucune étape valide' }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const results = await runIngest(kinds);
    // le vivier de contres vit en mémoire du processus : il devient périmé
    invalidateCounterCandidates();
    return Response.json({
      ok: true,
      kinds,
      seconds: Math.round((Date.now() - startedAt) / 100) / 10,
      results,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        kinds,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
