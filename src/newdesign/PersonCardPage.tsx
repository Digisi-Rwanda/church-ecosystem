import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  archivePerson,
  fetchP360Access,
  fetchPerson,
  fetchStructure,
  unarchivePerson,
  type DirectoryPerson,
} from '../api/frontDoorApi';
import { ApiError } from '../api/client';
import { StatusPill } from '../components/ui/StatusPill';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { useCanWritePeople } from './usePeopleAccess';
import { belongingOf } from './structure';
import { useLoad } from './useLoad';

const today = () => new Date().toISOString().slice(0, 10);

export function PersonCardPage() {
  const t = useT();
  const { systemId = '', personId = '' } = useParams();
  const canWrite = useCanWritePeople();
  const base = `/s/${systemId}/people`;
  const p360 = useLoad(fetchP360Access, 'p360-access');
  const { loading, failed, data, reload } = useLoad(async () => {
    const [person, structure] = await Promise.all([fetchPerson(personId), fetchStructure()]);
    return { person, belonging: belongingOf(personId, structure, today()) };
  }, `person|${personId}`);

  return (
    <div className="door-block">
      <Link className="btn ghost sm door-back" to={base}>
        {t('door.people.back')}
      </Link>
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && (
          <>
            <PersonHeader person={data.person} />
            <PersonFacts person={data.person} />
            {p360.data?.allowed && (<p><Link className="btn" to={`${base}/${personId}/360`}>{t('door.p360.open')}</Link>{p360.data.write.includes('BAPTISM') && <> <Link className="btn ghost" to={`${base}/baptism`}>{t('door.p360.cohort.title')}</Link></>}</p>)}
            <div className="panel">
              <h3>{t('door.people.belongs')}</h3>
              {data.belonging.memberships.length === 0 ? (
                <p className="muted">{t('door.people.belongsNone')}</p>
              ) : (
                <ul className="door-list">
                  {data.belonging.memberships.map((m) => (
                    <li key={m.id}>
                      {m.unit ? <Link to={`${base}/units/${m.unit.id}`}>{m.unit.name}</Link> : <span>{m.label}</span>}
                      <span className="muted"> {t('door.people.since', { date: m.since })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="panel">
              <h3>{t('door.people.offices')}</h3>
              {data.belonging.offices.length === 0 ? (
                <p className="muted">{t('door.people.officesNone')}</p>
              ) : (
                <ul className="door-list">
                  {data.belonging.offices.map((o) => (
                    <li key={o.id}>
                      <strong>{o.office ? t(`door.office.${o.office}` as const) : o.title}</strong>
                      {o.unit && (
                        <>
                          {' · '}
                          <Link to={`${base}/units/${o.unit.id}`}>{o.unit.name}</Link>
                        </>
                      )}
                      <span className="muted"> {t('door.people.since', { date: o.since })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {canWrite && <ArchivePanel person={data.person} onChanged={reload} />}
          </>
        )}
      </LoadState>
    </div>
  );
}

function PersonHeader({ person }: { person: DirectoryPerson }) {
  const t = useT();
  return (
    <header className="door-person-head">
      <div>
        <h2>{person.fullName}</h2>
        <p className="muted">{person.memberCode ?? '—'}</p>
      </div>
      <StatusPill status={person.status}>{t(`door.status.${person.status}` as const)}</StatusPill>
      {person.archivedAt && (
        <p className="door-banner" role="note">
          {t('door.people.archivedBanner')}
          {person.archivedReason ? ` ${t('door.people.archivedReason', { reason: person.archivedReason })}` : ''}
        </p>
      )}
    </header>
  );
}

function PersonFacts({ person }: { person: DirectoryPerson }) {
  const t = useT();
  const facts: Array<[string, string | null | undefined]> = [
    [t('door.people.field.phone'), person.phone],
    [t('door.people.field.email'), person.email],
    [t('door.people.field.dateOfBirth'), person.dateOfBirth],
    [t('door.people.field.nationalId'), person.nationalId],
    [t('door.people.field.joined'), person.joinedChurchOn],
  ];
  const shown = facts.filter(([, v]) => !!v);
  if (shown.length === 0) return null;
  return (
    <dl className="panel door-facts">
      {shown.map(([label, value]) => (
        <div key={label}>
          <dt className="muted">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ArchivePanel({ person, onChanged }: { person: DirectoryPerson; onChanged: () => void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setProblem('');
    try {
      await action();
      onChanged();
    } catch (e) {
      const code = e instanceof ApiError ? (e.body as { code?: string } | undefined)?.code : undefined;
      setProblem(
        code === 'HOLDS_OFFICE'
          ? t('door.people.holdsOffice')
          : code === 'CANNOT_ARCHIVE_SELF'
            ? t('door.people.archiveSelf')
            : t('door.people.actionFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel door-archive">
      {person.archivedAt ? (
        <button type="button" className="btn secondary" disabled={busy} onClick={() => void run(() => unarchivePerson(person.id))}>
          {t('door.people.unarchive')}
        </button>
      ) : (
        <>
          <label className="field-label" htmlFor="archive-reason">
            {t('door.people.archiveReason')}
          </label>
          <input id="archive-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void run(() => archivePerson(person.id, reason.trim() || undefined))}>
            {t('door.people.archive')}
          </button>
        </>
      )}
      {problem && (
        <p className="door-error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
