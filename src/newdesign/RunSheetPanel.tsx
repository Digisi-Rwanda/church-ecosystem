import { useState } from 'react';
import {
  applyRunTemplate, fetchRunSheet, saveRunSheet, saveRunTemplate,
  type DirectoryPerson, type RunItemInput, type RunOwnerKind, type RunSheetView,
} from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { closeGaps, endOf, nextStart, runFlags, validTime } from './runSheetLogic';
import { useLoad } from './useLoad';

const KINDS: RunOwnerKind[] = ['PULPIT', 'PERSON', 'CHOIR', 'PROTOCOL', 'TEXT'];

type Draft = {
  key: string; title: string; startTime: string; minutes: string; ownerKind: RunOwnerKind;
  personId: string | null; personName: string; roleId: string; choirId: string; ownerLabel: string; note: string;
};

let seq = 0;
const blank = (startTime: string): Draft => ({ key: `n${++seq}`, title: '', startTime, minutes: '10', ownerKind: 'TEXT', personId: null, personName: '', roleId: '', choirId: '', ownerLabel: '', note: '' });
const mins = (d: Draft) => Math.max(1, Math.min(600, Math.round(Number(d.minutes)) || 0));

/** What the server needs for one line. */
function toInput(d: Draft): RunItemInput {
  return {
    title: d.title.trim(), startTime: d.startTime, minutes: mins(d), ownerKind: d.ownerKind,
    personId: d.ownerKind === 'PERSON' ? d.personId : null, roleId: d.ownerKind === 'PULPIT' ? d.roleId || null : null,
    choirId: d.ownerKind === 'CHOIR' ? d.choirId || null : null, ownerLabel: d.ownerKind === 'TEXT' ? d.ownerLabel.trim() : null, note: d.note.trim() || null,
  };
}

function Editor({ data, date, code, onSaved }: { data: RunSheetView; date: string; code: string; onSaved: () => void }) {
  const t = useT();
  const k = (s: string) => t(s as 'door.svc.run.title');
  const [items, setItems] = useState<Draft[]>(() => data.items.map((i) => ({
    key: i.id, title: i.title, startTime: i.startTime, minutes: String(i.minutes), ownerKind: i.ownerKind, personId: i.personId, personName: i.personName,
    roleId: i.roleId ?? '', choirId: i.choirId ?? '', ownerLabel: i.ownerLabel, note: i.note,
  })));
  const [endTime, setEndTime] = useState(data.endTime ?? '');
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const edit = (next: Draft[]) => { setItems(next); setDirty(true); setMessage(null); };
  const patch = (i: number, p: Partial<Draft>) => edit(items.map((d, n) => (n === i ? { ...d, ...p } : d)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    edit(next);
  };
  const timed = items.map((d) => ({ startTime: d.startTime, minutes: mins(d) }));
  const flags = runFlags(timed, endTime);

  const problem = (): string | null => {
    for (const d of items) {
      if (!d.title.trim() || !validTime(d.startTime)) return k('door.svc.run.err.title');
      if ((d.ownerKind === 'PERSON' && !d.personId) || (d.ownerKind === 'PULPIT' && !d.roleId) || (d.ownerKind === 'TEXT' && !d.ownerLabel.trim())) return k('door.svc.run.err.owner');
    }
    return null;
  };
  const say = (ok: boolean, text: string) => setMessage({ ok, text });
  const save = async () => {
    const p = problem();
    if (p) return say(false, p);
    try {
      await saveRunSheet(date, code, { endTime: validTime(endTime) ? endTime : null, items: items.map(toInput) });
      setDirty(false);
      say(true, k('door.svc.run.saved'));
      onSaved();
    } catch (err) {
      say(false, errorCode(err) === 'OWNER' ? k('door.svc.run.err.owner') : k('door.svc.run.err.generic'));
    }
  };
  const fromTemplate = async () => {
    if (items.length > 0 && !window.confirm(k('door.svc.run.fromTemplateAsk'))) return;
    try {
      await applyRunTemplate(date, code);
      setDirty(false);
      onSaved();
    } catch (err) {
      const c = errorCode(err);
      say(false, c === 'NO_START' ? k('door.svc.run.err.noStart') : c === 'NO_TEMPLATE' ? k('door.svc.run.err.noTemplate') : k('door.svc.run.err.generic'));
    }
  };
  const asTemplate = async () => {
    const p = problem();
    if (p) return say(false, p);
    try {
      await saveRunTemplate(code, items.map((d) => {
        const { personId: _p, startTime: _s, ...rest } = toInput(d);
        // A template names roles and groups, not people: a member becomes a typed name.
        return d.ownerKind === 'PERSON' ? { ...rest, ownerKind: 'TEXT' as const, ownerLabel: d.personName } : rest;
      }));
      say(true, k('door.svc.run.templateSaved'));
      onSaved();
    } catch {
      say(false, k('door.svc.run.err.generic'));
    }
  };

  if (!data.canWrite) {
    return (
      <div className="panel run-sheet">
        <h3>{k('door.svc.run.title')}</h3>
        {data.items.length === 0 ? <p className="muted">{k('door.svc.run.empty')}</p> : (
          <ol className="run-list">
            {data.items.map((i, n) => (
              <li key={i.id} className={`run-line${data.warnings.some((w) => w.index === n) ? ' warn' : ''}`}>
                <span className="run-time">{i.startTime}–{i.endTime}</span>
                <span className="run-title">{i.title}</span>
                <span className="run-owner muted">{i.ownerKind === 'PROTOCOL' ? k('door.svc.run.protocolTeam') : i.ownerName || k('door.svc.run.tbd')}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  return (
    <div className="panel run-sheet">
      <h3>{k('door.svc.run.title')}</h3>
      <p className="muted">{k('door.svc.run.intro')}</p>
      <div className="door-row run-tools">
        <TextField label={k('door.svc.run.plannedEnd')} name="run-end" type="time" value={endTime} onChange={(e) => { setEndTime(e.target.value); setDirty(true); }} />
        {data.hasTemplate && <button type="button" className="btn ghost" onClick={() => void fromTemplate()}>{k('door.svc.run.fromTemplate')}</button>}
        {items.length > 1 && <button type="button" className="btn ghost" onClick={() => { const laid = closeGaps(timed); edit(items.map((d, n) => ({ ...d, startTime: laid[n]?.startTime ?? d.startTime }))); }}>{k('door.svc.run.closeGaps')}</button>}
      </div>
      {items.length === 0 && <p className="muted">{k('door.svc.run.empty')}</p>}
      <ol className="run-edit">
        {items.map((d, i) => (
          <li key={d.key} className={`run-card${flags[i]?.length ? ' warn' : ''}`}>
            <div className="run-card-top">
              <TextField label={k('door.svc.run.start')} name={`run-s-${d.key}`} type="time" value={d.startTime} onChange={(e) => patch(i, { startTime: e.target.value })} />
              <TextField label={k('door.svc.run.minutes')} name={`run-m-${d.key}`} type="number" inputMode="numeric" min={1} max={600} value={d.minutes} onChange={(e) => patch(i, { minutes: e.target.value })} />
              <p className="run-end muted">{k('door.svc.run.ends').replace('{time}', endOf({ startTime: d.startTime, minutes: mins(d) }) || '–')}</p>
            </div>
            <TextField label={k('door.svc.run.activity')} name={`run-t-${d.key}`} value={d.title} maxLength={120} onChange={(e) => patch(i, { title: e.target.value })} />
            <div className="run-owner-row">
              <SelectField label={k('door.svc.run.owner')} name={`run-k-${d.key}`} value={d.ownerKind} onChange={(e) => patch(i, { ownerKind: e.target.value as RunOwnerKind })}>
                {KINDS.map((x) => <option key={x} value={x}>{k(`door.svc.run.kind.${x}`)}</option>)}
              </SelectField>
              {d.ownerKind === 'PULPIT' && (
                <SelectField label={k('door.svc.run.pickRole')} name={`run-r-${d.key}`} value={d.roleId} onChange={(e) => patch(i, { roleId: e.target.value })}>
                  <option value="">{k('door.svc.run.pickRole')}</option>
                  {data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </SelectField>
              )}
              {d.ownerKind === 'CHOIR' && (
                <SelectField label={k('door.svc.run.pickChoir')} name={`run-c-${d.key}`} value={d.choirId} onChange={(e) => patch(i, { choirId: e.target.value })}>
                  <option value="">{k('door.svc.run.anyChoir')}</option>
                  {data.choirs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField>
              )}
              {d.ownerKind === 'TEXT' && <TextField label={k('door.svc.run.label')} name={`run-l-${d.key}`} value={d.ownerLabel} maxLength={80} onChange={(e) => patch(i, { ownerLabel: e.target.value })} />}
              {d.ownerKind === 'PERSON' && (
                <div>
                  {d.personName && <p className="muted">{d.personName}</p>}
                  <PersonPicker label={k('door.svc.run.pickPerson')} name={`run-p-${d.key}`} onPick={(p: DirectoryPerson) => patch(i, { personId: p.id, personName: p.fullName })} />
                </div>
              )}
            </div>
            <TextField label={k('door.svc.run.note')} name={`run-n-${d.key}`} value={d.note} maxLength={200} onChange={(e) => patch(i, { note: e.target.value })} />
            {flags[i]?.map((f) => <p key={f} className="run-flag" role="status">{k(`door.svc.run.flag.${f}`)}</p>)}
            <div className="door-row">
              <button type="button" className="btn ghost" onClick={() => move(i, -1)} disabled={i === 0}>{k('door.svc.run.up')}</button>
              <button type="button" className="btn ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1}>{k('door.svc.run.down')}</button>
              <button type="button" className="btn ghost" onClick={() => edit(items.filter((_, n) => n !== i))}>{k('door.svc.run.remove')}</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="door-row">
        <button type="button" className="btn ghost" onClick={() => edit([...items, blank(nextStart(timed, data.startTime))])}>{k('door.svc.run.add')}</button>
        <button type="button" className="btn" onClick={() => void save()}>{k('door.svc.run.save')}</button>
        {items.length > 0 && <button type="button" className="btn ghost" onClick={() => void asTemplate()}>{k('door.svc.run.saveTemplate')}</button>}
      </div>
      {dirty && !message && <p className="muted">{k('door.svc.run.unsaved')}</p>}
      {message && <p className={message.ok ? 'run-ok' : 'door-error'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </div>
  );
}

/** The programme of one service: activities with times and who is in charge. */
export function RunSheetPanel({ date, code }: { date: string; code: string }) {
  const [version, setVersion] = useState(0);
  const load = useLoad<RunSheetView>(() => fetchRunSheet(date, code), `run-${date}-${code}`);
  return (
    <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
      {load.data && <Editor key={`${version}-${load.data.items.map((i) => i.id).join(',')}`} data={load.data} date={date} code={code} onSaved={() => { setVersion((v) => v + 1); load.reload(); }} />}
    </LoadState>
  );
}
