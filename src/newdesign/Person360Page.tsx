import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchP360, fetchP360Access, fetchP360Participation, type P360Participation, type P360Record, type P360Section, type P360View } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { formatRwf } from './money';
import { SECTION_ORDER, SINGLE_SECTIONS, sectionKey } from './person360';
import { Facts, RecordCard, RecordForm } from './Person360Parts';
import { useLoad } from './useLoad';
import { PageHeader, StatusChip, Tabs, initialsOf } from './kit';

type Tab = 'timeline' | 'records' | 'callings';

/** Contributions, donations, sponsorships: everything this person gave, from every system, for the Church Leader. */
function Participation({ load }: { load: { loading: boolean; failed: boolean; data?: P360Participation | null; reload: () => void } }) {
  const t = useT();
  const [all, setAll] = useState(false);
  const d = load.data ?? undefined;
  const shown = d ? (all ? d.items : d.items.slice(0, 6)) : [];
  return (
    <section className="panel p360-part" aria-labelledby="p360-part-h">
      <div className="door-row">
        <h3 id="p360-part-h">{t('door.p360.part.title')}</h3>
        {d && <span className="muted">{d.year}</span>}
      </div>
      <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
        {d && (
          <>
            <div className="p360-totals">
              <div className="p360-tile">
                <span className="muted">{t('door.p360.part.given', { year: String(d.year) })}</span>
                <strong>{formatRwf(d.totals.given)}</strong>
              </div>
              <div className="p360-tile warn">
                <span className="muted">{t('door.p360.part.pledged')}</span>
                <strong>{formatRwf(d.totals.pledged)}</strong>
              </div>
            </div>
            {d.items.length === 0 ? (
              <EmptyState title={t('door.p360.part.none')} />
            ) : (
              <ul className="p360-feed">
                {shown.map((i) => (
                  <GiftRow key={`${i.kind}-${i.id}`} i={i} />
                ))}
              </ul>
            )}
            {(d.items.length > 6 || d.more) && !all && (
              <button type="button" className="btn ghost sm" onClick={() => setAll(true)}>{t('door.p360.part.all')}</button>
            )}
          </>
        )}
      </LoadState>
    </section>
  );
}

type Gift = P360Participation['items'][number];
const KIND_MARK: Record<Gift['kind'], string> = { CONTRIBUTION: 'C', DONATION: 'D', SPONSORSHIP: 'S', CLAIM: 'R' };

function GiftRow({ i }: { i: Gift }) {
  const t = useT();
  const { locale } = useI18n();
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${i.day}T12:00:00Z`));
  return (
    <li>
      <span className={`p360-mark ${i.kind.toLowerCase()}`} aria-hidden="true">{KIND_MARK[i.kind]}</span>
      <div>
        <strong>{i.label}</strong>
        <p className="muted">{[t(`door.p360.part.kind.${i.kind}` as 'door.p360.part.kind.DONATION'), i.system, day].filter(Boolean).join(' · ')}</p>
      </div>
      <span className="p360-amt">
        {formatRwf(i.amount)}
        {i.status === 'PLEDGED' && <small className="muted">{t('door.p360.part.pledgedTag')}</small>}
      </span>
    </li>
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

function Timeline({ records, gifts }: { records: P360Record[]; gifts: Gift[] }) {
  const t = useT();
  const { locale } = useI18n();
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso));
  type Ev = { key: string; at: string; node: ReactNode; dot: string };
  const evs: Ev[] = [
    ...records.filter((r) => r.status === 'CURRENT' && r.recordedAt).map((r): Ev => ({
      key: `r${r.id}`, at: r.recordedAt as string, dot: 'record',
      node: (<><strong>{t(sectionKey(r.section))}</strong><Facts r={r} /><p className="muted">{t('door.p360.recorded', { name: r.recordedByName, date: fmt(r.recordedAt as string) })}</p></>),
    })),
    ...gifts.map((g): Ev => ({ key: `g${g.kind}${g.id}`, at: `${g.day}T12:00:00Z`, dot: g.kind.toLowerCase(), node: <ul className="p360-feed"><GiftRow i={g} /></ul> })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (evs.length === 0) return <EmptyState title={t('door.p360.none')} />;
  return (
    <ol className="p360-timeline">
      {evs.map((e) => (
        <li key={e.key}>
          <span className={`p360-dot ${e.dot}`} aria-hidden="true" />
          <time className="muted" dateTime={e.at}>{fmt(e.at)}</time>
          <div>{e.node}</div>
        </li>
      ))}
    </ol>
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
  const cur = (sec: P360Section) => (v ? v.records.filter((r) => r.section === sec && r.status === 'CURRENT') : []);
  const baptism = cur('BAPTISM')[0];
  const callings = cur('CALLING');
  const family = cur('FAMILY').length;
  const age = p?.dateOfBirth ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / 31557600000) : null;
  const study = v ? v.records.filter((r) => r.status === 'CURRENT' && (r.section === 'EDUCATION' || r.section === 'EMPLOYMENT')) : [];
  // The participation feed answers 404 to anyone but the Church Leader, so the card is only offered to them.
  const access = useLoad(fetchP360Access, 'p360-access');
  const isLeader = !!access.data?.leader;
  const part = useLoad(() => (isLeader ? fetchP360Participation(personId) : Promise.resolve(null as P360Participation | null)), `p360-part|${personId}|${isLeader}`);
  const gifts = part.data?.items ?? [];
  return (
    <div className="door-block">
      <Link className="btn ghost sm door-back" to={`/s/${systemId}/people`}>{t('door.people.back')}</Link>
      <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
        {v && p && (
          <>
            {p.archived && <p className="door-error">{t('door.p360.err.archived')}</p>}
            <section className="panel p360-card">
              <span className="p360-avatar" aria-hidden="true">{initialsOf(p.fullName)}</span>
              <div className="p360-who">
                <div className="door-row">
                  <PageHeader title={p.fullName} />
                  <StatusChip tone={p.status === 'ACTIVE' ? 'success' : 'neutral'}>{t(`door.status.${p.status}` as 'door.status.ACTIVE')}</StatusChip>
                </div>
                <p className="muted">{[p.memberCode, age !== null ? t('door.p360.age', { n: String(age) }) : null].filter(Boolean).join(' · ')}</p>
                {p.email && <p><a href={`mailto:${p.email}`}>{p.email}</a></p>}
                {p.nationalId && <p className="p360-nid"><span className="muted">{t('door.p360.f.nationalId')}</span> <strong>{p.nationalId}</strong></p>}
              </div>
              <div className="p360-actions">
                {p.email && <a className="btn" href={`mailto:${p.email}`}>{t('door.p360.send')}</a>}
                {p.phone && <a className="btn ghost" href={`tel:${p.phone}`}>{t('door.p360.call')}</a>}
              </div>
              <dl className="p360-facts">
                {facts.filter(([, val]) => val).map(([k, val]) => (
                  <div key={k}><dt>{t(`door.p360.f.${k}` as 'door.p360.f.phone')}</dt><dd>{val}</dd></div>
                ))}
                {spouse && <div><dt>{t('door.p360.spouse')}</dt><dd>{spouse}</dd></div>}
                {baptism && <div><dt>{t('door.p360.section.BAPTISM')}</dt><dd>{String(baptism.data.date ?? '✓')}</dd></div>}
                {callings.length > 0 && <div><dt>{t('door.p360.section.CALLING')}</dt><dd>{callings.length}</dd></div>}
                {family > 0 && <div><dt>{t('door.p360.section.FAMILY')}</dt><dd>{family}</dd></div>}
              </dl>
            </section>
            <div className="p360-grid">
              <div className="p360-main">
                <Tabs<Tab>
                  label={t('door.p360.title')}
                  value={tab}
                  onChange={setTab}
                  items={[{ key: 'timeline', label: t('door.p360.tab.timeline') }, { key: 'records', label: t('door.p360.tab.records') }, { key: 'callings', label: t('door.p360.section.CALLING'), count: callings.length }]}
                />
                {tab === 'timeline' && <Timeline records={v.records} gifts={gifts} />}
                {tab === 'records' && <Sections v={v} personId={personId} only={SECTION_ORDER.filter((s) => s !== 'CALLING')} reload={load.reload} />}
                {tab === 'callings' && <Sections v={v} personId={personId} only={['CALLING']} reload={load.reload} />}
              </div>
              <aside className="p360-side">
                {isLeader && <Participation load={part} />}
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
