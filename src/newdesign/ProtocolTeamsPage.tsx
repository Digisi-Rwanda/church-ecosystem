import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  acknowledgeProtocolMusic, addProtocolSlot, approveProtocolRoles, fetchProtocolHistory, fetchProtocolMonth, fetchProtocolRoster, generateProtocolTeams, overrideProtocolIssue, publishProtocolMonth,
  relaxProtocolTuesday, removeProtocolSlot, replaceProtocolSlot, returnProtocolMonth, setProtocolRole, submitProtocolMonth, type ProtocolMonthView, type ProtocolRole,
  type ProtocolServiceView,
} from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { shiftMonth, thisMonth } from './music';
import { ROLES, candidatesFor, issuesOfService, openBlocking, protocolErrorKey, sortIssues } from './protocol';
import { downloadSchedulePdf } from './schedulePdf';
import { Bulletin, DateTile, ScheduleList, ViewSwitch, useMonthName, useScheduleView, useShortDay, type ScheduleRow, type ScheduleViewKey } from './ScheduleShared';
import { useLoad } from './useLoad';
import { EmptyState, PageHeader, SidePanel, StatusChip, Tabs, initialsOf } from './kit';

type Act = (job: () => Promise<unknown>) => void;
const regular = (svc: ProtocolServiceView) => svc.team.filter((x) => x.slotKind !== 'FILL_IN').length;

function ServiceCard({ svc, view, onEdit }: { svc: ProtocolServiceView; view: ProtocolMonthView; onEdit?: () => void }) {
  const t = useT();
  const n = regular(svc);
  const bad = issuesOfService(view.issues, svc.id).some((i) => i.severity === 'BLOCKING' && !i.overridden);
  const tone = bad ? 'danger' : n < svc.target ? 'warn' : n === 0 ? 'neutral' : 'success';
  return (
    <li className={`pt-card${bad ? ' bad' : ''}`}>
      <div className="pt-card-head">
        <DateTile date={svc.date} />
        <div className="pt-card-title">
          <strong>{t(`door.music.kind.${svc.kind}` as 'door.music.kind.SS1')}</strong>
          <span className="muted">{svc.music.length ? svc.music.join(' · ') : t('door.protocol.musicNone')}</span>
        </div>
        <StatusChip tone={tone}>{t('door.protocol.teamSize', { count: String(n), target: String(svc.target) })}</StatusChip>
      </div>
      {svc.team.length === 0 ? (
        <p className="muted">{t('door.protocol.card.empty')}</p>
      ) : (
        <ul className="pt-people">
          {svc.team.map((m) => (
            <li key={m.id} className="pt-person" title={m.name}>
              <span className="pt-avatar" aria-hidden>{initialsOf(m.name)}</span>
              <span className="pt-name">{m.name}</span>
              {m.role !== 'MEMBER' && <span className="pt-tag">{t(`door.protocol.role.${m.role}` as 'door.protocol.role.MEMBER')}</span>}
              {m.slotKind !== 'REGULAR' && <span className="pt-tag">{t(`door.protocol.slot.${m.slotKind}` as 'door.protocol.slot.EXTRA')}</span>}
            </li>
          ))}
        </ul>
      )}
      {onEdit && <button type="button" className="btn secondary sm" onClick={onEdit}>{t('door.sch.edit')}</button>}
    </li>
  );
}

/** Edit one service's team in a side panel, so the month stays in view. */
function TeamEditor({ svc, month, view, act, onClose }: { svc: ProtocolServiceView; month: string; view: ProtocolMonthView; act: Act; onClose: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const free = candidatesFor(view.roster, svc.team);
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${svc.date}T00:00:00Z`));
  const mine = issuesOfService(view.issues, svc.id);
  return (
    <SidePanel open title={t('door.protocol.panel.title', { day })} purpose={t(`door.music.kind.${svc.kind}` as 'door.music.kind.SS1')} onClose={onClose}>
      <div className="pt-edit">
        {mine.length > 0 && (
          <ul className="door-list">
            {mine.map((i) => <li key={i.key} className={i.severity === 'BLOCKING' && !i.overridden ? 'door-error' : 'muted'}>{i.message}</li>)}
          </ul>
        )}
        <ul className="pt-edit-list">
          {svc.team.map((m) => (
            <li key={m.id} className="pt-edit-row">
              <span className="pt-avatar" aria-hidden>{initialsOf(m.name)}</span>
              <span className="pt-edit-name">
                <strong>{m.name}</strong>
                <span className="muted">{t('door.protocol.load', { count: String(m.load) })}</span>
                {m.role === 'MEMBER' && m.recommendedRole && m.recommendedRole !== 'MEMBER' && <span className="pt-tag">{t('door.protocol.recommended', { role: t(`door.protocol.role.${m.recommendedRole}` as 'door.protocol.role.MEMBER') })}</span>}
              </span>
              <SelectField label={t('door.protocol.setRole')} name={`role-${m.id}`} value={m.role} onChange={(e) => act(() => setProtocolRole(month, m.id, e.target.value as ProtocolRole))}>
                {ROLES.map((r) => <option key={r} value={r}>{t(`door.protocol.role.${r}` as 'door.protocol.role.MEMBER')}</option>)}
              </SelectField>
              {free.length > 0 && (
                <SelectField label={t('door.protocol.replaceWith')} name={`rep-${m.id}`} value="" onChange={(e) => e.target.value && act(() => replaceProtocolSlot(month, m.id, e.target.value))}>
                  <option value="">{t('door.gov.meeting.choose')}</option>
                  {free.map((r) => <option key={r.personId} value={r.personId}>{r.name}</option>)}
                </SelectField>
              )}
              <button type="button" className="btn ghost sm" onClick={() => act(() => removeProtocolSlot(month, m.id))}>{t('door.groups.remove')}</button>
            </li>
          ))}
        </ul>
        {free.length > 0 && (
          <SelectField label={t('door.protocol.addPerson')} name={`add-${svc.id}`} value="" onChange={(e) => e.target.value && act(() => addProtocolSlot(month, svc.id, e.target.value))}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {free.map((r) => <option key={r.personId} value={r.personId}>{`${r.name} (${r.load})`}</option>)}
          </SelectField>
        )}
        <button type="button" className="btn" onClick={onClose}>{t('door.protocol.panel.done')}</button>
      </div>
    </SidePanel>
  );
}


/** What Music decided for the month, read-only: the choirs on each service. */
function ChoirSchedule({ view, state, layout }: { view: ProtocolMonthView; state: 'CONFIRMED' | 'PUBLISHED'; layout: ScheduleViewKey }) {
  const t = useT();
  const monthName = useMonthName();
  const day = useShortDay();
  if (!view.music) return <EmptyState title={t('door.sch.waitMusic')} />;
  if (view.music.state !== state || view.services.length === 0) return <EmptyState title={t(`door.sch.emptyChoirs.${state}` as 'door.sch.emptyChoirs.CONFIRMED')} />;
  const pdf = () => downloadSchedulePdf(`choir-schedule-${view.month}`, t('door.sch.pdfTitle', { state: t(`door.sch.tab.${state === 'PUBLISHED' ? 'published' : 'confirmed'}` as 'door.sch.tab.confirmed') }), monthName(view.month), [{
    heading: monthName(view.month), lines: view.services.map((s) => `${day(s.date)} · ${t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1')}: ${s.music.join(', ') || '-'}`),
  }]);
  return (
    <>
      <div className="pt-bar"><span className="muted">v{view.music.version}</span><span className="pt-bar-actions"><button type="button" className="btn secondary" onClick={pdf}>{t('door.sch.pdf')}</button></span></div>
      {layout === 'list' && <ScheduleList rows={view.services.map((s) => ({ id: s.id, date: s.date, title: t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1'), names: s.music.map((n) => ({ name: n })) }))} />}
      {layout === 'bulletin' && <Bulletin title={monthName(view.month)} subtitle={t(`door.sch.tab.${state === 'PUBLISHED' ? 'published' : 'confirmed'}` as 'door.sch.tab.confirmed')} rows={view.services.map((s) => ({ id: s.id, date: s.date, title: t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1'), names: s.music.map((n) => ({ name: n })) }))} />}
      {layout === 'cards' && <ul className="pt-grid">
        {view.services.map((s) => (
          <li key={s.id} className="pt-card">
            <div className="pt-card-head"><DateTile date={s.date} /><div className="pt-card-title"><strong>{t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1')}</strong></div></div>
            {s.music.length === 0 ? <p className="muted">{t('door.protocol.musicNone')}</p> : (
              <ul className="pt-people">{s.music.map((n) => <li key={n} className="pt-person"><span className="pt-avatar" aria-hidden>{n.slice(0, 2).toUpperCase()}</span><span className="pt-name">{n}</span></li>)}</ul>
            )}
          </li>
        ))}
      </ul>}
    </>
  );
}

/** Who can be put on a team this month: serve days, dates away, and what they already carry. */
function Members({ view }: { view: ProtocolMonthView }) {
  const t = useT();
  const { systemId = '' } = useParams();
  const roster = useLoad(fetchProtocolRoster, 'protocol-roster-avail');
  const load = new Map(view.roster.map((r) => [r.personId, r.load]));
  const rows = (roster.data?.members ?? []).filter((m) => m.status !== 'INACTIVE').sort((a, b) => Number(a.status === 'LEAVE') - Number(b.status === 'LEAVE') || a.name.localeCompare(b.name));
  return (
    <LoadState loading={roster.loading} failed={roster.failed} retry={roster.reload}>
      {rows.length === 0 ? <EmptyState title={t('door.protocol.roster.none')} /> : (
        <>
          {roster.data?.canWrite && <div className="pt-bar"><span /><span className="pt-bar-actions"><Link className="btn secondary" to={`/s/${systemId}/roster`}>{t('door.sch.editRoster')}</Link></span></div>}
          <ul className="pt-grid">
            {rows.map((m) => {
              const away = m.unavailableDates.filter((d) => d.startsWith(view.month)).length;
              const off = m.status === 'LEAVE';
              return (
                <li key={m.id} className={`pt-card${off ? ' pt-off' : ''}`}>
                  <div className="pt-person">
                    <span className="pt-avatar" aria-hidden>{initialsOf(m.name)}</span>
                    <span className="pt-edit-name"><strong>{m.name}</strong><span className="muted">{t(`door.protocol.office.${m.office}` as 'door.protocol.office.MEMBER')}</span></span>
                  </div>
                  <div className="pt-chips">
                    <span className="pt-tag">{t(`door.protocol.days.${m.serveDays}` as 'door.protocol.days.BOTH')}</span>
                    {off && <span className="pt-tag">{t('door.protocol.status.LEAVE')}</span>}
                    {away > 0 && <span className="pt-tag">{t('door.sch.away', { count: String(away) })}</span>}
                    <span className="pt-tag">{t('door.protocol.load', { count: String(load.get(m.personId) ?? 0) })}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </LoadState>
  );
}

type PTab = 'choirsConfirmed' | 'choirsPublished' | 'members' | 'draft' | 'confirmed' | 'published';

/** Protocol's month in six places: the choirs Music decided, who is available, and the teams as draft, confirmed, published. */
export function ProtocolTeamsPage() {
  const t = useT();
  const { locale } = useI18n();
  const monthName = useMonthName();
  const day = useShortDay();
  const [layout, setLayout] = useScheduleView();
  const [month, setMonth] = useState(thisMonth());
  const data = useLoad(() => fetchProtocolMonth(month), `protocol-month|${month}`);
  const history = useLoad(() => fetchProtocolHistory(month), `protocol-history|${month}`);
  const [error, setError] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [allowing, setAllowing] = useState<string | null>(null);
  const [relax, setRelax] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ month: string; tab: PTab } | null>(null);
  const act: Act = (job) => {
    setError('');
    job().then(() => { data.reload(); history.reload(); setAllowing(null); }).catch((err: unknown) => setError(t(protocolErrorKey(errorCode(err)) as 'door.people.actionFailed')));
  };
  const v = data.data;
  const blocking = v ? openBlocking(v.issues) : 0;
  const editSvc = v?.services.find((s) => s.id === editing);
  const issues = v ? sortIssues(v.issues) : [];
  const open = issues.filter((i) => i.severity === 'BLOCKING' && !i.overridden);
  const notes = issues.filter((i) => !(i.severity === 'BLOCKING' && !i.overridden));
  const natural: PTab = !v ? 'draft' : v.status === 'PUBLISHED' ? 'published' : v.status === 'REVIEW' ? 'confirmed' : v.status === 'DRAFT' ? 'draft' : v.music ? 'draft' : 'choirsConfirmed';
  const tab: PTab = picked && picked.month === month ? picked.tab : natural;
  const go = (k: PTab) => { setPicked({ month, tab: k }); setEditing(null); };
  const switcher = (
    <div className="pt-month">
      <button type="button" className="btn ghost sm" onClick={() => { setMonth(shiftMonth(month, -1)); setPicked(null); }} aria-label={t('door.music.plan.prev')}>‹</button>
      <strong>{monthName(month)}</strong>
      <button type="button" className="btn ghost sm" onClick={() => { setMonth(shiftMonth(month, 1)); setPicked(null); }} aria-label={t('door.music.plan.next')}>›</button>
    </div>
  );
  const pdf = (state: 'draft' | 'confirmed' | 'published') => {
    if (!v) return;
    downloadSchedulePdf(`teams-${state}-${month}`, t('door.sch.pdfTitleTeams', { state: t(`door.sch.p.${state}` as 'door.sch.p.draft') }), monthName(month), v.services.map((s) => ({
      heading: `${day(s.date)} · ${t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1')}${s.music.length ? ` (${s.music.join(', ')})` : ''}`,
      lines: s.team.length ? s.team.map((m) => `${m.name}${m.role !== 'MEMBER' ? ` - ${t(`door.protocol.role.${m.role}` as 'door.protocol.role.MEMBER')}` : ''}${m.slotKind !== 'REGULAR' ? ` (${t(`door.protocol.slot.${m.slotKind}` as 'door.protocol.slot.EXTRA')})` : ''}`) : ['-'],
    })));
  };
  const teamRows = (edit: boolean): ScheduleRow[] => (v?.services ?? []).map((s) => ({
    id: s.id, date: s.date, title: t(`door.music.kind.${s.kind}` as 'door.music.kind.SS1'), note: s.music.join(', ') || undefined,
    names: s.team.map((m) => ({ name: m.name, tag: m.role !== 'MEMBER' ? t(`door.protocol.role.${m.role}` as 'door.protocol.role.MEMBER') : undefined })),
    chip: <StatusChip tone={regular(s) >= s.target ? 'success' : 'warn'}>{t('door.protocol.teamSize', { count: String(regular(s)), target: String(s.target) })}</StatusChip>,
    onEdit: edit ? () => setEditing(s.id) : undefined,
  }));
  const grid = (edit: boolean) => v && (layout === 'list' ? <ScheduleList rows={teamRows(edit)} /> : layout === 'bulletin' ? <Bulletin title={monthName(month)} subtitle={t('door.own.teams')} rows={teamRows(false)} /> : (
    <ul className="pt-grid">
      {v.services.map((s) => <ServiceCard key={s.id} svc={s} view={v} onEdit={edit ? () => setEditing(s.id) : undefined} />)}
    </ul>
  ));
  const stale = v && v.stale.length > 0 && (
    <div className="pt-next pt-warn" role="status">
      <div className="pt-next-text"><strong>{t('door.protocol.stale.title')}</strong><span className="muted">{t('door.protocol.stale.body', { count: String(v.stale.length) })}</span></div>
      {(v.can.edit || v.can.reopen) && <div className="pt-next-actions"><button type="button" className="btn" onClick={() => act(() => acknowledgeProtocolMusic(month))}>{t('door.protocol.stale.ack')}</button></div>}
    </div>
  );
  const returnBtn = v && (v.can.reopen || v.can.review) && <button type="button" className="btn ghost" onClick={() => act(() => returnProtocolMonth(month))}>{t('door.sch.backToDraft')}</button>;
  const tabs = [
    { key: 'choirsConfirmed' as const, label: t('door.sch.p.choirsConfirmed') },
    { key: 'choirsPublished' as const, label: t('door.sch.p.choirsPublished') },
    { key: 'members' as const, label: t('door.sch.p.members') },
    { key: 'draft' as const, label: t('door.sch.p.draft') },
    { key: 'confirmed' as const, label: t('door.sch.p.confirmed') },
    { key: 'published' as const, label: t('door.sch.p.published') },
  ];
  let body: ReactNode = null;
  if (v) {
    if (tab === 'choirsConfirmed') body = <ChoirSchedule view={v} state="CONFIRMED" layout={layout} />;
    else if (tab === 'choirsPublished') body = <ChoirSchedule view={v} state="PUBLISHED" layout={layout} />;
    else if (tab === 'members') body = <Members view={v} />;
    else if (tab === 'draft') {
      if (v.status === 'OPEN') {
        body = (
          <EmptyState
            title={t(v.music ? 'door.sch.emptyTeams.draft' : 'door.sch.waitMusic')}
            action={v.can.build ? <button type="button" className="btn" onClick={() => act(() => generateProtocolTeams(month))}>{t('door.sch.buildTeams')}</button> : undefined}
          />
        );
      } else if (v.status === 'DRAFT') {
        body = (
          <>
            {stale}
            <div className="pt-bar">
              <span>{blocking > 0 ? <StatusChip tone="danger">{t('door.sch.problems', { count: String(blocking) })}</StatusChip> : <StatusChip tone="success">{t('door.sch.noProblems')}</StatusChip>}</span>
              <span className="pt-bar-actions">
                {v.can.build && <button type="button" className="btn ghost" onClick={() => act(() => generateProtocolTeams(month))}>{t('door.sch.rebuildTeams')}</button>}
                <button type="button" className="btn secondary" onClick={() => pdf('draft')}>{t('door.sch.pdf')}</button>
                {v.can.edit && <button type="button" className="btn" disabled={blocking > 0} onClick={() => act(() => submitProtocolMonth(month))}>{t('door.sch.confirmTeams')}</button>}
              </span>
            </div>
            {open.length > 0 && (
              <div className="panel pt-problems" id="pt-problems">
                <ul className="door-list">
                  {open.map((i) => (
                    <li key={i.key} className="pt-issue">
                      <span className="door-error">{i.message}</span>
                      {v.can.edit && i.canOverride && (allowing === i.key ? (
                        <span className="pt-allow">
                          <TextField label={t('door.protocol.reason')} name={`ov-${i.key}`} value={reasons[i.key] ?? ''} onChange={(e) => setReasons({ ...reasons, [i.key]: e.target.value })} />
                          <button type="button" className="btn sm" onClick={() => act(() => overrideProtocolIssue(month, i.key, reasons[i.key] ?? ''))}>{t('door.protocol.allow')}</button>
                          <button type="button" className="btn ghost sm" onClick={() => setAllowing(null)}>{t('kit.cancel')}</button>
                        </span>
                      ) : (
                        <button type="button" className="btn ghost sm" onClick={() => setAllowing(i.key)}>{t('door.protocol.allowAsIs')}</button>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {grid(v.can.edit)}
            {(notes.length > 0 || v.can.edit) && (
              <details className="panel pt-more">
                <summary>{t('door.protocol.more')}</summary>
                {notes.length > 0 && <ul className="door-list">{notes.map((i) => <li key={i.key} className="muted">{i.overridden ? `${t('door.protocol.issue.allowed')} · ` : ''}{i.message}</li>)}</ul>}
                {v.can.edit && v.services.some((s) => s.team.some((m) => m.recommendedRole && m.recommendedRole !== 'MEMBER' && m.role === 'MEMBER')) && (
                  <button type="button" className="btn secondary sm" onClick={() => act(() => approveProtocolRoles(month))}>{t('door.protocol.approveRoles')}</button>
                )}
                {v.can.edit && (
                  <div className="pt-relax">
                    <h4>{t('door.protocol.relax.title')}</h4>
                    {v.relax.tuesday ? (
                      <div className="door-row">
                        <span>{t('door.protocol.relax.on', { reason: v.relax.reason ?? '' })}</span>
                        <button type="button" className="btn ghost sm" onClick={() => act(() => relaxProtocolTuesday(month, false))}>{t('door.protocol.relax.off')}</button>
                      </div>
                    ) : (
                      <div className="door-row">
                        <TextField label={t('door.protocol.reason')} name="relax-reason" value={relax} onChange={(e) => setRelax(e.target.value)} />
                        <button type="button" className="btn ghost sm" onClick={() => act(() => relaxProtocolTuesday(month, true, relax))}>{t('door.protocol.relax.apply')}</button>
                      </div>
                    )}
                  </div>
                )}
              </details>
            )}
          </>
        );
      } else body = <EmptyState title={t('door.sch.emptyTeams.draft')} />;
    } else if (tab === 'confirmed') {
      body = v.status !== 'REVIEW' ? <EmptyState title={t('door.sch.emptyTeams.confirmed')} /> : (
        <>
          {stale}
          <div className="pt-bar">
            <span className="muted">{!v.can.review ? t('door.sch.waitPresident') : ''}</span>
            <span className="pt-bar-actions">
              {returnBtn}
              <button type="button" className="btn secondary" onClick={() => pdf('confirmed')}>{t('door.sch.pdf')}</button>
              {v.can.review && <button type="button" className="btn" onClick={() => act(() => publishProtocolMonth(month))}>{t('door.sch.publishTeams')}</button>}
            </span>
          </div>
          {grid(false)}
        </>
      );
    } else {
      body = v.status !== 'PUBLISHED' ? <EmptyState title={t('door.sch.emptyTeams.published')} /> : (
        <>
          <div className="pt-bar">
            <span className="muted">v{v.version}</span>
            <span className="pt-bar-actions">
              {returnBtn}
              <button type="button" className="btn secondary" onClick={() => pdf('published')}>{t('door.sch.pdf')}</button>
            </span>
          </div>
          {grid(false)}
          {history.data && history.data.versions.length > 0 && (
            <details className="panel pt-more">
              <summary>{t('door.protocol.history')}</summary>
              <ul className="door-list">
                {history.data.versions.map((h) => <li key={h.version} className="muted">{t('door.protocol.historyRow', { version: String(h.version), by: h.by, date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(h.publishedAt)), slots: String(h.slots) })}</li>)}
              </ul>
            </details>
          )}
        </>
      );
    }
  }
  return (
    <section className="door-block pt-page" aria-labelledby="door-teams-title">
      <PageHeader id="door-teams-title" title={t('door.own.teams')} meta={switcher} actions={<ViewSwitch value={layout} onChange={setLayout} />} />
      {error && <p className="door-error" role="alert">{error}</p>}
      <Tabs items={tabs} value={tab} onChange={go} label={t('door.own.teams')} />
      <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>{body}</LoadState>
      {v && editSvc && <TeamEditor svc={editSvc} month={month} view={v} act={act} onClose={() => setEditing(null)} />}
    </section>
  );
}
