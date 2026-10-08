import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

/** A short state label. The words always carry the meaning; colour only backs them up. */
export function StatusChip({ tone = 'neutral', children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span className={`status-chip chip-${tone}`}>
      <span className="status-chip-dot" aria-hidden />
      {children}
    </span>
  );
}
