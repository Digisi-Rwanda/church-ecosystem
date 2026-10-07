import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { confirmMove, fetchDueToMove, type DueToMove } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { groupErrorKey } from './groups';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';

/** Due to move: who is due to change system, by the ages and trigger Central Administration set. The president or secretary confirms. */
export function MovesPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { data, loading, failed, reload } = useLoad(() => fetchDueToMove(systemId), `moves-${systemId}`);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const move = async (d: DueToMove) => {
    setBusy(d.personId);
    setError('');
    setDone('');
    try {
      await confirmMove({ personId: d.personId, fromSystemId: systemId, toSystemId: d.toSystemId });
      setDone(t('door.moves.done', { name: d.fullName, to: d.toName }));
      reload();
    } catch (err) {
      setError(t(groupErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    } finally {
      setBusy('');
    }
  };
  return (
    <section className="door-block" aria-labelledby="door-moves-title">
      <div>
        <h2 id="door-moves-title">{t('door.own.moves')}</h2>
        <p className="muted">{t('door.moves.intro')}</p>
      </div>
      {done && <p className="door-ok" role="status">{done}</p>}
      {error && <p className="door-error" role="alert">{error}</p>}
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && data.due.length === 0 && <EmptyState title={t('door.moves.none')} detail={t('door.moves.noneDetail')} />}
        {data && data.due.length > 0 && (
          <table className="door-table door-stack">
            <thead>
              <tr>
                <th>{t('door.moves.col.person')}</th>
                <th>{t('door.moves.col.age')}</th>
                <th>{t('door.moves.col.why')}</th>
                <th>{t('door.moves.col.to')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.due.map((d) => (
                <tr key={d.personId}>
                  <td data-label={t('door.moves.col.person')}>{d.fullName}</td>
                  <td data-label={t('door.moves.col.age')}>{d.age ?? '—'}</td>
                  <td data-label={t('door.moves.col.why')}>{t(`door.moves.reason.${d.reason}` as const)}</td>
                  <td data-label={t('door.moves.col.to')}>{d.toName}</td>
                  <td>
                    {data.canConfirm ? (
                      <button type="button" className="btn sm" disabled={busy === d.personId} onClick={() => void move(d)}>
                        {t('door.moves.confirm')}
                      </button>
                    ) : (
                      <span className="muted">{t('door.moves.readOnly')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </LoadState>
    </section>
  );
}
