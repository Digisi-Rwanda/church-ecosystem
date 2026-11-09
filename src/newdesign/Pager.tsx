import { useT } from '../i18n/I18nContext';
import { pageWindow } from './peopleTools';

/** Numbered pages: previous, the nearby numbers, next. Hidden when everything fits on one page. */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  const t = useT();
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label={t('door.pager.label')}>
      <button type="button" className="btn ghost sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('door.pager.prev')}</button>
      <ul>
        {pageWindow(page, pages).map((n, i) => (
          <li key={n ?? `gap${i}`}>
            {n === null ? (
              <span aria-hidden="true">…</span>
            ) : (
              <button type="button" className={`btn sm${n === page ? '' : ' ghost'}`} aria-current={n === page ? 'page' : undefined} aria-label={t('door.pager.page', { n })} onClick={() => onPage(n)}>{n}</button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="btn ghost sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('door.pager.next')}</button>
    </nav>
  );
}
