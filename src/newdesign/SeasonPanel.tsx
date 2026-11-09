import { useState } from 'react';
import { fetchSeason, prepareSeason, type PlanDetail, type SeasonView } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { StatusChip } from './kit';
import { LoadState } from './LoadState';
import { planErrorKey } from './plans';
import { useLoad } from './useLoad';

/** The seasonal cycle: Preparing until the team prepares for the cycle, Active after it; a new calendar year waits for the annual review. */
export function SeasonPanel({ p, onChange }: { p: PlanDetail; onChange: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const load = useLoad(() => fetchSeason(p.id), `season|${p.id}`);
  const [view, setView] = useState<SeasonView | null>(null);
  const [error, setError] = useState('');
  const v = view ?? load.data;
  if (!v) return <LoadState loading={load.loading} failed={load.failed} retry={load.reload}><span /></LoadState>;
  const month = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, v.month - 1, 1)));
  const prepare = async () => {
    setError('');
    try {
      setView(await prepareSeason(p.id));
      onChange();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <div className="panel" aria-label={t('door.se.title')}>
      <h3>{t('door.se.title')}</h3>
      <p>
        <StatusChip tone={v.phase === 'ACTIVE' ? 'success' : 'warn'}>{t(v.phase === 'ACTIVE' ? 'door.se.active' : v.closedYearWaiting ? 'door.se.preparingNext' : 'door.se.preparing')}</StatusChip>{' '}
        {t('door.se.next', { month, year: v.nextYear })}
      </p>
      {v.closedYearWaiting && <p className="muted">{t('door.se.reviewFirst')}</p>}
      {v.canPrepare && !v.closedYearWaiting && (
        <>
          <p className="muted">{t('door.se.prepareHint', { year: v.year })}</p>
          <button type="button" className="btn" onClick={() => void prepare()}>{t('door.se.prepare', { year: v.year })}</button>
        </>
      )}
      {error && <p className="door-error" role="alert">{error}</p>}
    </div>
  );
}
