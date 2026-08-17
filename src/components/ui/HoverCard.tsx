'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

type Position = { top: number; left: number };

/** Temps laissé pour aller du déclencheur à la bulle. */
const CLOSE_DELAY_MS = 220;

/**
 * Bulle affichée au survol, rendue dans un portail : elle passe donc au-dessus
 * des lignes suivantes d'un tableau et n'est jamais coupée par un overflow.
 */
export function HoverCard({
  children,
  content,
  className,
  cardClassName,
  align = 'start',
  as: Tag = 'span',
  openOnClick = false,
}: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  cardClassName?: string;
  align?: 'start' | 'center' | 'end';
  as?: 'span' | 'div';
  openOnClick?: boolean;
}) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = cardRef.current?.offsetWidth ?? 280;
    const height = cardRef.current?.offsetHeight ?? 160;

    let left =
      align === 'center'
        ? rect.left + rect.width / 2 - width / 2
        : align === 'end'
          ? rect.right - width
          : rect.left;
    left = Math.max(10, Math.min(left, window.innerWidth - width - 10));

    const below = rect.bottom + 8;
    const top = below + height > window.innerHeight - 10 ? rect.top - height - 8 : below;

    setPosition({ top: Math.max(10, top), left });
  }, [align]);

  /**
   * Fermeture différée : entre le déclencheur et la bulle il y a un espace, et
   * le survol se perd en le traversant. Sans ce délai la bulle disparaît avant
   * qu'on l'ait atteinte — on ne peut donc pas cliquer ce qu'elle contient.
   */
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const open = () => {
    cancelClose();
    place();
    requestAnimationFrame(place); // seconde passe une fois la taille réelle connue
  };

  const close = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPosition(null), CLOSE_DELAY_MS);
  };

  const closeNow = () => {
    cancelClose();
    setPosition(null);
  };

  useEffect(() => cancelClose, []);

  useEffect(() => {
    if (!position) return;
    const handler = () => closeNow();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [position]);

  return (
    <>
      <Tag
        ref={triggerRef as never}
        className={cn('inline-flex', className)}
        onMouseEnter={openOnClick ? undefined : open}
        onMouseLeave={openOnClick ? undefined : close}
        onFocus={openOnClick ? undefined : open}
        onBlur={close}
        onClick={openOnClick ? () => (position ? close() : open()) : undefined}
      >
        {children}
      </Tag>

      {mounted && position
        ? createPortal(
            <div
              ref={cardRef}
              className={cn(
                'pop fixed z-[100] w-72 rounded-2xl border border-white/10 p-3 text-xs',
                'bg-[#171b25]/95 shadow-[0_24px_60px_-20px_rgba(0,0,0,1)] backdrop-blur',
                cardClassName,
              )}
              style={{ top: position.top, left: position.left }}
              onMouseEnter={openOnClick ? undefined : open}
              onMouseLeave={openOnClick ? undefined : close}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
