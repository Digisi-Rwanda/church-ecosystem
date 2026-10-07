import { useState } from 'react';
import { fetchDeletedWork, restoreWork } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';

/** For Administrators only: work that people deleted, which can be brought back. The server decides who may open it. */
export function DeletedWorkPage() {
  const t = useT();
  const { locale } = useI18n();
  const list = useLoad(fetchDeletedWork, 'work-deleted');
  const [error, setError] = useState('');
  if (list.failed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  return (
    <section className="door-block" aria-labelledby="door-deleted-title">
      <div>
        <h2 id="door-deleted-title">{t('door.work.deleted.title')}</h2>
        <p className="muted">{t('door.work.deleted.intro')}</p>
      </div>
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {!list.data || list.data.length === 0 ? (
          <EmptyState title={t('door.work.deleted.none')} />
        ) : (
          <ul className="door-notices">
            {list.data.map((d) => (
              <li key={d.id} className="panel door-notice">
                <div className="door-notice-main">
                  <strong>{d.title}</strong>
                  <p className="muted">
                    {t('door.work.deleted.by', { who: d.deletedByName, when: when(d.deletedAt) })}
                    {d.unitName ? ` · ${d.unitName}` : ''} · {d.ownerName}
                  </p>
                  <button
                    type="button"
                    className="btn secondary sm"
                    onClick={async () => {
                      setError('');
                      try {
                        await restoreWork(d.id);
                        list.reload();
                      } catch {
                        setError(t('door.people.actionFailed'));
                      }
                    }}
                  >
                    {t('door.work.deleted.restore')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </section>
  );
}
