import type { ReactNode } from 'react';
import type { P360Participation, P360Record, P360Section, P360View } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { formatRwf } from './money';
import { sectionKey, valueKey } from './person360';

type Gift = P360Participation['items'][number];
type Line = { title: string; detail: string; when: string | null };

/** The profile sheet: everything the viewer may read about the person, laid out like a one-page resume. */
export function Person360Sheet({ v, gifts, showGifts }: { v: P360View; gifts: Gift[]; showGifts: boolean }) {
  const t = useT();
  const { locale } = useI18n();
  const p = v.person;
  const day = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso)) : null);
  const cur = (s: P360Section) => (v.read.includes(s) ? v.records.filter((r) => r.section === s && r.status === 'CURRENT') : []);
  const line = (r: P360Record): Line => {
    const vals = Object.entries(r.data)
      .filter(([k, x]) => !/PersonId$/.test(k) && k !== 'date' && x !== '')
      .map(([, x]) => (typeof x === 'string' && /^[A-Z_]+$/.test(x) ? t(valueKey(x) as never) : String(x)));
    const extra = [r.relatedName, r.programName].filter(Boolean);
    const all = [...vals, ...extra];
    const d = typeof r.data.date === 'string' ? r.data.date : null;
    return { title: all[0] ?? t(sectionKey(r.section)), detail: all.slice(1).join(' · '), when: d };
  };
  const block = (s: P360Section) => cur(s).map(line);
  const spouse = cur('FAMILY').find((r) => r.data.relation === 'SPOUSE')?.relatedName;
  const baptism = cur('BAPTISM')[0];
  const marriage = cur('MARRIAGE')[0];
  const callings = block('CALLING');
  const work = block('EMPLOYMENT');
  const edu = block('EDUCATION');
  const skills = [...block('SKILL'), ...block('GIFT')];
  const family = cur('FAMILY').filter((r) => r.data.relation !== 'SPOUSE').map(line);
  const joined = day(p.joinedChurchOn);
  const intro = [
    joined ? t('door.p360.sheet.introJoined', { name: p.fullName, date: joined }) : t('door.p360.sheet.introName', { name: p.fullName }),
    baptism?.data.date ? t('door.p360.sheet.introBaptised', { date: day(String(baptism.data.date)) ?? '' }) : '',
    marriage?.data.date ? t('door.p360.sheet.introMarried', { date: day(String(marriage.data.date)) ?? '' }) : '',
    callings.length > 0 ? t('door.p360.sheet.introCallings', { count: String(callings.length) }) : '',
  ].filter(Boolean).join(' ');
  const contact: Array<[string, string | null | undefined]> = [
    [t('door.p360.f.phone'), p.phone], [t('door.p360.sheet.email'), p.email], [t('door.p360.f.address'), p.address],
  ];
  const personal: Array<[string, string | null | undefined]> = [
    [t('door.p360.f.gender'), p.gender], [t('door.p360.f.dateOfBirth'), day(p.dateOfBirth)], [t('door.p360.spouse'), spouse],
    [t('door.p360.f.memberCode'), p.memberCode], [t('door.p360.memberStatus'), t(`door.status.${p.status}` as 'door.status.ACTIVE')],
  ];
  const facts = (rows: Array<[string, string | null | undefined]>): ReactNode =>
    rows.filter(([, x]) => x).map(([k, x]) => (<p key={k} className="resume-fact"><small>{k}</small><span>{x}</span></p>));
  const entries = (rows: Line[]): ReactNode =>
    rows.map((l, i) => (
      <div key={`${l.title}${i}`} className="resume-entry">
        <strong>{l.title}</strong>
        {(l.detail || l.when) && <span>{[day(l.when), l.detail].filter(Boolean).join(' · ')}</span>}
      </div>
    ));
  const journey: Line[] = [
    ...(baptism ? [{ ...line(baptism), title: t(sectionKey('BAPTISM')) }] : []),
    ...(marriage ? [{ ...line(marriage), title: t(sectionKey('MARRIAGE')) }] : []),
  ];
  const Part = ({ title, children }: { title: string; children: ReactNode }) => (children ? <section className="resume-part"><h3 className="resume-h">{title}</h3>{children}</section> : null);
  const empty = <p className="muted">{t('door.p360.sheet.empty')}</p>;
  return (
    <article className="resume" aria-label={t('door.p360.tab.sheet')}>
      <header className="resume-head">
        <p className="resume-name">{p.fullName}</p>
        <p className="resume-role">{[callings[0]?.title, p.memberCode].filter(Boolean).join(' · ') || t(`door.status.${p.status}` as 'door.status.ACTIVE')}</p>
      </header>
      <hr className="resume-rule" />
      <div className="resume-cols">
        <aside className="resume-side">
          <Part title={t('door.p360.sheet.contact')}>{facts(contact)}</Part>
          <Part title={t('door.p360.sheet.personal')}>{facts(personal)}</Part>
          {edu.length > 0 && <Part title={t('door.p360.sheet.education')}>{entries(edu)}</Part>}
          {skills.length > 0 && <Part title={t('door.p360.sheet.skills')}>{entries(skills)}</Part>}
          {family.length > 0 && <Part title={t('door.p360.section.FAMILY')}>{entries(family)}</Part>}
        </aside>
        <div className="resume-main">
          <Part title={t('door.p360.sheet.profile')}><p className="resume-intro">{intro}</p></Part>
          <Part title={t('door.p360.sheet.journey')}>{journey.length > 0 ? entries(journey) : empty}</Part>
          <Part title={t('door.p360.sheet.service')}>{callings.length > 0 ? entries(callings) : empty}</Part>
          {work.length > 0 && <Part title={t('door.p360.sheet.work')}>{entries(work)}</Part>}
          {showGifts && gifts.length > 0 && (
            <Part title={t('door.p360.part.title')}>
              {gifts.slice(0, 8).map((g) => (
                <div key={`${g.kind}${g.id}`} className="resume-entry">
                  <strong>{g.label}</strong>
                  <span>{[day(`${g.day}T12:00:00Z`), g.kind === 'GOOD_DEED' ? t('door.p360.part.kind.GOOD_DEED') : formatRwf(g.amount)].filter(Boolean).join(' · ')}</span>
                </div>
              ))}
            </Part>
          )}
        </div>
      </div>
    </article>
  );
}
