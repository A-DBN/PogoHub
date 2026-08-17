import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Carte : dégradé + ombre douce, pas de simple rectangle bordé. */
export function Card({
  className,
  hover = false,
  accent,
  ...props
}: ComponentProps<'div'> & { hover?: boolean; accent?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/[0.06]',
        'bg-gradient-to-b from-white/[0.045] to-white/[0.015]',
        'shadow-[0_18px_40px_-28px_rgba(0,0,0,0.95)]',
        hover &&
          'transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.12] hover:shadow-[0_26px_50px_-28px_rgba(0,0,0,1)]',
        className,
      )}
      {...props}
    >
      {accent ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-[0.16]"
          style={{ background: `radial-gradient(60% 100% at 50% 0%, ${accent}, transparent)` }}
        />
      ) : null}
      {props.children}
    </div>
  );
}

export function Section({
  title,
  hint,
  children,
  actions,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="mb-9">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">
          {title}
        </h2>
        <span className="rule flex-1" />
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
        {actions}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-[26px] font-bold text-transparent">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

const VARIANTS = {
  primary:
    'text-white border-transparent bg-gradient-to-b from-brand to-[#5474f0] shadow-[0_8px_18px_-10px_rgba(108,140,255,0.9)] hover:brightness-110',
  soft: 'text-ink border-white/[0.07] bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/[0.14]',
  ghost: 'text-muted border-transparent hover:bg-white/[0.05] hover:text-ink',
  danger:
    'text-danger border-transparent bg-danger/10 hover:bg-danger/18',
} as const;

export function Button({
  className,
  variant = 'soft',
  size = 'md',
  ...props
}: ComponentProps<'button'> & {
  variant?: keyof typeof VARIANTS;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border font-medium transition duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2 text-sm',
        'placeholder:text-muted/70 outline-none transition',
        'focus:border-brand/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-brand/25',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-sm outline-none',
        'focus:border-brand/60 focus:ring-2 focus:ring-brand/25',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn(
        'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  color,
  ...props
}: ComponentProps<'span'> & { color?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-semibold',
        color ? 'text-white' : 'bg-white/[0.06] text-muted',
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
      {...props}
    />
  );
}

/** En-tête de colonne discret (utilisé dans les mini-tableaux des cartes). */
export function ColumnLabel({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80',
        className,
      )}
      {...props}
    />
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.02] p-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
