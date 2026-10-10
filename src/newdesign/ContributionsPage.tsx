import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { combineContributionLists, fetchContributionLists, startContributionList } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { ContributionList } from './ContributionList';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { currentMonth, moneyErrorKey } from './money';
import { listsInOrder } from './moneyBlock';
import { useLoad } from './useLoad';
import { DonationsPage } from './DonationsPage';
import { PageHeader, Tabs } from './kit';

/**
 * Contribution lists: a team leader records the team's list and submits it to the treasurer; the treasurer
 * combines the team lists (with a Team column) and submits the unit list to the president. A unit with no
 * teams: the treasurer records and submits.
 */
export function ContributionsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const donations = params.get('view') === 'donations';
  const [month, setMonth] = useState(currentMonth());
  const { loading, failed, data, reload } = useLoad(() => fetchContributionLists(systemId, month), `clists|${systemId}|${month}`);
  const [typeCode, setTypeCode] = useState('');
  const [teamId, setTeamId] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const code = typeCode || data?.types[0]?.code || '';
  const run = async (job: () => Promise<string | void>) => {
    setError('');
    setNote('');
    try {
      const msg = await job();
      if (msg) setNote(msg);
      reload();
    } catch (e) {
      setError(t(moneyErrorKey(errorCode(e)) as 'door.people.actionFailed'));
    }
  };
  const team = teamId || (data?.teams.length === 1 ? data.teams[0].id : '');
  return (
    <section className="door-block" aria-labelledby="door-clists-title">
      <div>
        <PageHeader id="door-clists-title" title={t('door.money.contributions')} />
        <p className="muted">{t('door.money.contributions.intro')}</p>
      </div>
      <Tabs
        label={t('door.money.contributions')}
        value={donations ? 'donations' : 'contribution'}
        onChange={(k) => setParams(k === 'donations' ? { view: 'donations' } : {}, { replace: true })}
        items={[
          { key: 'contribution', label: t('door.money.contribution') },
          { key: 'donations', label: t('door.money.donations') },
        ]}
      />
      {donations && <DonationsPage />}
      {!donations && <TextField label={t('door.money.month')} name="cl-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}
      {!donations && (
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && data.types.length === 0 && <EmptyState title={t('door.money.contributions.noTypes')} detail={t('door.money.contributions.noTypesDetail')} />}
        {data && data.types.length > 0 && (
          <div className="panel door-form" style={{ maxWidth: 'none' }}>
            <SelectField label={t('door.money.contributions.type')} name="cl-type" value={code} onChange={(e) => setTypeCode(e.target.value)}>
              {data.types.map((x) => (
                <option key={x.code} value={x.code}>
                  {x.name}
                </option>
              ))}
            </SelectField>
            {data.teams.length > 0 && (
              <div className="door-row">
                {data.teams.length > 1 && (
                  <SelectField label={t('door.money.lines.team')} name="cl-team" value={team} onChange={(e) => setTeamId(e.target.value)}>
                    <option value="">{t('door.gov.meeting.choose')}</option>
                    {data.teams.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </SelectField>
                )}
                <button type="button" className="btn" disabled={!team} onClick={() => void run(async () => void (await startContributionList({ systemId, level: 'TEAM', typeCode: code, month, teamUnitId: team })))}>
                  {t('door.money.contributions.startTeam')}
                </button>
              </div>
            )}
            {data.canWrite && (
              <div className="door-row">
                <button type="button" className="btn secondary" onClick={() => void run(async () => void (await startContributionList({ systemId, level: 'UNIT', typeCode: code, month })))}>
                  {t('door.money.contributions.startUnit')}
                </button>
                <button type="button" className="btn secondary" onClick={() => void run(async () => t('door.money.contributions.combined', { n: String(await combineContributionLists(systemId, code, month)) }))}>
                  {t('door.money.contributions.combine')}
                </button>
              </div>
            )}
            {note && (
              <p className="door-ok" role="status">
                {note}
              </p>
            )}
            {error && (
              <p className="door-error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
        {data && data.lists.length === 0 && data.types.length > 0 && <EmptyState title={t('door.money.contributions.none')} />}
        <ul className="door-notices">
          {listsInOrder(data?.lists ?? []).map((l) => (
            <ContributionList key={`${l.id}-${l.status}-${l.total}`} list={l} onChange={reload} />
          ))}
        </ul>
      </LoadState>
      )}
    </section>
  );
}
