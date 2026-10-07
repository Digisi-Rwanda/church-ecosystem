import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchP360, type P360Section } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { SECTION_ORDER, SINGLE_SECTIONS, sectionKey } from './person360';
import { RecordCard, RecordForm } from './Person360Parts';
import { useLoad } from './useLoad';

/** The whole person: basics, then each section of what the church knows, with history kept. */
export function Person360Page() {
  const t = useT();
  const { systemId = '', personId = '' } = useParams();
  const load = useLoad(() => fetchP360(personId), `p360|${personId}`);
  const [adding, setAdding] = useState<P360Section | null>(null);
  const v = load.data;
  const done = () => {
    setAdding(null);
    load.reload();
  };
  return (
    <div className="door-block">
      <Link className="btn ghost sm door-back" to={`/s/${systemId}/people/${personId}`}>
        {t('door.p360.back')}
      </Link>
      <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
        {v && (
          <>
            <header className="door-person-head">
              <div>
                <h2>{v.person.fullName}</h2>
                <p className="muted">
                  {v.person.memberCode ?? '—'} · {t('door.p360.title')}
                </p>
              </div>
            </header>
            {v.person.archived && <p className="door-error">{t('door.p360.err.archived')}</p>}
            <div className="panel">
              <h3>{t('door.p360.basics')}</h3>
              <dl className="door-facts">
                {(
                  [
                    ['dateOfBirth', v.person.dateOfBirth], ['gender', v.person.gender], ['joinedChurchOn', v.person.joinedChurchOn],
                    ['phone', v.person.phone], ['email', v.person.email], ['address', v.person.address], ['nationalId', v.person.nationalId],
                  ] as Array<[string, string | null]>
                )
                  .filter(([, val]) => val)
                  .map(([k, val]) => (
                    <div key={k}>
                      <dt>{t(`door.p360.f.${k}` as 'door.p360.f.phone')}</dt>
                      <dd>{val}</dd>
                    </div>
                  ))}
              </dl>
              <p className="muted">{t('door.p360.basicsHint')}</p>
            </div>
            {SECTION_ORDER.filter((s) => v.read.includes(s)).map((section) => {
              const items = v.records.filter((r) => r.section === section);
              const canAdd = v.write.includes(section) && !(SINGLE_SECTIONS.includes(section) && items.length > 0);
              return (
                <section key={section} className="panel" aria-labelledby={`p360-${section}`}>
                  <div className="door-row">
                    <h3 id={`p360-${section}`}>{t(sectionKey(section))}</h3>
                    {canAdd && adding !== section && (
                      <button type="button" className="btn sm" onClick={() => setAdding(section)}>
                        {t('door.p360.add', { section: t(sectionKey(section)) })}
                      </button>
                    )}
                  </div>
                  {adding === section && <RecordForm personId={personId} section={section} onDone={done} onCancel={() => setAdding(null)} />}
                  {items.length === 0 && adding !== section ? (
                    <EmptyState title={t('door.p360.none')} />
                  ) : (
                    <ul className="door-notices">
                      {items.map((r) => (
                        <RecordCard key={r.id} record={r} personId={personId} onChange={done} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </>
        )}
      </LoadState>
    </div>
  );
}
