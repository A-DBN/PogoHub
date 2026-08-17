'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui';
import { useT } from '@/i18n/client';
import type { Locale } from '@/i18n/config';

/**
 * Recherche par pseudo. Elle pousse la valeur dans l'URL (`?q=`) plutôt que de
 * filtrer côté client : l'annuaire est rendu par le serveur et le résultat
 * reste partageable.
 */
export function PlayerSearch({ locale, initial }: { locale: Locale; initial: string }) {
  const { dict } = useT();
  const router = useRouter();
  const [value, setValue] = useState(initial);

  const submit = () => {
    const trimmed = value.trim();
    router.push(`/${locale}/players${trimmed ? `?q=${encodeURIComponent(trimmed)}` : ''}`);
  };

  return (
    <div className="relative max-w-sm">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
        placeholder={dict.players.search}
        aria-label={dict.players.search}
        className="pl-9"
      />
    </div>
  );
}
