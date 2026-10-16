import { useState } from 'react';
import { fetchProtocolReports } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { shiftMonth, thisMonth } from './music';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

const PARTS = ['challenges', 'solutions', 'issues', 'recommendations'] as const;

/** What each team leader wrote after a service. Deacon reads these as "Protocol reports received"; nothing here can be changed. */
export function ProtocolReportsPage() {
  const t = useT();
  const { locale } = useI18n();
  const [month, setMonth] = useState(thisMonth());
  const data = useLoad(() => fetchProtocolReports(month), `protocol-reports|${month}`);
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  const dayName = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  return (
    <section className="door-block" aria-labelledby="door-preports-title">
      <div>
        <PageHeader id="door-preports-title" title={t('door.own.deaconreports')} />
        <p className="muted">{t('door.protocol.reports.deaconIntro')}</p>
      </div>
      <div className="door-row">
        <button type="button" className="btn ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('door.music.plan.prev')}>‹</button>
        <strong>{monthName}</strong>
        <button type="button" className="btn ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t('door.music.plan.next')}>›</button>
      </div>
      <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
        {data.data && (data.data.reports.length === 0 ? <EmptyState title={t('door.protocol.reports.none')} /> : (
          <ul className="door-list">
            {data.data.reports.map((r) => (
              <li key={r.serviceId} className="panel door-notice">
                <div className="door-notice-main">
                  <div className="door-row"><strong>{r.date ? dayName(r.date) : r.label}</strong><span className="door-chip">{t(`door.music.kind.${r.kind}` as 'door.music.kind.SS1')}</span></div>
                  <p className="muted">{t('door.protocol.reports.by', { name: r.author })}</p>
                  {PARTS.filter((p) => r[p]).map((p) => (
                    <p key={p}><strong>{t(`door.protocol.report.${p}` as 'door.protocol.report.challenges')}:</strong> {r[p]}</p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ))}
      </LoadState>
    </section>
  );
}
