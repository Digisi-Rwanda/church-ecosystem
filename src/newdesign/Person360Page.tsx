import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchP360, fetchP360Access, fetchP360Participation, type P360Participation, type P360Record, type P360Section, type P360View } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { formatRwf } from './money';
import { SECTION_ORDER, SINGLE_SECTIONS, sectionKey, valueKey } from './person360';
import { RecordCard, RecordForm } from './Person360Parts';
import { useLoad } from './useLoad';
import { PageHeader, SidePanel, initialsOf } from './kit';
import { BasicsForm, Documents } from './Person360Edit';
import { useCanWritePeople } from './usePeopleAccess';

type Tab = 'timeline' | 'files' | 'callings';
type Gift = P360Participation['items'][number];

/** The one-line summary of a record: its values, without the ids. */
function summary(t: (k: never) => string, r: P360Record): string {
  return Object.entries(r.data)
    .filter(([k, v]) => !/PersonId$/.test(k) && v !== '')
    .map(([, v]) => (typeof v === 'string' && /^[A-Z_]+$/.test(v) ? t(valueKey(v) as never) : String(v)))
    .join(' · ');
}

/** Sections of what the church knows about the person, each with add, change and void; history is kept. */
function Sections({ v, personId, only, reload }: { v: P360View; personId: string; only: P360Section[]; reload: () => void }) {
  const t = useT();
  const [adding, setAdding] = useState<P360Section | null>(null);
  const done = () => {
    setAdding(null);
    reload();
  };
  const shown = SECTION_ORDER.filter((s) => only.includes(s) && v.read.includes(s));
  if (shown.length === 0) return <EmptyState title={t('door.p360.none')} />;
  return (
    <div className="p360-flat">
      {shown.map((section) => {
        const items = v.records.filter((r) => r.section === section);
        const canAdd = v.write.includes(section) && !(SINGLE_SECTIONS.includes(section) && items.length > 0);
        return (
          <section key={section} aria-labelledby={`p360-${section}`}>
            <div className="p360-card-head">
              <h3 id={`p360-${section}`}>{t(sectionKey(section))}</h3>
              {canAdd && adding !== section && <button type="button" className="linkbtn" onClick={() => setAdding(section)}>{t('door.p360.add', { section: t(sectionKey(section)) })}</button>}
            </div>
            {adding === section && <RecordForm personId={personId} section={section} onDone={done} onCancel={() => setAdding(null)} />}
            {items.length === 0 && adding !== section ? (
              <p className="muted">{t('door.p360.none')}</p>
            ) : (
              <ul className="door-notices">
                {items.map((r) => (<RecordCard key={r.id} record={r} personId={personId} onChange={done} />))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** What happened, newest first: records and gifts together, each a dated card on the line. */
function Timeline({ records, gifts }: { records: P360Record[]; gifts: Gift[] }) {
  const t = useT();
  const { locale } = useI18n();
  const [older, setOlder] = useState(false);
  const date = (iso: string, zone: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone }).format(new Date(iso));
  type Ev = { key: string; at: string; day: string; type: string; detail: string; by: string; gift: boolean };
  const evs: Ev[] = [
    ...records.filter((r) => r.status === 'CURRENT' && r.recordedAt).map((r): Ev => ({
      key: `r${r.id}`, at: r.recordedAt as string, day: date(r.recordedAt as string, 'Africa/Kigali'), type: t(sectionKey(r.section)), detail: summary(t as never, r) || '—', by: r.recordedByName, gift: false,
    })),
    ...gifts.map((g): Ev => ({
      key: `g${g.kind}${g.id}`, at: `${g.day}T12:00:00Z`, day: date(`${g.day}T12:00:00Z`, 'UTC'), type: t(`door.p360.part.kind.${g.kind}` as 'door.p360.part.kind.DONATION'), detail: `${g.label} · ${formatRwf(g.amount)}`, by: g.system ?? '—', gift: true,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const shown = older ? evs : evs.slice(0, 5);
  if (evs.length === 0) return <EmptyState title={t('door.p360.none')} />;
  return (
    <div className="p360-well">
      <div className="p360-well-head">
        <span>{t('door.p360.tab.timeline')}</span>
        {evs.length > 5 && <button type="button" className="ghostbtn" onClick={() => setOlder(!older)}>{older ? t('door.p360.showLess') : t('door.p360.showPrevious')}</button>}
      </div>
      <ol className="p360-timeline">
        {shown.map((e) => (
          <li key={e.key}>
            <span className={`p360-ring${e.gift ? ' gift' : ''}`} aria-hidden="true" />
            <div className="p360-when"><strong>{e.day}</strong></div>
            <div className="p360-cell"><small>{t('door.p360.col.type')}</small><strong>{e.type}</strong></div>
            <div className="p360-cell"><small>{t('door.p360.col.detail')}</small><strong>{e.detail}</strong></div>
            <div className="p360-cell"><small>{e.gift ? t('door.p360.col.system') : t('door.p360.col.by')}</small><strong>{e.by}</strong></div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Participation updates: the latest gifts as short lines, with the year's totals. For the Church Leader only. */
function Participation({ load }: { load: { loading: boolean; failed: boolean; data?: P360Participation | null; reload: () => void } }) {
  const t = useT();
  const { locale } = useI18n();
  const [all, setAll] = useState(false);
  const d = load.data ?? undefined;
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  const line = (i: Gift) => `${t(`door.p360.part.kind.${i.kind}` as 'door.p360.part.kind.DONATION')} · ${i.label} · ${formatRwf(i.amount)}${i.status === 'PLEDGED' ? ` (${t('door.p360.part.pledgedTag')})` : ''}`;
  return (
    <section className="card" aria-labelledby="p360-part-h">
      <div className="p360-card-head">
        <h3 id="p360-part-h">{t('door.p360.part.title')}</h3>
        {d && d.items.length > 3 && <button type="button" className="linkbtn" onClick={() => setAll(!all)}>{all ? t('door.p360.showLess') : t('door.p360.part.all')}</button>}
      </div>
      <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
        {d && (
          <>
            <div className="p360-notes">
              {d.items.length === 0 ? <p className="muted">{t('door.p360.part.none')}</p> : <ul>{(all ? d.items : d.items.slice(0, 3)).map((i) => (<li key={`${i.kind}${i.id}`}>{line(i)}</li>))}</ul>}
            </div>
            <div className="p360-last">
              <strong>{t('door.p360.part.given', { year: String(d.year) })}: {formatRwf(d.totals.given)}</strong>
              <div><span>{t('door.p360.part.pledged')}: {formatRwf(d.totals.pledged)}</span>{d.items[0] && <span>{day(d.items[0].day)}</span>}</div>
            </div>
          </>
        )}
      </LoadState>
    </section>
  );
}

/** Education and employment as file-like rows; open one to change, void or see its history. */
function Education({ v, personId, reload }: { v: P360View; personId: string; reload: () => void }) {
  const t = useT();
  const [adding, setAdding] = useState<P360Section | null>(null);
  const [pick, setPick] = useState(false);
  const rows = v.records.filter((r) => r.status === 'CURRENT' && (r.section === 'EDUCATION' || r.section === 'EMPLOYMENT'));
  const addable = (['EDUCATION', 'EMPLOYMENT'] as P360Section[]).filter((s) => v.write.includes(s));
  const done = () => {
    setAdding(null);
    reload();
  };
  return (
    <section className="card" aria-labelledby="p360-edu-h">
      <div className="p360-card-head">
        <h3 id="p360-edu-h">{t('door.p360.edu')}</h3>
        {addable.length > 0 && !adding && <button type="button" className="linkbtn" onClick={() => setPick(!pick)}>{t('door.p360.addShort')}</button>}
      </div>
      {pick && !adding && (
        <div className="door-row">
          {addable.map((s) => (<button key={s} type="button" className="ghostbtn" onClick={() => { setAdding(s); setPick(false); }}>{t(sectionKey(s))}</button>))}
        </div>
      )}
      {adding && <RecordForm personId={personId} section={adding} onDone={done} onCancel={() => setAdding(null)} />}
      {rows.length === 0 && !adding ? (
        <p className="muted">{t('door.p360.none')}</p>
      ) : (
        <ul className="p360-files">
          {rows.map((r) => (
            <li key={r.id}>
              <details className="p360-file">
                <summary>
                  <span className="doc" aria-hidden="true">{r.section === 'EDUCATION' ? 'ED' : 'EM'}</span>
                  <span><strong>{summary(t as never, r) || t(sectionKey(r.section))}</strong><small>{t(sectionKey(r.section))}</small></span>
                </summary>
                <div><ul className="door-notices"><RecordCard record={r} personId={personId} onChange={reload} /></ul></div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The whole person, in one place, laid out like the church's reference profile. */
export function Person360Page() {
  const t = useT();
  const { locale } = useI18n();
  const { systemId = '', personId = '' } = useParams();
  const load = useLoad(() => fetchP360(personId), `p360|${personId}`);
  const access = useLoad(fetchP360Access, 'p360-access');
  const isLeader = !!access.data?.leader;
  const part = useLoad(() => (isLeader ? fetchP360Participation(personId) : Promise.resolve(null as P360Participation | null)), `p360-part|${personId}|${isLeader}`);
  const [tab, setTab] = useState<Tab>('timeline');
  const [editing, setEditing] = useState(false);
  const canWritePeople = useCanWritePeople();
  const v = load.data;
  const p = v?.person;
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso)) : null);
  const spouse = v?.records.find((r) => r.section === 'FAMILY' && r.status === 'CURRENT' && r.data.relation === 'SPOUSE')?.relatedName;
  const facts: Array<[string, string | null | undefined]> = p
    ? [
        [t('door.p360.f.gender'), p.gender], [t('door.p360.f.dateOfBirth'), day(p.dateOfBirth)], [t('door.p360.f.phone'), p.phone],
        [t('door.p360.f.address'), p.address], [t('door.p360.spouse'), spouse], [t('door.p360.f.memberCode'), p.memberCode],
        [t('door.p360.memberStatus'), t(`door.status.${p.status}` as 'door.status.ACTIVE')], [t('door.p360.registered'), day(p.joinedChurchOn)],
      ]
    : [];
  const callings = v ? v.records.filter((r) => r.section === 'CALLING' && r.status === 'CURRENT').length : 0;
  return (
    <div className="door-block p360">
      <PageHeader
        title={t('door.p360.title')}
        back={<Link to={`/s/${systemId}/people`}>← {t('door.people.back')}</Link>}
        primary={v && !v.person.archived && (v.write.length > 0 || canWritePeople) ? <button type="button" className="btn" onClick={() => setEditing(true)}>{t('door.p360.edit')}</button> : undefined}
      />
      {v && (
        <SidePanel open={editing} title={t('door.p360.edit.title')} purpose={t('door.p360.edit.purpose')} onClose={() => setEditing(false)} wide>
          <div className="side-form p360-edit">
            {canWritePeople && <BasicsForm person={v.person} onSaved={load.reload} />}
            <Sections v={v} personId={personId} only={SECTION_ORDER} reload={load.reload} />
          </div>
        </SidePanel>
      )}
      <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
        {v && p && (
          <>
            {p.archived && <p className="door-error">{t('door.p360.err.archived')}</p>}
            <div className="p360-grid">
              <div className="p360-left">
                <div className="p360-top">
                  <section className="card p360-id">
                    <span className="p360-avatar" aria-hidden="true">{initialsOf(p.fullName)}</span>
                    <strong className="p360-name">{p.fullName}</strong>
                    {p.email && <p className="muted">{p.email}</p>}
                    {p.nationalId && <p className="p360-nid">{t('door.p360.f.nationalId')}: {p.nationalId}</p>}
                    {p.email ? <a className="btn ghost" href={`mailto:${p.email}`}>{t('door.p360.send')}</a> : p.phone ? <a className="btn ghost" href={`sms:${p.phone}`}>{t('door.p360.send')}</a> : null}
                  </section>
                  <dl className="card p360-facts">
                    {facts.map(([k, val]) => (<div key={k}><dt>{k}</dt><dd>{val || '—'}</dd></div>))}
                  </dl>
                </div>
                <section className="card" aria-label={t('door.p360.title')}>
                  <div className="p360-tabs" role="tablist" aria-label={t('door.p360.title')}>
                    {([['timeline', t('door.p360.tab.timeline')], ['files', t('door.p360.tab.files')], ['callings', `${t('door.p360.section.CALLING')}${callings ? ` (${callings})` : ''}`]] as Array<[Tab, string]>).map(([k, label]) => (
                      <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
                    ))}
                  </div>
                  {tab === 'timeline' && <Timeline records={v.records} gifts={part.data?.items ?? []} />}
                  {tab === 'files' && <Documents personId={personId} />}
                  {tab === 'callings' && <Sections v={v} personId={personId} only={['CALLING']} reload={load.reload} />}
                </section>
              </div>
              <aside className="p360-right">
                {isLeader && <Participation load={part} />}
                <Education v={v} personId={personId} reload={load.reload} />
              </aside>
            </div>
          </>
        )}
      </LoadState>
    </div>
  );
}
