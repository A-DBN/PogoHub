/**
 * Applique les migrations avant le build, en tenant compte de Neon.
 *
 * Deux obstacles, tous deux rencontrés en vrai :
 *
 * 1. Le calcul Neon se met en veille. La première connexion le réveille, ce qui
 *    dépasse le délai de 10 s que Prisma s'accorde pour prendre son verrou
 *    consultatif — et le build échoue **même sans migration à appliquer**.
 * 2. Le verrou lui-même n'est pas fiable derrière le routeur de Neon.
 *
 * On désactive donc le verrou (documenté par Prisma pour ce cas) *et* on
 * réessaie : le premier échec sert de réveil, le suivant passe. Sans le
 * verrou, deux migrations simultanées pourraient s'entrelacer ; Vercel
 * sérialise les builds d'un même projet, le risque reste théorique.
 *
 * Lancé par `npm run build`. Pour un build local sans base : `npm run build:local`.
 */
import { spawnSync } from 'node:child_process';

const ATTEMPTS = 3;
/** Laisse au calcul Neon le temps de sortir de veille entre deux essais. */
const PAUSE_MS = 5000;

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: 'true' },
  });

  if (result.status === 0) process.exit(0);

  if (attempt < ATTEMPTS) {
    console.warn(
      `\nMigration : essai ${attempt}/${ATTEMPTS} échoué — nouvelle tentative dans ` +
        `${PAUSE_MS / 1000} s (la base sort peut-être de veille).\n`,
    );
    sleep(PAUSE_MS);
  }
}

console.error('\nMigration : échec après ' + ATTEMPTS + ' tentatives.');
process.exit(1);
