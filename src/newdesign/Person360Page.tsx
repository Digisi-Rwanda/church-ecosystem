import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchP360, fetchP360Access, fetchP360Participation, type P360Participation, type P360Record, type P360Section, type P360View } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { formatRwf } from './money';
import { SECTION_ORDER, SINGLE_SECTIONS, sectionKey } from './person360';
import { Facts, RecordCard, RecordForm } from './Person360Parts';
import { useLoad } from './useLoad';
import { PageHeader, Tabs, initialsOf } from './kit';

type Tab = 'timeline' | 'records' | 'callings';

/** Contributions, donations, sponsorships: everything this person gave, from every system, for the Church Leader. */
function Participation({ personId }: { personId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const load = useLoad(() => fetchP360Participation(personId), `p360-part|${personId}`);
  const [all, setAll] = useState(false);
  const d: P360Participation | undefined = load.data ?? undefined;
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  const shown = d ? (all ? d.items : d.items.slice(0, 5)) : [];
  return (
    <section className="panel p360-part" aria-labelledby="p360-part-h">
      <h3 id="p360-part-h">{t('door.p360.part.title')}</h3>
      <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
        {d && (
          <>
            <div className="p360-totals">
              <div>
                <strong>{formatRwf(d.totals.given)}</strong>
                <span className="muted">{t('door.p360.part.given', { year: String(d.year) })}</span>
              </div>
              <div>
                <strong>{formatRwf(d.totals.pledged)}</strong>
                <span className="muted">{t('door.p360.part.pledged')}</span>
              </div>
            </div>
            {d.items.length === 0 ? (
              <EmptyState title={t('door.p360.part.none')} />
            ) : (
              <ul className="p360-feed">
                {shown.map((i) => (
                  <li key={`${i.kind}-${i.id}`}>
                    <div>
                      <span className={`door-chip${i.status === 'PLEDGED' ? ' warn' : ''}`}>{t(`door.p360.part.kind.${i.kind}` as 'door.p360.part.kind.DONATION')}</span>
                      <strong> {i.label}</strong>
                      <p className="muted">{[i.system, day(i.day)].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span>{formatRwf(i.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            {(d.items.length > 5 || d.more) && !all && (
              <button type="button" className="btn ghost sm" onClick={() => setAll(true)}>{t('door.p360.part.all')}</button>
            )}
          </>
        )}
      </LoadState>
    </section>
  );
}

function Sections({ v, personId, only, reload }: { v: P360View; personId: string; only: P360Section[]; reload: () => void }) {
  const t = useT();
  const [adding, setAdding] = useState<P360Section | null>(null);
  const done = () => {
    setAdding(null);
    reload();
  };
  return (
    <>
      {SECTION_ORDER.filter((s) => only.includes(s) && v.read.includes(s)).map((section) => {
        const items = v.records.filter((r) => r.section === section);
        const canAdd = v.write.includes(section) && !(SINGLE_SECTIONS.includes(section) && items.length > 0);
        return (
          <section key={section} className="panel" aria-labelledby={`p360-${section}`}>
            <div className="door-row">
              <h3 id={`p360-${section}`}>{t(sectionKey(section))}</h3>
              {canAdd && adding !== section && (
                <button type="button" className="btn sm" onClick={() => setAdding(section)}>{t('door.p360.add', { section: t(sectionKey(section)) })}</button>
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
  );
}

function Timeline({ records }: { records: P360Record[] }) {
  const t = useT();
  const { locale } = useI18n();
  const rows = records.filter((r) => r.status === 'CURRENT').sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''));
  if (rows.length === 0) return <EmptyState title={t('door.p360.none')} />;
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  return (
    <ul className="door-notices">
      {rows.map((r) => (
        <li key={r.id} className="panel door-notice">
          <div className="door-notice-main">
            <div className="door-row">
              <strong>{t(sectionKey(r.section))}</strong>
              <span className="muted">{day(r.recordedAt)}</span>
            </div>
            <Facts r={r} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The whole person: a profile card, what they gave, and each part of what the church knows, with history kept. */
export function Person360Page() {
  const t = useT();
  const { systemId = '', personId = '' } = useParams();
  const load = useLoad(() => fetchP360(personId), `p360|${personId}`);
  const [tab, setTab] = useState<Tab>('timeline');
  const v = load.data;
  const p = v?.person;
  const facts: Array<[string, string | null | undefined]> = p
    ? [['gender', p.gender], ['dateOfBirth', p.dateOfBirth], ['phone', p.phone], ['address', p.address], ['joinedChurchOn', p.joinedChurchOn]]
    : [];
  const spouse = v?.records.find((r) => r.section === 'FAMILY' && r.status === 'CURRENT' && r.data.relation === 'SPOUSE')?.relatedName;
  const study = v ? v.records.filter((r) => r.status === 'CURRENT' && (r.section === 'EDUCATION' || r.section === 'EMPLOYMENT')) : [];
  // The participation feed answers 404 to anyone but the Church Leader, so the card is only offered to them.
  const access = useLoad(fetchP360Access, 'p360-access');
  const isLeader = !!access.data?.leader;
  return (
    <div className="door-block">
      <Link className="btn ghost sm door-back" to={`/s/${systemId}/people`}>{t('door.people.back')}</Link>
      <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
        {v && p && (
          <>
            {p.archived && <p className="door-error">{t('door.p360.err.archived')}</p>}
            <div className="p360-grid">
              <div className="p360-main">
                <section className="panel p360-card">
                  <span className="p360-avatar" aria-hidden="true">{initialsOf(p.fullName)}</span>
                  <div className="p360-who">
                    <PageHeader title={p.fullName} />
                    <p className="muted">{[p.memberCode, t(`door.status.${p.status}` as 'door.status.ACTIVE')].filter(Boolean).join(' · ')}</p>
                    {p.email && <p><a href={`mailto:${p.email}`}>{p.email}</a></p>}
                    {p.nationalId && <p className="p360-nid"><span className="muted">{t('door.p360.f.nationalId')}</span> {p.nationalId}</p>}
                    <div className="door-row">
                      {p.email && <a className="btn sm" href={`mailto:${p.email}`}>{t('door.p360.send')}</a>}
                      {p.phone && <a className="btn ghost sm" href={`tel:${p.phone}`}>{t('door.p360.call')}</a>}
                    </div>
                  </div>
                  <dl className="door-facts p360-facts">
                    {facts.filter(([, val]) => val).map(([k, val]) => (
                      <div key={k}><dt>{t(`door.p360.f.${k}` as 'door.p360.f.phone')}</dt><dd>{val}</dd></div>
                    ))}
                    {spouse && <div><dt>{t('door.p360.spouse')}</dt><dd>{spouse}</dd></div>}
                  </dl>
                </section>
                <Tabs<Tab>
                  label={t('door.p360.title')}
                  value={tab}
                  onChange={setTab}
                  items={[{ key: 'timeline', label: t('door.p360.tab.timeline') }, { key: 'records', label: t('door.p360.tab.records') }, { key: 'callings', label: t('door.p360.section.CALLING') }]}
                />
                {tab === 'timeline' && <Timeline records={v.records} />}
                {tab === 'records' && <Sections v={v} personId={personId} only={SECTION_ORDER.filter((s) => s !== 'CALLING')} reload={load.reload} />}
                {tab === 'callings' && <Sections v={v} personId={personId} only={['CALLING']} reload={load.reload} />}
              </div>
              <aside className="p360-side">
                {isLeader && <Participation personId={personId} />}
                <section className="panel">
                  <h3>{t('door.p360.edu')}</h3>
                  {study.length === 0 ? <EmptyState title={t('door.p360.none')} /> : (
                    <ul className="door-list">
                      {study.map((r) => (<li key={r.id}><strong>{t(sectionKey(r.section))}</strong><Facts r={r} /></li>))}
                    </ul>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </LoadState>
    </div>
  );
}
