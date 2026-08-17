'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, ColumnLabel } from '@/components/ui';
import { Dropdown } from '@/components/ui/Dropdown';
import { PlayerAvatar } from '@/components/players/PlayerAvatar';
import { useT } from '@/i18n/client';
import type { Locale } from '@/i18n/config';
import { setUserRole } from '@/server/actions/admin';
import type { AdminUser } from '@/server/queries/admin';

export function UserTable({
  users,
  currentUserId,
  locale,
}: {
  users: AdminUser[];
  /** Sert à empêcher visuellement l'auto-rétrogradation. */
  currentUserId: string;
  locale: Locale;
}) {
  const { dict } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const change = (userId: string, role: string) => {
    setError(null);
    startTransition(async () => {
      const result = await setUserRole(userId, role);
      if (!result.ok) {
        setError(result.message === 'SELF_DEMOTE' ? dict.admin.selfDemote : dict.admin.forbidden);
        return;
      }
      router.refresh();
    });
  };

  const roles = (['USER', 'CONTRIBUTOR', 'ADMIN'] as const).map((value) => ({
    value,
    label: dict.admin.roles[value],
  }));

  return (
    <div>
      {error ? <p className="mb-2 text-sm text-danger">{error}</p> : null}
      <Card className="overflow-x-auto p-1">
        <table className="w-full min-w-[38rem] text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-3 py-2"><ColumnLabel>{dict.auth.username}</ColumnLabel></th>
              <th className="px-3 py-2"><ColumnLabel>{dict.auth.email}</ColumnLabel></th>
              <th className="px-3 py-2"><ColumnLabel>{dict.nav.teams}</ColumnLabel></th>
              <th className="px-3 py-2"><ColumnLabel>{dict.admin.role}</ColumnLabel></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="odd:bg-white/[0.02]">
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <PlayerAvatar
                      username={user.username ?? user.email}
                      avatarUrl={null}
                      size={26}
                    />
                    <span className="font-medium">{user.username ?? '—'}</span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-xs text-muted">{user.email}</td>
                <td className="px-3 py-1.5 text-xs text-muted">{user.teamCount}</td>
                <td className="px-3 py-1.5">
                  <div className="w-44">
                    <Dropdown
                      size="sm"
                      value={user.role}
                      options={roles}
                      onChange={(role) => change(user.id, role)}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {pending ? <p className="mt-2 text-xs text-muted">{dict.common.loading}</p> : null}
      <p className="mt-2 text-[11px] text-muted">
        {locale === 'fr'
          ? `Votre compte (${currentUserId.slice(0, 6)}…) ne peut pas se retirer le rôle administrateur.`
          : `Your account (${currentUserId.slice(0, 6)}…) cannot remove its own admin role.`}
      </p>
    </div>
  );
}
