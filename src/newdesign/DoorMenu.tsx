import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The menu bar of the new design: pills that scroll sideways on a phone and keep the current
 * page in view, so a long menu never hides where you are.
 */
export function DoorMenu({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    const active = el?.querySelector<HTMLElement>('.door-menu-link.active');
    if (!el || !active) return;
    const left = active.offsetLeft - (el.clientWidth - active.clientWidth) / 2;
    if (typeof el.scrollTo === 'function') el.scrollTo({ left: Math.max(0, left) });
  });
  return (
    <nav ref={ref} className={`door-menu ${className}`.trim()} aria-label={label}>
      {children}
    </nav>
  );
}
