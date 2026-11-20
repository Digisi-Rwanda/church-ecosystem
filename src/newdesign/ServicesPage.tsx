import { useState, type FormEvent } from 'react';
import {
  addServiceEditor, addServiceEntry, addServiceRole, changeServiceEntry, changeServiceRole, fetchServiceDetail, fetchServiceList,
  fetchServicePrepState, removeServiceEditor,
  type DirectoryPerson, type ServiceDetail, type ServiceListItem, type ServicePrepState, type ServicePulpitEntryItem, type ServicePulpitRole,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { RunSheetPanel } from './RunSheetPanel';
import { ServiceBulletin } from './ServiceBulletin';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

/** The server's error codes, in words a church leader reads. */
export const servicesErrorKey = (code: string | null | undefined) => {
  switch (code) {
    case 'ALREADY_EXISTS': return 'door.svc.err.exists';
    case 'WHO': return 'door.svc.err.who';
    case 'FORBIDDEN': return 'door.svc.err.forbidden';
    case 'LAST_ROLE': return 'door.svc.err.lastRole';
    default: return 'door.svc.err.generic';
  }
};

type Msg = 'door.svc.title';

function useFmt() {
  const { locale } = useI18n();
  return (iso: string, style: 'full' | 'medium' = 'full') => new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

/** One pulpit role of one service: who is planned, and the small form to plan or change it. */
function RoleRow({ role, entry, date, code, canWrite, onChange }: {
  role: ServicePulpitRole; entry: ServicePulpitEntryItem | undefined; date: string; code: string; canWrite: boolean; onChange: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState<{ id: string; name: string } | null>(null);
  const [visitor, setVisitor] = useState('');
  const [theme, setTheme] = useState(entry?.theme ?? '');
  const [text, setText] = useState(entry?.bibleText ?? '');
  const [error, setError] = useState('');
  const fail = (err: unknown) => setError(t(servicesErrorKey(errorCode(err)) as Msg));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const who = member ? { personId: member.id, guestName: null } : visitor.trim() ? { personId: null, guestName: visitor.trim() } : null;
    if (!who && !entry) return setError(t('door.svc.err.who'));
    try {
      if (entry) await changeServiceEntry(entry.id, { ...(who ?? {}), theme: theme.trim() || null, bibleText: text.trim() || null });
      else await addServiceEntry({ serviceDate: date, serviceCode: code, roleId: role.id, ...(who as object), theme: theme.trim() || null, bibleText: text.trim() || null });
      setOpen(false); setMember(null); setVisitor('');
      onChange();
    } catch (err) { fail(err); }
  };
  const mark = async (status: 'DONE' | 'CANCELLED') => {
    if (!entry) return;
    setError('');
    try { await changeServiceEntry(entry.id, { status }); onChange(); } catch (err) { fail(err); }
  };
  const live = entry && entry.status !== 'CANCELLED';
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row">
          <strong>{role.name}</strong>
          {entry && entry.status !== 'PLANNED' && <span className={`door-chip${entry.status === 'CANCELLED' ? ' warn' : ''}`}>{t(`door.svc.status.${entry.status}` as 'door.svc.status.DONE')}</span>}
        </div>
        <p>{live ? entry.name : t('door.svc.notSet')}</p>
        {live && <p className="muted">{[entry.theme, entry.bibleText].filter(Boolean).join(' · ')}</p>}
        {error && <p className="door-error" role="alert">{error}</p>}
        {canWrite && !open && (
          <div className="door-row">
            <button type="button" className="btn ghost" onClick={() => setOpen(true)}>{live ? t('door.svc.change') : t('door.svc.set')}</button>
            {live && entry.status === 'PLANNED' && <button type="button" className="btn ghost" onClick={() => void mark('DONE')}>{t('door.svc.markDone')}</button>}
            {live && <button type="button" className="btn ghost" onClick={() => void mark('CANCELLED')}>{t('door.svc.cancelEntry')}</button>}
          </div>
        )}
        {canWrite && open && (
          <form className="door-form" onSubmit={save} noValidate>
            <PersonPicker label={t('door.svc.pickMember')} name={`r-m-${role.id}`} onPick={(p: DirectoryPerson) => { setMember({ id: p.id, name: p.fullName }); setVisitor(''); }} />
            {member && <p className="muted">{t('door.svc.chosen', { name: member.name })}</p>}
            <TextField label={t('door.svc.visitor')} name={`r-v-${role.id}`} value={visitor} maxLength={80} hint={t('door.svc.visitorHint')} onChange={(e) => { setVisitor(e.target.value); setMember(null); }} />
            <TextField label={t('door.svc.theme')} name={`r-t-${role.id}`} value={theme} maxLength={120} onChange={(e) => setTheme(e.target.value)} />
            <TextField label={t('door.svc.text')} name={`r-b-${role.id}`} value={text} maxLength={120} onChange={(e) => setText(e.target.value)} />
            <div className="door-row">
              <button type="submit" className="btn">{t('door.svc.save')}</button>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('door.svc.cancel')}</button>
            </div>
          </form>
        )}
      </div>
    </li>
  );
}

function ServiceView({ date, code, onBack, onBulletin }: { date: string; code: string; onBack: () => void; onBulletin: () => void }) {
  const t = useT();
  const fmt = useFmt();
  const load = useLoad<ServiceDetail>(() => fetchServiceDetail(date, code), `svc-${date}-${code}`);
  const d = load.data;
  const roles = (d?.pulpit.roles ?? []).filter((r) => r.active);
  return (
    <section className="door-block" aria-labelledby="door-svc-title">
      <div className="door-row">
        <button type="button" className="btn ghost" onClick={onBack}>{t('door.svc.back')}</button>
        <button type="button" className="btn ghost" onClick={onBulletin}>{t('door.svc.bulletin')}</button>
      </div>
      <PageHeader id="door-svc-title" title={d ? `${d.service.label} · ${fmt(date)}` : fmt(date)} />
      <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
        {d && (
          <>
            <h3>{t('door.svc.pulpit')}</h3>
            <ul className="door-notices">
              {roles.map((r) => (
                <RoleRow key={`${r.id}-${d.pulpit.entries.find((e) => e.roleId === r.id && e.status !== 'CANCELLED')?.id ?? ''}`} role={r}
                  entry={d.pulpit.entries.find((e) => e.roleId === r.id && e.status !== 'CANCELLED') ?? d.pulpit.entries.find((e) => e.roleId === r.id)}
                  date={date} code={code} canWrite={d.canWrite} onChange={load.reload} />
              ))}
            </ul>
            <div className="panel">
              <h3>{t('door.svc.choir')}</h3>
              {!d.choir.required ? <p className="muted">{t('door.svc.notNeeded')}</p>
                : d.choir.state !== 'PUBLISHED' ? <p className="muted">{t('door.svc.choirNotShown')}</p>
                : d.choir.choirs.length === 0 ? <p className="muted">{t('door.svc.noChoirs')}</p>
                : <ul className="door-list">{d.choir.choirs.map((c) => <li key={c.id}>{c.name}</li>)}</ul>}
            </div>
            <div className="panel">
              <h3>{t('door.svc.protocol')}</h3>
              {!d.protocol.required ? <p className="muted">{t('door.svc.notNeeded')}</p>
                : d.protocol.state !== 'PUBLISHED' ? <p className="muted">{t('door.svc.protocolNotShown')}</p>
                : d.protocol.team.length === 0 ? <p className="muted">{t('door.svc.noTeam')}</p>
                : <ul className="door-list">{d.protocol.team.map((p) => <li key={`${p.personId}-${p.role}`}>{p.name}{p.role ? ` · ${p.role}` : ''}</li>)}</ul>}
            </div>
            <RunSheetPanel date={date} code={code} />
          </>
        )}
      </LoadState>
    </section>
  );
}

function ManagePanel({ state, onChange }: { state: ServicePrepState; onChange: () => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const run = async (job: () => Promise<void>) => {
    setError('');
    try { await job(); onChange(); } catch (err) { setError(t(servicesErrorKey(errorCode(err)) as Msg)); }
  };
  return (
    <details className="panel">
      <summary><strong>{t('door.svc.manage')}</strong></summary>
      <h3>{t('door.svc.roles')}</h3>
      <p className="muted">{t('door.svc.rolesHint')}</p>
      <ul className="door-list">
        {state.roles.map((r) => (
          <li key={r.id} className="door-row">
            <span>{r.name}</span>
            <button type="button" className="btn ghost" onClick={() => void run(() => changeServiceRole(r.id, { active: !r.active }))}>{r.active ? t('door.svc.roleHide') : t('door.svc.roleShow')}</button>
          </li>
        ))}
      </ul>
      <form className="door-form" noValidate onSubmit={(e) => { e.preventDefault(); if (name.trim()) void run(async () => { await addServiceRole(name.trim()); setName(''); }); }}>
        <TextField label={t('door.svc.roleName')} name="svc-role" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn">{t('door.svc.roleAdd')}</button>
      </form>
      {state.isLeader && (
        <>
          <h3>{t('door.svc.editors')}</h3>
          <p className="muted">{t('door.svc.editorsHint')}</p>
          {state.editors.length === 0 ? <p className="muted">{t('door.svc.editorNone')}</p> : (
            <ul className="door-list">
              {state.editors.map((e) => (
                <li key={e.personId} className="door-row">
                  <span>{e.name}</span>
                  <button type="button" className="btn ghost" onClick={() => void run(() => removeServiceEditor(e.personId))}>{t('door.svc.editorRemove')}</button>
                </li>
              ))}
            </ul>
          )}
          <PersonPicker label={t('door.svc.editorAdd')} name="svc-editor" onPick={(p: DirectoryPerson) => void run(() => addServiceEditor(p.id))} />
        </>
      )}
      {error && <p className="door-error" role="alert">{error}</p>}
    </details>
  );
}

function ServiceCard({ s, onOpen, onBulletin }: { s: ServiceListItem; onOpen: () => void; onBulletin: () => void }) {
  const t = useT();
  const choirKey = `door.svc.choir.${s.choir.state === 'PUBLISHED' ? 'PUBLISHED' : s.choir.state === 'CONFIRMED' ? 'CONFIRMED' : 'NONE'}` as 'door.svc.choir.NONE';
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row">
          <strong>{s.label}</strong>
          {s.time && <span className="muted">{t('door.svc.time', { time: s.time })}</span>}
        </div>
        <p>{t('door.svc.pulpitCount', { filled: String(s.pulpit.filled), total: String(s.pulpit.roles) })}</p>
        {s.choir.required && <p className="muted">{t(choirKey, { count: String(s.choir.count ?? 0) })}</p>}
        {s.protocol.required && <p className="muted">{t(`door.svc.protocol.${s.protocol.state}` as 'door.svc.protocol.NONE', { count: String(s.protocol.count ?? 0) })}</p>}
        <div className="door-row">
          <button type="button" className="btn ghost" onClick={onOpen}>{s.pulpit.filled ? t('door.svc.change') : t('door.svc.set')}</button>
          <button type="button" className="btn ghost" onClick={onBulletin}>{t('door.svc.bulletin')}</button>
        </div>
      </div>
    </li>
  );
}

/** Service preparation: the pulpit of each coming service, with the choir and the Protocol team beside it. */
export function ServicesPage() {
  const t = useT();
  const fmt = useFmt();
  const [open, setOpen] = useState<{ date: string; code: string; bulletin?: boolean } | null>(null);
  const state = useLoad<ServicePrepState>(() => fetchServicePrepState(), 'svc-state');
  const list = useLoad(() => fetchServiceList(), 'svc-list');
  if (open?.bulletin) return <ServiceBulletin date={open.date} code={open.code} onBack={() => setOpen({ date: open.date, code: open.code })} />;
  if (open) return <ServiceView date={open.date} code={open.code} onBack={() => { setOpen(null); list.reload(); }} onBulletin={() => setOpen({ ...open, bulletin: true })} />;
  const byDate = new Map<string, ServiceListItem[]>();
  for (const s of list.data?.services ?? []) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  return (
    <section className="door-block" aria-labelledby="door-svc-title">
      <PageHeader id="door-svc-title" title={t('door.svc.title')} />
      {state.data?.canWrite && <ManagePanel state={state.data} onChange={() => { state.reload(); list.reload(); }} />}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {list.data && list.data.services.length === 0 ? (
          <EmptyState title={t('door.svc.none')} detail={t('door.svc.noneDetail')} />
        ) : (
          [...byDate.entries()].map(([day, items]) => (
            <div key={day}>
              <h3>{fmt(day)}</h3>
              <ul className="door-notices">{items.map((s) => <ServiceCard key={`${s.date}-${s.code}`} s={s} onOpen={() => setOpen({ date: s.date, code: s.code })} onBulletin={() => setOpen({ date: s.date, code: s.code, bulletin: true })} />)}</ul>
            </div>
          ))
        )}
      </LoadState>
    </section>
  );
}
