import Link from 'next/link';
import { Compass } from 'lucide-react';

/**
 * 404 du segment localisé. Sert surtout aux liens de partage d'équipe devenus
 * morts (équipe supprimée ou repassée en privé) : le visiteur doit comprendre
 * ce qui s'est passé plutôt que tomber sur la page blanche de Next.
 *
 * `not-found.tsx` n'a pas accès aux paramètres de route : on ne connaît donc
 * pas la langue ici, d'où les deux textes affichés.
 */
export default function NotFound() {
  return (
    <div className="grid min-h-[50vh] place-items-center px-4 text-center">
      <div>
        <Compass size={38} className="mx-auto text-muted" />
        <h1 className="mt-4 text-2xl font-extrabold">Page introuvable</h1>
        <p className="mt-2 text-sm text-muted">
          Ce lien ne mène nulle part — l’équipe a peut-être été supprimée ou rendue privée.
        </p>
        <p className="mt-1 text-xs text-muted">
          This link leads nowhere — the team may have been deleted or made private.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-white/[0.06] px-5 py-2 text-sm font-semibold transition hover:bg-white/[0.11]"
        >
          Accueil / Home
        </Link>
      </div>
    </div>
  );
}
