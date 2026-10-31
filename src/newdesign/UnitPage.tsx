import { Link, useParams } from 'react-router-dom';
import { fetchPeople, fetchPlans, fetchStructure } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { useT } from '../i18n/I18nContext';
import { ActivityByStatus } from './ActivityByStatus';
import { useFrontDoor } from './FrontDoorContext';
import { LoadState } from './LoadState';
import { membersOf, officeHoldersOf, unitPath } from './structure';
import { useLoad } from './useLoad';
import { PageHeader, initialsOf } from './kit';

const today = () => new Date().toISOString().slice(0, 10);

/** One unit: its place in the organisation, a summary of its activities, its office holders, the units inside and its members. */
export function UnitPage() {
  const t = useT();
  const { systemId = '', unitId = '' } = useParams();
  const { portal } = useFrontDoor();
  const base = `/s/${systemId}/people`;
  const { loading, failed, data, reload } = useLoad(async () => {
    const structure = await fetchStructure(systemId);
    const day = today();
    const memberIds = membersOf(unitId, structure.memberships, day);
    const holders = officeHoldersOf(unitId, structure.offices, day);
    const ids = [...new Set([...memberIds, ...holders.map((h) => h.personId)])];
    const people = ids.length ? await fetchPeople({ ids, systemId }) : [];
    return { structure, memberIds, holders, names: new Map(people.map((p) => [p.id, p.fullName])) };
  }, `unit|${systemId}|${unitId}`);

  const unit = data?.structure.units.find((u) => u.id === unitId);
  // The unit's own system holds its work; when this person cannot open it, the work is read from the system they are in.
  const workSystem = unit?.systemId && portal.some((s) => s.id === unit.systemId) ? unit.systemId : systemId;
  const plans = useLoad(
    async () => (unit ? (await fetchPlans({ systemId: workSystem, view: 'all', status: 'all' }).catch(() => [])).filter((p) => p.orgUnitId === unit.id || (!!unit.systemId && p.systemId === unit.systemId)) : []),
    `unitPlans|${workSystem}|${unitId}|${unit?.id ?? ''}`,
  );
  const nameOf = (id: string) => data?.names.get(id) ?? id;
  const person = (id: string) => (
    <Link key={id} className="unit-person" to={`${base}/${id}`}>
      <span className="unit-avatar" aria-hidden="true">{initialsOf(nameOf(id))}</span>
      <span>{nameOf(id)}</span>
    </Link>
  );

  return (
    <div className="door-block unit-page">
      <Link className="btn ghost sm door-back" to={`${base}/units`}>{t('door.units.back')}</Link>
      <LoadState loading={loading} failed={failed} retry={reload}>
        {!data || !unit ? (
          <EmptyState variant="no-results" title={t('door.units.notFound')} />
        ) : (
          <>
            <header className="panel unit-hero">
              <span className="unit-hero-icon" aria-hidden="true"><Icon name="building" size={26} /></span>
              <div className="unit-hero-text">
                <PageHeader title={unit.name} />
                <p className="unit-path">{unitPath(data.structure.units, unit.id).join(' › ')}</p>
              </div>
              <div className="unit-hero-chips">
                <span className="door-chip">{t(`door.kind.${unit.kind}` as const)}</span>
                <span className="door-chip">{unit.code ? t('door.units.code', { code: unit.code }) : t('door.units.noCode')}</span>
              </div>
            </header>

            <section className="panel unit-card" aria-label={t('door.units.activity')}>
              <header className="unit-card-head">
                <span className="feed-chip" aria-hidden="true"><Icon name="task" size={18} /></span>
                <h3>{t('door.units.activity')}</h3>
                <Link className="feed-link" to={`/s/${workSystem}/work`}>{t('door.units.activity.open')}<Icon name="chevron-right" size={14} /></Link>
              </header>
              <ActivityByStatus plans={plans.data ?? []} systemId={workSystem} />
            </section>

            <div className="unit-grid">
              <section className="panel unit-card">
                <header className="unit-card-head"><span className="feed-chip" aria-hidden="true"><Icon name="user" size={18} /></span><h3>{t('door.units.offices')}</h3></header>
                {data.holders.length === 0 ? (
                  <p className="muted">{t('door.units.officesNone')}</p>
                ) : (
                  <ul className="unit-offices">
                    {data.holders.map((h) => (
                      <li key={h.id}>
                        <Link to={`${base}/${h.personId}`}>
                          <span className="unit-avatar" aria-hidden="true">{initialsOf(nameOf(h.personId))}</span>
                          <span className="unit-office-text"><strong>{nameOf(h.personId)}</strong><small>{h.office ? t(`door.office.${h.office}` as const) : h.title}</small></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="panel unit-card">
                <header className="unit-card-head"><span className="feed-chip" aria-hidden="true"><Icon name="layers" size={18} /></span><h3>{t('door.units.children')}</h3></header>
                {(() => {
                  const kids = data.structure.units.filter((u) => u.parentId === unit.id);
                  return kids.length === 0 ? (
                    <p className="muted">{t('door.units.childrenNone')}</p>
                  ) : (
                    <ul className="unit-kids">{kids.map((k) => (<li key={k.id}><Link to={`${base}/units/${k.id}`}>{k.name}</Link></li>))}</ul>
                  );
                })()}
              </section>
            </div>

            <section className="panel unit-card">
              <header className="unit-card-head">
                <span className="feed-chip" aria-hidden="true"><Icon name="users" size={18} /></span>
                <h3>{t('door.units.members')}</h3>
                <span className="door-chip">{data.memberIds.length}</span>
              </header>
              {data.memberIds.length === 0 ? <p className="muted">{t('door.units.membersNone')}</p> : <div className="unit-people">{data.memberIds.map(person)}</div>}
            </section>
          </>
        )}
      </LoadState>
    </div>
  );
}
