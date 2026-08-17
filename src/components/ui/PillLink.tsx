import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const BRAND = '#6c8cff';

/**
 * Pilule de navigation unique pour toutes les barres de filtres :
 * même forme et même typographie partout, seule la teinte active change.
 */
export function PillLink({
  href,
  active,
  color = BRAND,
  children,
}: {
  href: string;
  active: boolean;
  color?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-sm font-medium transition duration-150',
        active
          ? 'font-semibold text-white'
          : 'text-muted hover:bg-white/[0.06] hover:text-ink',
      )}
      style={
        active
          ? {
              background: `linear-gradient(180deg, ${color}, ${color}cc)`,
              boxShadow: `0 10px 20px -12px ${color}`,
            }
          : undefined
      }
    >
      {children}
    </Link>
  );
}
