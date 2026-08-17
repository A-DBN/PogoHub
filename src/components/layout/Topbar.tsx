'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, UserRound } from 'lucide-react';
import { useT } from '@/i18n/client';
import { LOCALES, LOCALE_COOKIE, type Locale } from '@/i18n/config';
import { cn } from '@/lib/cn';

export function Topbar({
  user,
  logout,
}: {
  user: { username: string | null; email: string; role: string } | null;
  logout: (formData: FormData) => Promise<void>;
}) {
  const { dict, locale } = useT();
  const pathname = usePathname();

  const swapLocale = (target: Locale) => {
    const rest = pathname.replace(new RegExp(`^/(${LOCALES.join('|')})`), '');
    return `/${target}${rest || '/dashboard'}`;
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-end gap-2.5 bg-bg/70 px-4 py-3 backdrop-blur-xl md:px-6">
      <div className="flex overflow-hidden rounded-xl bg-white/[0.05] p-0.5">
        {LOCALES.map((code) => (
          <Link
            key={code}
            href={swapLocale(code)}
            onClick={() => {
              document.cookie = `${LOCALE_COOKIE}=${code};path=/;max-age=31536000`;
            }}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-bold uppercase transition',
              code === locale
                ? 'bg-gradient-to-b from-brand to-[#5474f0] text-white shadow-[0_6px_14px_-8px_rgba(108,140,255,0.9)]'
                : 'text-muted hover:text-ink',
            )}
          >
            {code}
          </Link>
        ))}
      </div>

      {user ? (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-1.5 text-sm">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-white">
              <UserRound size={13} />
            </span>
            {user.username ?? user.email}
            {user.role !== 'USER' ? (
              <span className="rounded-md bg-warn/20 px-1.5 py-0.5 text-[10px] font-bold text-warn">
                {user.role}
              </span>
            ) : null}
          </span>
          <form action={logout}>
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              title={dict.nav.logout}
              className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-danger/12 hover:text-danger"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      ) : (
        <Link
          href={`/${locale}/login`}
          className="rounded-xl bg-gradient-to-b from-brand to-[#5474f0] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_-10px_rgba(108,140,255,0.9)] transition hover:brightness-110"
        >
          {dict.nav.login}
        </Link>
      )}
    </header>
  );
}
