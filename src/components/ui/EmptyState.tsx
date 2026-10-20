import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type EmptyVariant = 'first-use' | 'no-results' | 'error';

const DEFAULTS: Record<
  EmptyVariant,
  { title: string; detail: string; icon: IconName }
> = {
  'first-use': {
    title: 'Nothing here yet',
    detail: 'Create the first item to get started.',
    icon: 'plus',
  },
  'no-results': {
    title: 'No matches',
    detail: 'Try clearing filters or searching with different terms.',
    icon: 'search',
  },
  error: {
    title: 'Couldn’t load this',
    detail: 'Check your connection, then try again.',
    icon: 'alert',
  },
};

/**
 * Empty triad: first-use / no-results / error — distinct copy + optional CTA.
 */
export function EmptyState({
  variant = 'first-use',
  title,
  detail,
  action,
}: {
  variant?: EmptyVariant;
  title?: string;
  detail?: string;
  action?: ReactNode;
}) {
  const defaults = DEFAULTS[variant];
  return (
    <div className={`empty-state empty-${variant}`} data-variant={variant} role={variant === 'error' ? 'alert' : undefined}>
      <span className="empty-icon">
        <Icon name={defaults.icon} size={28} />
      </span>
      <strong>{title ?? defaults.title}</strong>
      <p className="muted">{detail ?? defaults.detail}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ForbiddenState({
  resource,
  action = 'VIEW',
  detail,
  recovery,
}: {
  resource: string;
  action?: string;
  /** Human headline reason — never raw authorize() text. */
  detail?: string;
  recovery?: ReactNode;
}) {
  return (
    <div className="forbidden-state">
      <span className="empty-icon">
        <Icon name="lock" size={28} />
      </span>
      <strong>You don’t have access</strong>
      <p className="muted">
        {detail ??
          'Ask a church leader or system steward to grant permission for this area.'}
      </p>
      <details className="forbidden-details">
        <summary>Technical details</summary>
        <p className="muted">
          Required: <code>{resource} / {action}</code>
        </p>
      </details>
      {recovery && <div className="empty-action">{recovery}</div>}
    </div>
  );
}
