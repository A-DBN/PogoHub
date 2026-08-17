import 'server-only';
import { prisma } from '@/server/db';
import type { Role } from '@/generated/prisma/enums';

export type AdminUser = {
  id: string;
  email: string;
  username: string | null;
  role: Role;
  createdAt: string;
  teamCount: number;
};

export type IngestRunView = {
  id: string;
  kind: string;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  /** Compteurs renvoyés par l'étape, tels quels. */
  counts: unknown;
  error: string | null;
  durationMs: number | null;
};

export type AdminOverview = {
  users: AdminUser[];
  runs: IngestRunView[];
  /** Dernier import réussi par étape, pour repérer ce qui n'a pas tourné. */
  lastSuccess: Record<string, string>;
  counts: {
    pokemon: number;
    moves: number;
    leagues: number;
    metaEntries: number;
    news: number;
    teams: number;
    users: number;
  };
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const [users, runs, counts] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, email: true, username: true, role: true, createdAt: true,
        _count: { select: { teams: true } },
      },
    }),
    prisma.ingestRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 30,
      select: {
        id: true, kind: true, source: true, startedAt: true, finishedAt: true,
        ok: true, counts: true, error: true,
      },
    }),
    Promise.all([
      prisma.pokemon.count(),
      prisma.move.count(),
      prisma.league.count(),
      prisma.metaEntry.count(),
      prisma.newsItem.count(),
      prisma.team.count(),
      prisma.user.count(),
    ]),
  ]);

  // dernier succès par étape : une étape absente n'a jamais abouti
  const successes = await prisma.ingestRun.findMany({
    where: { ok: true },
    orderBy: { startedAt: 'desc' },
    select: { kind: true, startedAt: true },
  });
  const lastSuccess: Record<string, string> = {};
  for (const run of successes) {
    lastSuccess[run.kind] ??= run.startedAt.toISOString();
  }

  return {
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      teamCount: user._count.teams,
    })),
    runs: runs.map((run) => ({
      id: run.id,
      kind: run.kind,
      source: run.source,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      ok: run.ok,
      counts: run.counts,
      error: run.error,
      durationMs: run.finishedAt
        ? run.finishedAt.getTime() - run.startedAt.getTime()
        : null,
    })),
    lastSuccess,
    counts: {
      pokemon: counts[0],
      moves: counts[1],
      leagues: counts[2],
      metaEntries: counts[3],
      news: counts[4],
      teams: counts[5],
      users: counts[6],
    },
  };
}
