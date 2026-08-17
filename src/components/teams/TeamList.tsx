'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Copy, Trash2, Pencil, Globe, Lock } from 'lucide-react';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { Button, Card, EmptyState } from '@/components/ui';
import { useT } from '@/i18n/client';
import { interpolate } from '@/i18n';
import { deleteTeam, duplicateTeam } from '@/server/actions/teams';
import type { TeamView } from '@/server/queries/teams';
import { TeamEditor } from './TeamEditor';

export function TeamList({
  teams,
  leagues,
  canEdit,
  publicByDefault = false,
}: {
  teams: TeamView[];
  leagues: Array<{
    key: string;
    nameFr: string;
    nameEn: string;
    cpLimit: number | null;
    filters: unknown;
  }>;
  /** Faux sur la page publique d'un autre joueur. */
  canEdit: boolean;
  /** Préférence du compte pour les nouvelles équipes. */
  publicByDefault?: boolean;
}) {
  const { dict, locale } = useT();
  const router = useRouter();
  const [editing, setEditing] = useState<TeamView | null | 'new'>(null);
  const [pending, startTransition] = useTransition();

  const remove = (team: TeamView) => {
    if (!confirm(dict.teams.deleteConfirm)) return;
    startTransition(async () => {
      await deleteTeam(team.id);
      router.refresh();
    });
  };

  const duplicate = (team: TeamView) => {
    startTransition(async () => {
      await duplicateTeam(team.id);
      router.refresh();
    });
  };

  return (
    <div>
      {canEdit ? (
        <div className="mb-5">
          <Button onClick={() => setEditing('new')} type="button">
            <Plus size={15} />
            {dict.teams.create}
          </Button>
        </div>
      ) : null}

      {teams.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Card key={team.id} accent={team.color} className="flex flex-col p-4" hover>
              <div className="flex items-start gap-2">
                <span
                  className="mt-1 h-3 w-3 shrink-0 rounded-full"
                  style={{ background: team.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/${locale}/teams/${team.id}`}
                    className="block truncate font-bold transition hover:text-brand"
                  >
                    {team.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    {team.league ? (
                      <span>{locale === 'fr' ? team.league.nameFr : team.league.nameEn}</span>
                    ) : (
                      <span>{dict.teams.noLeague}</span>
                    )}
                    <span>·</span>
                    <span>{interpolate(dict.teams.memberCount, { n: team.members.length })}</span>
                  </div>
                </div>
                <span className="text-muted" title={team.isPublic ? dict.common.public : dict.common.private}>
                  {team.isPublic ? <Globe size={14} /> : <Lock size={14} />}
                </span>
              </div>

              <Link
                href={`/${locale}/teams/${team.id}`}
                className="mt-3 flex flex-1 items-center gap-2"
              >
                {team.members.map((member) => (
                  <PokemonIcon
                    key={member.id}
                    file={member.isShiny ? member.pokemon.shinyIconFile : member.pokemon.iconFile}
                    alt={member.pokemon.nameEn}
                    size={46}
                  />
                ))}
                {Array.from({ length: 3 - team.members.length }).map((_, index) => (
                  <span
                    key={index}
                    className="h-[46px] w-[46px] rounded-full bg-white/[0.03]"
                    aria-hidden
                  />
                ))}
              </Link>

              {canEdit ? (
                <div className="mt-3 flex gap-1">
                  <IconAction label={dict.common.edit} onClick={() => setEditing(team)}>
                    <Pencil size={14} />
                  </IconAction>
                  <IconAction label={dict.teams.duplicate} onClick={() => duplicate(team)}>
                    <Copy size={14} />
                  </IconAction>
                  <IconAction label={dict.common.delete} danger onClick={() => remove(team)}>
                    <Trash2 size={14} />
                  </IconAction>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>{canEdit ? dict.teams.noTeams : dict.teams.noPublicTeams}</EmptyState>
      )}

      {editing ? (
        <TeamEditor
          leagues={leagues}
          team={editing === 'new' ? null : editing}
          publicByDefault={publicByDefault}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {pending ? <span className="sr-only">{dict.common.loading}</span> : null}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={
        'rounded-lg bg-white/[0.04] p-1.5 text-muted transition hover:bg-white/[0.09] ' +
        (danger ? 'hover:text-danger' : 'hover:text-ink')
      }
    >
      {children}
    </button>
  );
}
