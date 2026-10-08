import { Link, useParams } from 'react-router-dom';
import { fetchDuplicates } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { useCanWritePeople } from './usePeopleAccess';
import { useLoad } from './useLoad';
import { EmptyState, ListRow, PageHeader, RowList } from './kit';

/** Records that look like the same person. Review them here; the person page lets you correct or archive one. */
export function PeopleDuplicatesPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const canWrite = useCanWritePeople();
  const load = useLoad(fetchDuplicates, 'people-duplicates');
  if (!canWrite) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  const groups = load.data?.groups ?? [];
  return (
    <section className="door-block" aria-labelledby="door-dups-title">
      <PageHeader
        id="door-dups-title"
        title={t('door.people.duplicates')}
        purpose={t('door.people.duplicates.purpose')}
        back={<Link to={`/s/${systemId}/people`}>← {t('door.people.tab.directory')}</Link>}
      />
      <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
        {groups.length === 0 ? (
          <EmptyState title={t('door.people.duplicates.none')} detail={t('door.people.duplicates.noneDetail')} />
        ) : (
          groups.map((g) => (
            <div key={g.key} className="waiting-strip">
              <h3>{t('door.people.duplicates.group', { count: g.people.length })}</h3>
              <RowList label={g.people[0].fullName}>
                {g.people.map((p) => (
                  <ListRow key={p.id} avatarName={p.fullName} title={p.fullName} detail={p.memberCode ?? undefined} to={`/s/${systemId}/people/${p.id}`} />
                ))}
              </RowList>
            </div>
          ))
        )}
      </LoadState>
      <p className="muted">{t('door.people.duplicates.mergeLater')}</p>
    </section>
  );
}
