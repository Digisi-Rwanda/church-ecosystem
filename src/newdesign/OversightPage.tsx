import { useState } from 'react';
import { fetchMusicOversight } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { shiftMonth, thisMonth } from './music';
import { useLoad } from './useLoad';

/** Music oversight: for the month, how each choir is doing, and what needs attention. */
export function OversightPage() {
  const t = useT();
  const { locale } = useI18n();
  const [month, setMonth] = useState(thisMonth());
  const data = useLoad(() => fetchMusicOversight(month), `music-oversight|${month}`);
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const o = data.data;
  return (
    <section className="door-block" aria-labelledby="door-over-title">
      <div>
        <h2 id="door-over-title">{t('door.own.oversight')}</h2>
        <p className="muted">{t('door.music.over.intro')}</p>
      </div>
      <div className="door-row">
        <button type="button" className="btn ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('door.music.plan.prev')}>‹</button>
        <strong>{monthName}</strong>
        <button type="button" className="btn ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t('door.music.plan.next')}>›</button>
      </div>
      <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
        {o && (
          <>
            <p className="muted">{o.planStatus ? t(`door.music.plan.status.${o.planStatus}` as 'door.music.plan.status.DRAFT') : t('door.music.over.noPlan')}</p>
            {o.emptyServices.length > 0 && (
              <div className="panel">
                <h3>{t('door.music.over.emptyServices')}</h3>
                <ul className="door-list">
                  {o.emptyServices.map((s) => <li key={s.id}>{day(s.serviceOn)} · {t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1')}</li>)}
                </ul>
              </div>
            )}
            {o.choirs.length === 0 ? (
              <EmptyState title={t('door.music.choirs.none')} />
            ) : (
              <ul className="door-notices">
                {o.choirs.map((c) => (
                  <li key={c.id} className="panel door-notice">
                    <div className="door-notice-main">
                      <div className="door-row">
                        <strong>{c.name}</strong>
                        {c.noMembers && <span className="door-chip warn">{t('door.music.over.noMembers')}</span>}
                        {c.notScheduled && <span className="door-chip warn">{t('door.music.over.notScheduled')}</span>}
                      </div>
                      <p className="muted">{t(`door.music.role.${c.role}` as 'door.music.role.PRIMARY')} · {t('door.music.members', { count: String(c.members) })} · {t('door.music.over.services', { count: String(c.services) })}</p>
                      {c.days.length > 0 && <p className="muted">{c.days.map(day).join(', ')}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </LoadState>
    </section>
  );
}
