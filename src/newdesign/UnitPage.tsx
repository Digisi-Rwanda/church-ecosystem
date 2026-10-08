import { Link, useParams } from 'react-router-dom';
import { fetchPeople, fetchStructure } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { membersOf, officeHoldersOf, unitPath } from './structure';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

const today = () => new Date().toISOString().slice(0, 10);

/** One unit: its place in the organisation, the units inside it, its members and its office holders. */
export function UnitPage() {
  const t = useT();
  const { systemId = '', unitId = '' } = useParams();
  const base = `/s/${systemId}/people`;
  const { loading, failed, data, reload } = useLoad(async () => {
    const structure = await fetchStructure();
    const day = today();
    const memberIds = membersOf(unitId, structure.memberships, day);
    const holders = officeHoldersOf(unitId, structure.offices, day);
    const ids = [...new Set([...memberIds, ...holders.map((h) => h.personId)])];
    const people = ids.length ? await fetchPeople({ ids }) : [];
    return { structure, memberIds, holders, names: new Map(people.map((p) => [p.id, p.fullName])) };
  }, `unit|${unitId}`);

  const unit = data?.structure.units.find((u) => u.id === unitId);
  const nameOf = (id: string) => data?.names.get(id) ?? id;

  return (
    <div className="door-block">
      <Link className="btn ghost sm door-back" to={`${base}/units`}>
        {t('door.units.back')}
      </Link>
      <LoadState loading={loading} failed={failed} retry={reload}>
        {!data || !unit ? (
          <EmptyState variant="no-results" title={t('door.units.notFound')} />
        ) : (
          <>
            <header className="door-person-head">
              <div>
                <PageHeader title={unit.name} />
                <p className="muted">{unit.code ? t('door.units.code', { code: unit.code }) : t('door.units.noCode')}</p>
              </div>
              <span className="door-chip">{t(`door.kind.${unit.kind}` as const)}</span>
            </header>
            <div className="panel">
              <h3>{t('door.units.path')}</h3>
              <p>{unitPath(data.structure.units, unit.id).join(' › ')}</p>
            </div>
            <div className="panel">
              <h3>{t('door.units.children')}</h3>
              {(() => {
                const kids = data.structure.units.filter((u) => u.parentId === unit.id);
                return kids.length === 0 ? (
                  <p className="muted">{t('door.units.childrenNone')}</p>
                ) : (
                  <ul className="door-list">
                    {kids.map((k) => (
                      <li key={k.id}>
                        <Link to={`${base}/units/${k.id}`}>{k.name}</Link>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
            <div className="panel">
              <h3>{t('door.units.offices')}</h3>
              {data.holders.length === 0 ? (
                <p className="muted">{t('door.units.officesNone')}</p>
              ) : (
                <ul className="door-list">
                  {data.holders.map((h) => (
                    <li key={h.id}>
                      <strong>{h.office ? t(`door.office.${h.office}` as const) : h.title}</strong>
                      {' · '}
                      <Link to={`${base}/${h.personId}`}>{nameOf(h.personId)}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="panel">
              <h3>{t('door.units.members')}</h3>
              {data.memberIds.length === 0 ? (
                <p className="muted">{t('door.units.membersNone')}</p>
              ) : (
                <ul className="door-list">
                  {data.memberIds.map((id) => (
                    <li key={id}>
                      <Link to={`${base}/${id}`}>{nameOf(id)}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </LoadState>
    </div>
  );
}
