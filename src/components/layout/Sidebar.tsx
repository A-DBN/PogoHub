'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ListOrdered, Users, Swords, Sparkles, Shield,
  Newspaper, UserRound, Wrench, ShieldCheck, Menu, X, Settings, Repeat,
} from 'lucide-react';
import { useState } from 'react';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/cn';

type Item = { href: string; label: string; icon: typeof LayoutDashboard };

export function Sidebar({
  role,
}: {
  role: 'GUEST' | 'USER' | 'CONTRIBUTOR' | 'ADMIN';
}) {
  const { dict, locale } = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const base = `/${locale}`;
  const pvp: Item[] = [
    { href: `${base}/dashboard`, label: dict.nav.dashboard, icon: LayoutDashboard },
    { href: `${base}/list`, label: dict.nav.list, icon: ListOrdered },
    { href: `${base}/teams`, label: dict.nav.teams, icon: Users },
    { href: `${base}/simulation`, label: dict.nav.simulation, icon: Swords },
  ];
  const pve: Item[] = [
    { href: `${base}/raids`, label: dict.nav.raids, icon: Swords },
    { href: `${base}/counters`, label: dict.nav.counters, icon: Shield },
  ];
  // Le Shiny Dex nourrit la liste d'échange : les deux vont ensemble, et le
  // Dex n'avait rien à faire sous « PvE ».
  const collection: Item[] = [
    { href: `${base}/shinydex`, label: dict.nav.shinydex, icon: Sparkles },
  ];
  if (role !== 'GUEST') {
    collection.push({ href: `${base}/trades`, label: dict.nav.trades, icon: Repeat });
  }
  const general: Item[] = [
    { href: `${base}/players`, label: dict.nav.players, icon: UserRound },
    { href: `${base}/news`, label: dict.nav.news, icon: Newspaper },
  ];
  // Réservé aux comptes : un visiteur n'a pas de profil à régler.
  if (role !== 'GUEST') {
    general.push({ href: `${base}/settings`, label: dict.nav.settings, icon: Settings });
  }
  const staff: Item[] = [];
  if (role === 'CONTRIBUTOR' || role === 'ADMIN') {
    staff.push({ href: `${base}/meta-admin`, label: dict.nav.meta, icon: Wrench });
  }
  if (role === 'ADMIN') {
    staff.push({ href: `${base}/admin`, label: dict.nav.admin, icon: ShieldCheck });
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const Group = ({
    title,
    items,
    accent,
  }: {
    title?: string;
    items: Item[];
    accent?: string;
  }) =>
    items.length === 0 ? null : (
      <div className="mb-5">
        {title ? (
          <div
            className="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-bold uppercase tracking-widest"
            style={{ color: accent }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
            {title}
          </div>
        ) : null}
        <nav className="flex flex-col gap-0.5">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                'group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition',
                isActive(href)
                  ? 'bg-white/[0.08] font-semibold text-ink shadow-[0_10px_20px_-16px_rgba(0,0,0,1)]'
                  : 'text-muted hover:bg-white/[0.045] hover:text-ink',
              )}
              style={
                isActive(href) && accent
                  ? { boxShadow: `inset 2px 0 0 ${accent}, 0 10px 20px -16px rgba(0,0,0,1)` }
                  : undefined
              }
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed left-3 top-3 z-50 rounded-xl border border-white/10 bg-surface/90 p-2 backdrop-blur md:hidden"
        aria-label="Menu"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-60 shrink-0 bg-gradient-to-b from-white/[0.05] to-transparent px-3 py-4 backdrop-blur-xl transition-transform md:sticky md:top-0 md:h-dvh md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Link
          href={`${base}/dashboard`}
          className="mb-6 flex items-center gap-2 px-2 text-base font-bold"
        >
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-[0_10px_20px_-12px_rgba(108,140,255,1)]">
            ⚡
          </span>
          {dict.app.name}
        </Link>

        <Group title={dict.nav.pvp} items={pvp} accent="var(--color-pvp)" />
        <Group title={dict.nav.pve} items={pve} accent="var(--color-pve)" />
        <Group title={dict.nav.collection} items={collection} accent="var(--color-warn)" />
        <Group items={general} />
        <Group items={staff} accent="var(--color-warn)" />
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="close"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      ) : null}
    </>
  );
}
