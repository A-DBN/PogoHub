import { spriteUrl } from '@/lib/pogo/icons';
import { cn } from '@/lib/cn';

export function PokemonIcon({
  file,
  alt,
  shiny = false,
  size = 48,
  className,
  dim = false,
}: {
  file: string | null | undefined;
  alt: string;
  shiny?: boolean;
  size?: number;
  className?: string;
  dim?: boolean;
}) {
  const src = spriteUrl(file, shiny);
  if (!src) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full border border-dashed border-line text-[10px] text-muted',
          className,
        )}
        style={{ width: size, height: size }}
        title={alt}
      >
        ?
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- sprites distants, pas d'optimisation nécessaire
    <img
      // `key` sur la source : sans elle React réutilise le même <img> et se
      // contente d'échanger `src`. Combiné au chargement paresseux, l'ancien
      // sprite restait affiché — visible en changeant d'équipe dans la
      // simulation. Une clé neuve force un élément neuf.
      key={src}
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      className={cn('object-contain', dim && 'opacity-35 grayscale', className)}
      style={{ width: size, height: size }}
    />
  );
}
