import { getDictionary, isLocale, DEFAULT_LOCALE } from '@/i18n';
import { getCurrentUser, hasRole } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { getProposals } from '@/server/queries/proposals';
import { requiredApprovals } from '@/lib/pogo/proposals';
import { ProposalList } from '@/components/admin/ProposalList';
import { EmptyState, PageHeader, Section } from '@/components/ui';

export default async function MetaAdminPage({ params }: PageProps<'/[locale]/meta-admin'>) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  const user = await getCurrentUser();
  if (!hasRole(user, 'CONTRIBUTOR')) {
    return (
      <div>
        <PageHeader title={dict.admin.metaTitle} />
        <EmptyState>{dict.admin.forbidden}</EmptyState>
      </div>
    );
  }

  const [proposals, reviewers] = await Promise.all([
    getProposals(),
    // relecteurs possibles : l'auteur ne pouvant pas voter, il ne compte pas
    prisma.user.count({
      where: { role: { in: ['CONTRIBUTOR', 'ADMIN'] }, id: { not: user!.id } },
    }),
  ]);

  // Les lots à relire d'abord : c'est la seule chose qui demande une action.
  const pending = proposals.filter((proposal) => proposal.status === 'PENDING');
  const closed = proposals.filter((proposal) => proposal.status !== 'PENDING');
  const needed = requiredApprovals(reviewers);

  return (
    <div>
      <PageHeader title={dict.admin.metaTitle} subtitle={dict.admin.proposalsSubtitle} />

      <Section title={dict.admin.pendingProposals} hint={String(pending.length)}>
        <ProposalList
          proposals={pending}
          currentUserId={user!.id}
          approvalsRequired={needed}
          locale={locale}
        />
      </Section>

      {closed.length ? (
        <Section title={dict.admin.closedProposals} hint={String(closed.length)}>
          <ProposalList
            proposals={closed}
            currentUserId={user!.id}
            approvalsRequired={needed}
            locale={locale}
          />
        </Section>
      ) : null}
    </div>
  );
}
