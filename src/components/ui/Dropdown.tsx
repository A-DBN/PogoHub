'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export type DropdownOption = {
  value: string;
  label: string;
  /** Pastille affichée avant le libellé (badge de type, sprite…). */
  leading?: ReactNode;
};

/**
 * Liste déroulante maison.
 *
 * Un `<select>` natif fait rendre ses options par le système : fond blanc,
 * surlignage bleu, police hors charte, et rien n'est stylable. On refait donc
 * le menu en HTML pour qu'il suive les mêmes couches de fond que le reste.
 */
export function Dropdown({
  value,
  options,
  onChange,
  placeholder,
  className,
  size = 'md',
  accent,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
  /** Couleur littérale du contour, quand la valeur choisie en porte une. */
  accent?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  /** Position mesurée du bouton : le menu est rendu en portail, pas dans le flux. */
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);

  /**
   * Le menu part dans `document.body`.
   *
   * Rendu en absolu à l'intérieur, il se faisait rogner par la première carte
   * `overflow-hidden` du chemin — le menu passait littéralement derrière le
   * fond. Aucun `z-index` n'y peut rien : un débordement masqué l'emporte.
   */
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect) setBox({ left: rect.left, top: rect.bottom + 6, width: rect.width });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value);
  const small = size === 'sm';

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        // contour teinté quand la valeur en porte une : un halo léger, pas un
        // trait 1px, pour rester dans la charte
        style={
          accent
            ? { boxShadow: `inset 0 0 0 1.5px ${accent}, 0 0 14px -4px ${accent}` }
            : undefined
        }
        className={cn(
          'flex w-full items-center gap-1.5 rounded-xl bg-white/[0.05] text-left outline-none transition',
          'hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-brand/40',
          small ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-sm',
        )}
      >
        {selected?.leading}
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted')}>
          {selected?.label ?? placeholder ?? ''}
        </span>
        <ChevronDown
          size={small ? 12 : 15}
          className={cn('shrink-0 text-muted transition', open && 'rotate-180')}
        />
      </button>

      {open && box
        ? createPortal(
            <div
              role="listbox"
              // `fixed` + position mesurée : le menu ne dépend plus d'aucun parent
              style={{ left: box.left, top: box.top, width: box.width }}
              className="pop fixed z-[120] max-h-64 overflow-y-auto rounded-xl bg-[#171b25]/97 p-1 shadow-[0_30px_70px_-24px_rgba(0,0,0,1)] backdrop-blur"
              onMouseDown={(event) => event.stopPropagation()}
            >
          {options.map((option) => (
            <button
              key={option.value || '__empty__'}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition',
                small ? 'text-[11px]' : 'text-sm',
                option.value === value
                  ? 'bg-white/[0.10] font-semibold'
                  : 'hover:bg-white/[0.06]',
              )}
            >
              {option.leading}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </button>
          ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
