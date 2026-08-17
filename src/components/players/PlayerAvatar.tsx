import { cn } from '@/lib/cn';

/** Teinte dérivée du pseudo : deux joueurs voisins n'ont pas la même pastille. */
function hueOf(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) % 360;
  return hash;
}

/**
 * Photo de profil, avec repli sur les initiales : l'envoi d'image n'est pas
 * encore branché, `avatarUrl` accepte donc une URL externe en attendant.
 */
export function PlayerAvatar({
  username,
  avatarUrl,
  size = 48,
  className,
}: {
  username: string;
  avatarUrl: string | null;
  size?: number;
  className?: string;
}) {
  const initials = username.slice(0, 2).toUpperCase();
  const hue = hueOf(username);

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar distant arbitraire
      <img
        src={avatarUrl}
        alt={username}
        width={size}
        height={size}
        className={cn('shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-bold text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(160deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 42%))`,
      }}
    >
      {initials}
    </span>
  );
}
