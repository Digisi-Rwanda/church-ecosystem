import { Link, useParams } from 'react-router-dom';
import { fetchStructure } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { flattenTree } from './structure';
import { useLoad } from './useLoad';

/** The whole organisation as one indented tree: central, ministries, organisations and teams. */
export function OrgTreePage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { loading, failed, data, reload } = useLoad(fetchStructure, 'units');
  const rows = data ? flattenTree(data.units) : [];
  return (
    <div className="door-block">
      <h2>{t('door.units.title')}</h2>
      <LoadState loading={loading} failed={failed} retry={reload}>
        {rows.length === 0 ? (
          <EmptyState title={t('door.units.none')} />
        ) : (
          <ul className="panel door-tree">
            {rows.map(({ unit, depth }) => (
              <li key={unit.id} style={{ paddingInlineStart: `${depth * 1.25}rem` }}>
                <Link to={`/s/${systemId}/people/units/${unit.id}`}>{unit.name}</Link>
                <span className="door-chip">{t(`door.kind.${unit.kind}` as const)}</span>
                <span className="muted">{unit.code ?? t('door.units.noCode')}</span>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </div>
  );
}
