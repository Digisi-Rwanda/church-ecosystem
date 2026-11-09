import { Link } from 'react-router-dom';
import { fetchFunds } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { SegBar } from './DashViz';
import { potTitle } from './fundLabels';
import { formatRwf } from './money';
import { useLoad } from './useLoad';

/**
 * Where the money is held: what is free to use and what is set aside for activities, pot by pot. Shown only to those
 * who may read the system's money (the server answers 404 to everyone else, and then nothing is drawn).
 */
export function DashFunds({ systemId }: { systemId: string }) {
  const t = useT();
  const { data } = useLoad(() => fetchFunds(systemId), `dash-funds|${systemId}`);
  if (!data) return null;
  const { totals, groups, uncovered } = data;
  const free = Math.max(0, totals.available);
  return (
    <section className="panel dash-panel" aria-label={t('door.dash.funds.title')}>
      <header className="dash-panel-head">
        <h3>{t('door.dash.funds.title')}</h3>
        <Link className="dash-viewall" to={`/s/${systemId}/money/funds`}>{t('door.dash.viewAll')}</Link>
      </header>
      <p className="dx-big">{formatRwf(totals.secured)} <span className="muted">{t('door.dash.funds.secured')}</span></p>
      <SegBar
        label={t('door.dash.funds.title')}
        total={Math.max(totals.secured, free + totals.earmarked, 1)}
        parts={[{ slot: 1, value: free, name: t('door.dash.funds.free') }, { slot: 2, value: totals.earmarked, name: t('door.dash.funds.earmarked') }]}
      />
      <ul className="dx-legend">
        <li><span className="dx-swatch dx-s1" aria-hidden="true" />{t('door.dash.funds.free')}: {formatRwf(totals.available)}</li>
        <li><span className="dx-swatch dx-s2" aria-hidden="true" />{t('door.dash.funds.earmarked')}: {formatRwf(totals.earmarked)}</li>
        {totals.pledged > 0 && <li>{t('door.dash.funds.pledged')}: {formatRwf(totals.pledged)}</li>}
      </ul>
      {uncovered > 0 && <p className="door-error" role="status">{t('door.funds.uncovered', { amount: formatRwf(uncovered) })}</p>}
      <ul className="dash-list">
        {groups.map((p) => (
          <li key={p.kind} className="dash-row">
            <span className="dash-row-main"><strong>{potTitle(t, p.kind)}</strong><span className="muted">{t('door.dash.funds.potLine', { free: formatRwf(p.available), set: formatRwf(p.earmarked) })}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
