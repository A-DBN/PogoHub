import { cn } from '@/lib/cn';

/**
 * Marque Stardust : un éclat de poussière d'étoile.
 *
 * Dessinée en SVG inline, comme la Poké Ball des pages d'authentification :
 * aucune ressource externe à charger, net à toutes les tailles, et les couleurs
 * suivent la charte. Le même tracé sert de favicon (`src/app/icon.svg`).
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        {/* identifiant unique par instance : deux logos sur une page
            partageraient sinon le même dégradé */}
        <linearGradient id="stardust-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fa6ff" />
          <stop offset="1" stopColor="#a06cff" />
        </linearGradient>
      </defs>
      <path
        fill="url(#stardust-mark)"
        d="M16 2c.95 7.7 5.3 12.05 13 13-7.7.95-12.05 5.3-13 13-.95-7.7-5.3-12.05-13-13C10.7 14.05 15.05 9.7 16 2Z"
      />
      <path
        fill="#e8b34a"
        d="M26.5 2c.28 2 1.2 2.92 3.2 3.2-2 .28-2.92 1.2-3.2 3.2-.28-2-1.2-2.92-3.2-3.2 2-.28 2.92-1.2 3.2-3.2Z"
      />
      <path
        fill="#6c8cff"
        d="M5.5 22.5c.22 1.55 1 2.33 2.55 2.55-1.55.22-2.33 1-2.55 2.55-.22-1.55-1-2.33-2.55-2.55 1.55-.22 2.33-1 2.55-2.55Z"
      />
    </svg>
  );
}

/** Marque + nom, pour l'en-tête de la barre latérale et les pages d'accueil. */
export function Logo({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} />
      <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text font-extrabold tracking-tight text-transparent">
        {name}
      </span>
    </span>
  );
}
