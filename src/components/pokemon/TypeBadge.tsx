import { TYPE_INFO, isType } from '@/lib/pogo/types';
import type { Locale } from '@/i18n/config';
import { cn } from '@/lib/cn';

export function TypeBadge({
  type,
  locale,
  className,
}: {
  type: string;
  locale: Locale;
  className?: string;
}) {
  if (!isType(type)) return null;
  const info = TYPE_INFO[type];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold text-white',
        className,
      )}
      style={{ background: `linear-gradient(180deg, ${info.color}, ${info.color}cc)` }}
      title={info.en}
    >
      {locale === 'fr' ? info.fr : info.en}
    </span>
  );
}

export function TypeBadges({
  types,
  locale,
  className,
}: {
  types: readonly string[];
  locale: Locale;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {types
        .filter((t) => t && t !== 'none')
        .map((type) => (
          <TypeBadge key={type} type={type} locale={locale} />
        ))}
    </span>
  );
}
