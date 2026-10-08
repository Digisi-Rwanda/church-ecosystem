import { Link, useParams } from 'react-router-dom';
import { fetchStructure, type UnitRecord } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

const KINDS: UnitRecord['kind'][] = ['CENTRAL', 'MINISTRY', 'ORGANISATION', 'TEAM'];

/** The organisation as cards, grouped by kind: name, kind, code, a line about it and how many units sit inside it. */
export function OrgTreePage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { portal } = useFrontDoor();
  const { loading, failed, data, reload } = useLoad(fetchStructure, 'units');
  const units = data?.units ?? [];
  const inside = new Map<string, number>();
  for (const u of units) if (u.parentId) inside.set(u.parentId, (inside.get(u.parentId) ?? 0) + 1);
  const mine = new Set(portal.map((s) => s.id));
  return (
    <div className="door-block">
      <PageHeader title={t('door.units.title')} purpose={t('door.purpose.units')} />
      <LoadState loading={loading} failed={failed} retry={reload}>
        {units.length === 0 ? (
          <EmptyState title={t('door.units.none')} />
        ) : (
          KINDS.map((kind) => {
            const list = units.filter((u) => u.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
            if (list.length === 0) return null;
            return (
              <section key={kind} className="door-kind" aria-label={t(`door.units.group.${kind}` as const)}>
                <h3 className="door-kind-title">{t(`door.units.group.${kind}` as const)}</h3>
                <ul className="door-cards">
                  {list.map((u) => (
                    <li key={u.id} className="panel door-unit-card">
                      <Link className="door-unit-main" to={`/s/${systemId}/people/units/${u.id}`}>
                        <strong>{u.name}</strong>
                        <span className="muted">{u.code ?? t('door.units.noCode')}</span>
                        {u.description && <span className="door-unit-desc">{u.description}</span>}
                        {(inside.get(u.id) ?? 0) > 0 && <span className="door-chip">{t('door.units.inside', { count: inside.get(u.id) ?? 0 })}</span>}
                      </Link>
                      {u.systemId && mine.has(u.systemId) && u.systemId !== systemId && (
                        <a className="btn ghost sm" href={`/s/${u.systemId}`} target="_blank" rel="noopener noreferrer">
                          {t('door.units.openSystem')}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </LoadState>
    </div>
  );
}
