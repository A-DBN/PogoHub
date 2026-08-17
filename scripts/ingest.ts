/**
 * CLI d'ingestion.
 *   npm run ingest                     → tout
 *   npm run ingest -- pokemon leagues  → seulement ces étapes
 *   npm run ingest -- meta --leagues great,ultra,master --limit 200
 */
import 'dotenv/config';
import { runIngest, type IngestKind } from '../src/server/ingest';

const KINDS: IngestKind[] = [
  'pokemon', 'pvemoves', 'sprites', 'leagues', 'meta', 'news', 'shiny', 'raids',
];

function parseArgs(argv: string[]) {
  const kinds: IngestKind[] = [];
  let metaLimit: number | undefined;
  let leagueKeys: string[] | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit') metaLimit = Number(argv[++i]);
    else if (arg === '--leagues') leagueKeys = argv[++i]?.split(',').filter(Boolean);
    else if (KINDS.includes(arg as IngestKind)) kinds.push(arg as IngestKind);
    else if (arg.startsWith('-')) console.warn(`Option inconnue ignorée : ${arg}`);
  }
  return { kinds: kinds.length ? kinds : KINDS, metaLimit, leagueKeys };
}

async function main() {
  const { kinds, metaLimit, leagueKeys } = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  console.log(`▶ Ingestion : ${kinds.join(', ')}`);
  if (leagueKeys) console.log(`  ligues : ${leagueKeys.join(', ')}`);
  if (metaLimit) console.log(`  limite méta : ${metaLimit} entrées / catégorie`);

  const results = await runIngest(kinds, { metaLimit, leagueKeys });

  for (const [kind, value] of Object.entries(results)) {
    console.log(`\n=== ${kind}`);
    console.dir(value, { depth: 2 });
  }
  console.log(`\n✔ Terminé en ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
}

main()
  .catch((error) => {
    console.error('✖ Ingestion échouée :', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import('../src/server/db');
    await prisma.$disconnect();
  });
