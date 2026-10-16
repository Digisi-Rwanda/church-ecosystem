import type { AnchorHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

/** The system a path like "/s/sys-music/reports" belongs to, or null for any other path. */
const systemOf = (to: string): string | null => /^\/s\/([^/?#]+)/.exec(to)?.[1] ?? null;

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string; from?: string };

/**
 * A link into a system. Going to a different system than the one on screen (or from the Portal,
 * where `from` is left out) opens a new browser tab, so each system keeps its own page; a place
 * inside the same system stays in the page.
 */
export function SystemLink({ to, from, children, ...rest }: Props) {
  const target = systemOf(to);
  if (target && target !== from) {
    return (
      <a {...rest} href={to} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link {...rest} to={to}>
      {children}
    </Link>
  );
}
