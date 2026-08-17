'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Undo2, MessageSquare } from 'lucide-react';
import { PokemonIcon } from '@/components/pokemon/PokemonIcon';
import { Card, ColumnLabel } from '@/components/ui';
import { useT } from '@/i18n/client';
import { interpolate } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { voteProposal, withdrawProposal } from '@/server/actions/proposals';
import type { MoveName, ProposalView, SpreadView } from '@/server/queries/proposals';
import { cn } from '@/lib/cn';

/** Un retrait et un ajout doivent se distinguer au premier coup d'œil. */
const KIND_STYLE: Record<string, string> = {
  UPDATE: 'bg-white/[0.09] text-muted',
  ADD: 'bg-success/25 text-success',
  REMOVE: 'bg-danger/25 text-danger',
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-white/[0.08] text-muted',
  APPLIED: 'bg-success/20 text-success',
  REJECTED: 'bg-danger/20 text-danger',
  WITHDRAWN: 'bg-white/[0.06] text-muted',
};

/** Une valeur proposée face à l'ancienne : c'est le cœur de la relecture. */
function Diff({
  label,
  before,
  after,
  unchanged,
}: {
  label: string;
  before: string | number | null;
  after: string | number | null;
  unchanged: string;
}) {
  if (after == null) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <ColumnLabel>{label}</ColumnLabel>
      {before != null ? (
        <span className="text-muted line-through">{before}</span>
      ) : (
        <span className="text-muted">{unchanged}</span>
      )}
      <span className="text-muted">→</span>
      <span className="font-bold text-pve">{after}</span>
    </span>
  );
}

export function ProposalList({
  proposals,
  currentUserId,
  approvalsRequired,
  locale,
}: {
  proposals: ProposalView[];
  currentUserId: string;
  approvalsRequired: number;
  locale: Locale;
}) {
  const { dict } = useT();
  const router = useRouter();

  /** Le lot stocke des identifiants d'attaques ; le relecteur lit des noms. */
  const moveNames = (list: MoveName[]) =>
    list.map((move) => (locale === 'fr' ? move.nameFr : move.nameEn)).join(', ');

  const spreadLabel = (spread: SpreadView) =>
    `${spread.cp} · ${dict.common.level} ${spread.level} · ${spread.ivs.join('/')}`;

  const [pending, startTransition] = useTransition();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const act = (run: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        setError(result.error === 'OWN_VOTE' ? dict.admin.ownVote : dict.admin.forbidden);
        return;
      }
      router.refresh();
    });
  };

  if (!proposals.length) {
    return <p className="text-sm text-muted">{dict.admin.noProposals}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {proposals.map((proposal) => {
        const mine = proposal.authorId === currentUserId;
        const myVote = proposal.votes.find((vote) => vote.userId === currentUserId);
        const open = proposal.status === 'PENDING';

        return (
          <Card key={proposal.id} className="p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-[16rem] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-muted">
                    {locale === 'fr' ? proposal.leagueNameFr : proposal.leagueNameEn} ·{' '}
                    {proposal.category}
                  </span>
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                      STATUS_STYLE[proposal.status],
                    )}
                  >
                    {dict.admin.statuses[proposal.status as keyof typeof dict.admin.statuses]}
                  </span>
                  <span className="text-[11px] text-muted">
                    {interpolate(dict.admin.pendingChanges, { count: proposal.changes.length })}
                    {proposal.author ? ` · ${proposal.author}` : ''}
                  </span>
                  {mine ? (
                    <span className="text-[10px] text-muted">{dict.admin.ownProposal}</span>
                  ) : null}
                </div>

                <p className="mt-1.5 text-sm">{proposal.reason}</p>

                {/* récapitulatif : c'est lui que le relecteur juge */}
                <div className="mt-2 flex flex-col gap-1">
                  {proposal.changes.map((change) => (
                    <div
                      key={change.speciesId}
                      className={cn(
                        'flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-xs',
                        change.kind === 'REMOVE'
                          ? 'bg-danger/10'
                          : change.kind === 'ADD'
                            ? 'bg-success/10'
                            : 'bg-white/[0.03]',
                      )}
                    >
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                          KIND_STYLE[change.kind],
                        )}
                      >
                        {dict.admin.kinds[change.kind]}
                      </span>
                      <PokemonIcon file={change.iconFile} alt={change.nameEn} size={24} />
                      <span
                        className={cn(
                          'min-w-[7rem] font-medium',
                          change.kind === 'REMOVE' && 'line-through',
                        )}
                      >
                        {locale === 'fr' ? change.nameFr : change.nameEn}
                      </span>

                      {/* Un retrait n'a pas d'« après » : on montre ce qui disparaît,
                          sinon la ligne s'affiche vide et le relecteur ne voit rien. */}
                      {change.kind === 'REMOVE' ? (
                        <span className="text-muted">
                          {dict.common.rank} {change.rank.before} · {dict.common.score}{' '}
                          {change.score.before?.toFixed(1) ?? '—'}
                          {change.moveset.before ? ` · ${moveNames(change.moveset.before)}` : ''}
                        </span>
                      ) : (
                        <>
                          <Diff
                            label={dict.common.rank}
                            before={change.kind === 'ADD' ? null : change.rank.before}
                            after={change.rank.after}
                            unchanged={dict.admin.newEntry}
                          />
                          {/* Une ligne ajoutée n'a pas de note : PvPoke ne l'a pas
                              simulée. Afficher « 0 » laisserait croire à une
                              évaluation. */}
                          {change.kind === 'ADD' && change.score.after == null ? null : (
                            <Diff
                              label={dict.common.score}
                              before={change.kind === 'ADD' ? null : change.score.before}
                              after={change.score.after}
                              unchanged={dict.admin.newEntry}
                            />
                          )}
                          <Diff
                            label={dict.common.moves}
                            before={
                              change.moveset.before ? moveNames(change.moveset.before) : null
                            }
                            after={change.moveset.after ? moveNames(change.moveset.after) : null}
                            unchanged={dict.admin.newEntry}
                          />
                          {/* Stats effectives : c'est ce que le relecteur valide
                              vraiment, et un ajout n'affichait jusqu'ici qu'un nom. */}
                          <Diff
                            label={dict.common.cp}
                            before={change.spread.before ? spreadLabel(change.spread.before) : null}
                            after={change.spread.after ? spreadLabel(change.spread.after) : null}
                            unchanged={dict.admin.newEntry}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {proposal.votes.length ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {proposal.votes.map((vote) => (
                      <span
                        key={vote.userId}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5',
                          vote.value === 'APPROVE'
                            ? 'bg-success/15 text-success'
                            : 'bg-danger/15 text-danger',
                        )}
                        title={vote.comment ?? undefined}
                      >
                        {vote.value === 'APPROVE' ? <Check size={11} /> : <X size={11} />}
                        {vote.username ?? '—'}
                        {vote.comment ? <MessageSquare size={10} /> : null}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex min-w-[11rem] flex-col items-end gap-2">
                <span className="text-[11px] font-semibold text-muted">
                  {interpolate(dict.admin.votes, {
                    approvals: proposal.approvals,
                    needed: approvalsRequired,
                  })}
                </span>

                {open && !mine ? (
                  <>
                    <input
                      value={comments[proposal.id] ?? ''}
                      onChange={(event) =>
                        setComments((current) => ({
                          ...current,
                          [proposal.id]: event.target.value,
                        }))
                      }
                      placeholder={dict.teams.notes}
                      className="w-full rounded-lg bg-white/[0.05] px-2 py-1 text-[11px] outline-none"
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          act(() =>
                            voteProposal(proposal.id, 'APPROVE', comments[proposal.id]),
                          )
                        }
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                          myVote?.value === 'APPROVE'
                            ? 'bg-success/25 text-success'
                            : 'bg-white/[0.06] hover:bg-white/[0.12]',
                        )}
                      >
                        <Check size={13} />
                        {dict.admin.approve}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          act(() => voteProposal(proposal.id, 'REJECT', comments[proposal.id]))
                        }
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                          myVote?.value === 'REJECT'
                            ? 'bg-danger/25 text-danger'
                            : 'bg-white/[0.06] hover:bg-white/[0.12]',
                        )}
                      >
                        <X size={13} />
                        {dict.admin.reject}
                      </button>
                    </div>
                  </>
                ) : null}

                {open && mine ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => withdrawProposal(proposal.id))}
                    className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-semibold transition hover:bg-white/[0.12]"
                  >
                    <Undo2 size={13} />
                    {dict.admin.withdraw}
                  </button>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
