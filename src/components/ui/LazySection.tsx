'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Ne monte son contenu qu'à l'approche de l'écran.
 *
 * `content-visibility` évite la mise en page hors écran, mais les nœuds et
 * leurs gestionnaires d'événements existent quand même : sur le Shiny Dex,
 * c'est un millier de tuiles interactives hydratées au chargement. Ici on ne
 * crée rien tant que la section reste loin, en réservant sa hauteur pour que
 * la barre de défilement ne saute pas.
 *
 * Une fois montée, la section le reste : re-démonter en remontant ferait
 * perdre l'état et clignoter l'affichage.
 */
export function LazySection({
  children,
  /** Hauteur réservée avant montage, en pixels. */
  placeholderHeight = 420,
  /** Marge d'anticipation : on monte avant que ce soit visible. */
  rootMargin = '600px',
  /**
   * Monté d'emblée, y compris côté serveur. À réserver au haut de page : sans
   * cela le premier écran reste vide jusqu'à l'hydratation.
   */
  eager = false,
  className,
}: {
  children: ReactNode;
  placeholderHeight?: number;
  rootMargin?: string;
  eager?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(eager);

  useEffect(() => {
    if (shown) return;
    const node = ref.current;
    if (!node) return;

    // sans IntersectionObserver, on affiche tout plutôt que rien
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShown(true);
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, rootMargin]);

  return (
    <div ref={ref} className={className} style={shown ? undefined : { height: placeholderHeight }}>
      {shown ? children : null}
    </div>
  );
}
