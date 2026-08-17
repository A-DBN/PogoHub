'use client';

import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { Card } from '@/components/ui';
import { useT } from '@/i18n/client';

/**
 * Le lien de partage donne accès à une équipe même privée : c'est sa raison
 * d'être, il ne s'affiche donc que pour son auteur.
 */
export function ShareLink({ url }: { url: string }) {
  const { dict } = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers refusé (contexte non sécurisé) : le texte reste sélectionnable
    }
  };

  return (
    <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Link2 size={15} className="shrink-0 text-muted" />
      <code className="min-w-0 flex-1 truncate text-xs text-muted">{url}</code>
      <button
        type="button"
        onClick={copy}
        className="rounded-xl bg-white/[0.06] px-3 py-1.5 text-xs font-semibold transition hover:bg-white/[0.11]"
      >
        {copied ? (
          <span className="inline-flex items-center gap-1 text-success">
            <Check size={13} />
            {dict.teams.copied}
          </span>
        ) : (
          dict.teams.shareLink
        )}
      </button>
    </Card>
  );
}
