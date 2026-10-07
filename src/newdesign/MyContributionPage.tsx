import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchMyContribution } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { formatRwf } from './money';
import { YearSelect } from './MoneyBlockParts';
import { listStatusKey } from './moneyBlock';
import { useLoad } from './useLoad';

/** A member's own view of what they have given. Members have no claims here; only what they gave. */
export function MyContributionPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const { loading, failed, data, reload } = useLoad(() => fetchMyContribution(systemId, year), `mine|${systemId}|${year}`);
  return (
    <section className="door-block" aria-labelledby="door-mine-title">
      <div>
        <h2 id="door-mine-title">{t('door.money.mine')}</h2>
        <p className="muted">{t('door.money.mine.intro')}</p>
      </div>
      <YearSelect year={year} onChange={setYear} />
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && (
          <>
            {data.teams.length > 0 && (
              <p>
                <Link className="btn secondary" to={`/s/${systemId}/money/contributions`}>
                  {t('door.money.mine.teamLists')}
                </Link>
              </p>
            )}
            <p>
              <strong>{t('door.money.mine.total')}</strong> {formatRwf(data.grandTotal)}
            </p>
            {data.types.length === 0 && <p className="muted">{t('door.money.mine.noTypes')}</p>}
            <ul className="door-notices">
              {data.types.map((x) => (
                <li key={x.code} className="panel door-notice">
                  <div className="door-notice-main">
                    <div className="door-row">
                      <strong>{x.name}</strong>
                      <span>{formatRwf(x.total)}</span>
                      {x.reached !== null && <span className={`door-chip${x.reached ? '' : ' warn'}`}>{x.reached ? t('door.money.mine.reached') : t('door.money.mine.notYet')}</span>}
                    </div>
                    {x.goal !== null && x.goalPer === 'MEMBER' && (
                      <>
                        <p className="muted">{t('door.money.mine.goal', { goal: formatRwf(x.goal) })}</p>
                        <meter min={0} max={x.goal} value={Math.min(x.total, x.goal)} aria-label={t('door.money.mine.goal', { goal: formatRwf(x.goal) })} />
                      </>
                    )}
                    {x.goal !== null && x.goalPer === 'TEAM' && <p className="muted">{t('door.money.mine.teamGoal')}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <h3>{t('door.money.mine.history')}</h3>
            {data.history.length === 0 ? (
              <EmptyState title={t('door.money.mine.none')} />
            ) : (
              <ul className="door-notices">
                {data.history.map((h) => (
                  <li key={h.id} className="panel door-notice">
                    <div className="door-row">
                      <strong>{h.typeName}</strong>
                      <span>{h.month}</span>
                      <span>{formatRwf(h.amount)}</span>
                      <span className="door-chip">{t(listStatusKey(h.status))}</span>
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
