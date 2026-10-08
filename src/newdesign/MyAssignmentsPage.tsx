import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { declineAssignment, fetchMyDuties } from '../api/frontDoorApi';
import { TextAreaField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { dayHeading, groupByDay, overlapping, scheduleErrorKey, timeRange } from './schedule';
import { useLoad } from './useLoad';
import { EmptyState, ListRow, PageHeader, RowList, StatusChip } from './kit';

/** Everything I am asked to do, by day. A clash with another duty is shown before it becomes a problem. */
export function MyAssignmentsPage() {
  const t = useT();
  const { locale } = useI18n();
  const { systemId = '' } = useParams();
  const duties = useLoad(fetchMyDuties, 'sched-mine');
  const [asking, setAsking] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const list = duties.data ?? [];
  const clashes = overlapping(list.map((d) => ({ id: d.assignmentId, startsAt: d.startsAt, endsAt: d.endsAt })));
  const decline = async (id: string) => {
    setError('');
    try {
      await declineAssignment(id, reason.trim());
      setAsking(null);
      setReason('');
      duties.reload();
    } catch (err) {
      setError(t(scheduleErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <section className="door-block" aria-labelledby="door-mine-title">
      <PageHeader
        id="door-mine-title"
        title={t('door.sched.mine')}
        purpose={t('door.sched.mine.purpose')}
        back={<Link to={`/s/${systemId}/schedule`}>← {t('door.block.schedule')}</Link>}
      />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <LoadState loading={duties.loading} failed={duties.failed} retry={duties.reload}>
        {list.length === 0 ? (
          <EmptyState title={t('door.sched.mine.none')} detail={t('door.sched.mine.noneDetail')} />
        ) : (
          groupByDay(list).map((g) => (
            <div key={g.day} className="waiting-strip">
              <h3>{dayHeading(g.day, locale)}</h3>
              <RowList label={dayHeading(g.day, locale)}>
                {g.slots.map((d) => (
                  <ListRow
                    key={d.assignmentId}
                    title={`${d.title} · ${d.role}`}
                    detail={`${timeRange(d.startsAt, d.endsAt, locale)} · ${d.unitName}${d.location ? ` · ${d.location}` : ''}`}
                    status={clashes.has(d.assignmentId) ? <StatusChip tone="warn">{t('door.sched.clash')}</StatusChip> : undefined}
                    action={
                      <button type="button" className="btn ghost sm" onClick={() => { setAsking(d.assignmentId); setReason(''); }}>
                        {t('door.sched.decline')}
                      </button>
                    }
                  />
                ))}
              </RowList>
              {g.slots.filter((d) => asking === d.assignmentId).map((d) => (
                <div key={d.assignmentId} className="panel door-form">
                  <TextAreaField label={t('door.sched.declineReason')} name={`m-${d.assignmentId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="door-row">
                    <button type="button" className="btn" disabled={!reason.trim()} onClick={() => void decline(d.assignmentId)}>
                      {t('door.sched.declineConfirm')}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setAsking(null)}>
                      {t('kit.cancel')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </LoadState>
    </section>
  );
}
