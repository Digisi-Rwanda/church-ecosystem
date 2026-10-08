import { Skeleton } from '../../components/ui/Skeleton';
import { useT } from '../../i18n/I18nContext';

/** A row-shaped placeholder. */
function RowShape() {
  return (
    <li className="list-row skeleton-row" aria-hidden>
      <div className="list-row-main">
        <Skeleton height="2rem" width="2rem" radius={999} />
        <span className="list-row-text">
          <Skeleton height="0.9rem" width="55%" />
          <Skeleton height="0.7rem" width="35%" />
        </span>
      </div>
    </li>
  );
}

/** The page's own shape while its data loads: header (unless the page already shows its own), then rows. Never a lone spinner. */
export function PageSkeleton({ rows = 6, header = true }: { rows?: number; header?: boolean }) {
  const t = useT();
  return (
    <div className="door-block page-skeleton" role="status" aria-busy="true" aria-label={t('kit.loading')}>
      {header && (
        <header className="page-head" aria-hidden>
          <div className="page-head-row">
            <div className="page-head-text">
              <Skeleton height="1.6rem" width="12rem" />
              <Skeleton height="0.8rem" width="20rem" />
            </div>
          </div>
        </header>
      )}
      <ul className="row-list" aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <RowShape key={i} />
        ))}
      </ul>
    </div>
  );
}

/** Cards in a grid: the dashboard and system pages. */
export function CardsSkeleton({ cards = 6 }: { cards?: number }) {
  const t = useT();
  return (
    <div className="door-block page-skeleton" role="status" aria-busy="true" aria-label={t('kit.loading')}>
      <Skeleton height="1.6rem" width="14rem" />
      <div className="skeleton-cards" aria-hidden>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="panel skeleton-card">
            <Skeleton height="0.8rem" width="40%" />
            <Skeleton height="1.8rem" width="55%" />
            <Skeleton height="0.7rem" width="70%" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The whole frame while the person's sign-in is checked: top bar, side menu, and the page shape. */
export function ShellSkeleton() {
  const t = useT();
  return (
    <div className="shell-skeleton" role="status" aria-busy="true" aria-label={t('kit.loading')}>
      <div className="shell-skeleton-bar" aria-hidden>
        <Skeleton height="1.4rem" width="9rem" />
      </div>
      <div className="shell-skeleton-body" aria-hidden>
        <div className="shell-skeleton-side">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height="1.1rem" width={i % 2 ? '70%' : '85%'} />
          ))}
        </div>
        <div className="shell-skeleton-main">
          <CardsSkeleton cards={4} />
        </div>
      </div>
    </div>
  );
}
