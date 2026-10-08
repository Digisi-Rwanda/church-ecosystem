import type { ReactNode } from 'react';

/**
 * The one header every page starts with: a title, a single line saying what the page is for,
 * and at most one primary action (plus quieter ones). Pages never style their own title.
 */
export function PageHeader({
  title,
  id,
  purpose,
  primary,
  actions,
  back,
  meta,
}: {
  title: ReactNode;
  /** The title's id, so the page section can point at it with aria-labelledby. */
  id?: string;
  /** One line: what this page is for. */
  purpose?: ReactNode;
  /** The page's single filled button. */
  primary?: ReactNode;
  /** Outlined or quiet buttons beside it. */
  actions?: ReactNode;
  /** A link back to the list this page came from. */
  back?: ReactNode;
  /** Chips or facts shown under the title (status, dates). */
  meta?: ReactNode;
}) {
  return (
    <header className="page-head">
      {back ? <div className="page-back">{back}</div> : null}
      <div className="page-head-row">
        <div className="page-head-text">
          <h2 id={id}>{title}</h2>
          {purpose ? <p className="page-purpose">{purpose}</p> : null}
          {meta ? <div className="page-meta">{meta}</div> : null}
        </div>
        {primary || actions ? (
          <div className="page-actions">
            {actions}
            {primary}
          </div>
        ) : null}
      </div>
    </header>
  );
}
