import { useState, type FormEvent } from 'react';
import {
  fetchAccessOf,
  fetchAuditTrail,
  fetchDelegations,
  fetchMyAccess,
  fetchPeople,
  fetchRuleMatrix,
  lendLetters,
  revokeDelegation,
  type AccessExplanation,
  type DelegationRow,
  type DirectoryPerson,
} from '../api/frontDoorApi';
import { ApiError } from '../api/client';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { MODULE_KEYS } from '../../server/src/shared/accessMatrix';
import type { AccessLetter, ModuleKey, OfficeCode } from '../../server/src/shared/vocabulary';
import { accessErrorKey, lettersText } from './access';
import { useFrontDoor } from './FrontDoorContext';
import { LoadState } from './LoadState';
import { isAdministrator } from './menu';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

type Tab = 'mine' | 'rules' | 'delegation' | 'audit';
const bodyCode = (e: unknown): string | undefined =>
  e instanceof ApiError ? (e.body as { code?: string } | undefined)?.code : undefined;

/** Access explained: what I hold and why, the rules for every office, lending letters, and the audit trail. */
export function AccessPage() {
  const t = useT();
  const { capabilities } = useFrontDoor();
  if (!isAdministrator(capabilities)) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} detail={t('door.access.adminOnly')} />;
  return <AccessBody />;
}

function AccessBody() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('mine');
  const me = useLoad(fetchMyAccess, 'access|me');
  const canAudit = !!me.data?.powers.canReadAudit;
  const tabs: Tab[] = ['mine', 'rules', 'delegation', ...(canAudit ? (['audit'] as Tab[]) : [])];
  return (
    <div className="door-block">
      <PageHeader title={t('door.access.title')} purpose={t('door.purpose.access')} />
      <p className="muted">{t('door.access.intro')}</p>
      <nav className="door-menu" aria-label={t('door.access.tabs')}>
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            className={`door-menu-link${tab === k ? ' active' : ''}`}
            aria-current={tab === k ? 'page' : undefined}
            onClick={() => setTab(k)}
          >
            {t(`door.access.tab.${k}` as const)}
          </button>
        ))}
      </nav>
      {tab === 'mine' && (
        <LoadState loading={me.loading} failed={me.failed} retry={me.reload}>
          {me.data && <Explanation data={me.data} canLookUp={me.data.powers.canExplainOthers} />}
        </LoadState>
      )}
      {tab === 'rules' && <RulesPanel />}
      {tab === 'delegation' && <DelegationPanel />}
      {tab === 'audit' && canAudit && <AuditPanel />}
    </div>
  );
}

function LetterChips({ letters }: { letters: readonly AccessLetter[] }) {
  const t = useT();
  if (letters.length === 0) return <span className="muted">—</span>;
  return (
    <span className="door-letters">
      {letters.map((l) => (
        <span key={l} className="door-chip" title={`${t(`door.letter.${l}.name` as const)}: ${t(`door.letter.${l}.meaning` as const)}`}>
          {l}
        </span>
      ))}
    </span>
  );
}

function Explanation({ data, canLookUp }: { data: AccessExplanation; canLookUp: boolean }) {
  const t = useT();
  const [other, setOther] = useState<AccessExplanation | null>(null);
  const shown = other ?? data;
  return (
    <>
      {canLookUp && <LookUp onFound={setOther} onClear={() => setOther(null)} active={!!other} />}
      <div className="panel">
        <h3>{other ? t('door.access.mine.whoElse', { name: shown.person.name }) : t('door.access.mine.offices')}</h3>
        {shown.offices.length === 0 && shown.delegated.length === 0 ? (
          <p className="muted">{t('door.access.mine.noOffice')}</p>
        ) : (
          <ul className="door-list">
            {shown.offices.map((o) => (
              <li key={o.id}>
                <strong>{t(`door.office.${o.office}` as const)}</strong>
                {o.endDate && <span className="muted"> · {t('door.access.termEnds', { date: o.endDate })}</span>}
              </li>
            ))}
            {shown.delegated.map((d) => (
              <li key={d.delegationId}>
                <strong>{t(`door.office.${d.office}` as const)}</strong> <span className="door-chip">{t('door.access.delegated')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {shown.systems.length === 0 ? (
        <p className="muted">{t('door.access.mine.noSystems')}</p>
      ) : (
        shown.systems.map((s) => (
          <div className="panel" key={s.id}>
            <h3>{s.name}</h3>
            <div className="door-table-wrap">
              <table className="door-table door-stack">
                <thead>
                  <tr>
                    <th>{t('door.access.col.module')}</th>
                    <th>{t('door.access.col.letters')}</th>
                    <th>{t('door.access.col.why')}</th>
                  </tr>
                </thead>
                <tbody>
                  {MODULE_KEYS.filter((k) => s.letters[k].length > 0).map((k) => (
                    <tr key={k}>
                      <th scope="row">{t(`door.module.${k}` as const)}</th>
                      <td data-label={t('door.access.col.letters')}>
                        <LetterChips letters={s.letters[k]} />
                      </td>
                      <td className="muted" data-label={t('door.access.col.why')}>{whyText(s.why[k], t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </>
  );
}

function whyText(sources: AccessExplanation['systems'][number]['why'][ModuleKey], t: ReturnType<typeof useT>): string {
  const names = new Set<string>();
  for (const s of sources) {
    if (s.via === 'MEMBER' || !s.office) names.add(t('door.access.why.member'));
    else names.add(s.via === 'DELEGATION' ? t('door.access.why.delegated', { office: t(`door.office.${s.office}` as const) }) : t(`door.office.${s.office}` as const));
  }
  return [...names].join(', ');
}

function LookUp({ onFound, onClear, active }: { onFound: (e: AccessExplanation) => void; onClear: () => void; active: boolean }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<DirectoryPerson[]>([]);
  const [error, setError] = useState('');
  const search = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      setFound(q.trim() ? await fetchPeople({ q: q.trim() }) : []);
    } catch {
      setError(t('door.people.error'));
    }
  };
  const pick = async (id: string) => {
    try {
      onFound(await fetchAccessOf(id));
    } catch {
      setError(t('door.people.error'));
    }
  };
  return (
    <form className="panel door-form" onSubmit={search} noValidate>
      <h3>{t('door.access.lookup.title')}</h3>
      <div className="door-search-row">
        <TextField label={t('door.access.lookup.label')} name="lookup" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('door.people.search')} />
        <button type="submit" className="btn secondary">
          {t('door.access.form.search')}
        </button>
      </div>
      {found.length > 0 && (
        <ul className="door-list">
          {found.slice(0, 8).map((p) => (
            <li key={p.id}>
              <button type="button" className="btn ghost sm" onClick={() => void pick(p.id)}>
                {p.fullName} {p.memberCode ?? ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {active && (
        <button type="button" className="btn ghost sm" onClick={onClear}>
          {t('door.access.lookup.back')}
        </button>
      )}
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function RulesPanel() {
  const t = useT();
  const { loading, failed, data, reload } = useLoad(fetchRuleMatrix, 'access|matrix');
  return (
    <LoadState loading={loading} failed={failed} retry={reload}>
      {data && (
        <>
          <div className="panel">
            <h3>{t('door.access.rules.letters')}</h3>
            <ul className="door-list">
              {data.letters.map((l) => (
                <li key={l.letter}>
                  <span className="door-chip">{l.letter}</span> <strong>{t(`door.letter.${l.letter}.name` as const)}</strong>
                  <span className="muted"> · {t(`door.letter.${l.letter}.meaning` as const)}</span>
                </li>
              ))}
            </ul>
            <ul className="door-rules">
              <li>{t('door.access.rules.includeR')}</li>
              <li>{t('door.access.rules.ownRequest')}</li>
              <li>{t('door.access.rules.officeEnds')}</li>
              <li>{t('door.access.rules.delegation', { days: String(data.limits.delegationMaxDays) })}</li>
            </ul>
          </div>
          <div className="panel">
            <h3>{t('door.access.rules.matrix')}</h3>
            <div className="door-table-wrap">
              <table className="door-table door-matrix">
                <thead>
                  <tr>
                    <th>{t('door.access.col.office')}</th>
                    {data.modules.map((m) => (
                      <th key={m.key}>{t(`door.module.${m.key}` as const)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.offices.map((o) => (
                    <tr key={o.code}>
                      <th scope="row">
                        {t(`door.office.${o.code}` as const)}
                        <div className="muted">{o.scope === 'CHURCH' ? t('door.access.scope.church') : t('door.access.scope.unit')}</div>
                      </th>
                      {data.modules.map((m) => (
                        <td key={m.key}>{lettersText(o.letters[m.key])}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">{t('door.access.rules.member')}</th>
                    {data.modules.map((m) => (
                      <td key={m.key}>{lettersText(data.member[m.key])}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </LoadState>
  );
}

function DelegationPanel() {
  const t = useT();
  const { loading, failed, data, reload } = useLoad(() => fetchDelegations(true), 'access|delegations');
  const me = useLoad(fetchMyAccess, 'access|me|delegation');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const take = async (id: string) => {
    setError('');
    try {
      await revokeDelegation(id);
      setMessage(t('door.access.delegation.revoked'));
      reload();
    } catch (e) {
      setError(t(accessErrorKey(bodyCode(e)) as 'door.people.actionFailed'));
    }
  };
  const row = (d: DelegationRow, mine: boolean) => (
    <li key={d.id} className="door-appt">
      <div>
        <strong>{mine ? d.toName : d.fromName}</strong>
        <div className="muted">
          {MODULE_KEYS.filter((k) => d.letters[k]?.length).map((k) => `${t(`door.module.${k}` as const)}: ${lettersText(d.letters[k])}`).join(' · ')}
        </div>
        <div className="muted">
          {t('door.access.until', { date: d.endDate ?? '—' })}
          {!d.live && <span className="door-chip"> {t(d.status === 'REVOKED' ? 'door.access.delegation.revokedChip' : 'door.access.ended', { date: d.endDate ?? '' })}</span>}
        </div>
      </div>
      {d.live && (
        <button type="button" className="btn ghost sm" onClick={() => void take(d.id)}>
          {t('door.access.delegation.takeBack')}
        </button>
      )}
    </li>
  );
  return (
    <LoadState loading={loading || me.loading} failed={failed || me.failed} retry={() => { reload(); me.reload(); }}>
      {data && me.data && (
        <>
          <p className="muted">{t('door.access.delegation.intro', { days: String(data.limits.maxDays) })}</p>
          {message && <p className="door-ok" role="status">{message}</p>}
          {error && <p className="door-error" role="alert">{error}</p>}
          {me.data.offices.length > 0 && <LendForm offices={me.data.offices} onDone={() => { setMessage(t('door.access.delegation.lent')); reload(); }} />}
          <div className="panel">
            <h3>{t('door.access.delegation.given')}</h3>
            {data.given.length === 0 ? <p className="muted">{t('door.access.delegation.none')}</p> : <ul className="door-list">{data.given.map((d) => row(d, true))}</ul>}
          </div>
          <div className="panel">
            <h3>{t('door.access.delegation.received')}</h3>
            {data.received.length === 0 ? <p className="muted">{t('door.access.delegation.none')}</p> : <ul className="door-list">{data.received.map((d) => row(d, false))}</ul>}
          </div>
          {data.all && (
            <div className="panel">
              <h3>{t('door.access.delegation.all')}</h3>
              {data.all.length === 0 ? <p className="muted">{t('door.access.delegation.none')}</p> : (
                <ul className="door-list">
                  {data.all.map((d) => (
                    <li key={d.id}>
                      {d.fromName} → {d.toName} <span className="muted">· {t('door.access.until', { date: d.endDate ?? '—' })}{d.live ? '' : ` · ${d.status}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </LoadState>
  );
}

function LendForm({ offices, onDone }: { offices: AccessExplanation['offices']; onDone: () => void }) {
  const t = useT();
  const lendable = offices.filter((o) => o.office !== 'ADMINISTRATOR');
  const matrix = useLoad(fetchRuleMatrix, 'access|matrix|lend');
  const [positionId, setPositionId] = useState(lendable[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<DirectoryPerson[]>([]);
  const [toPersonId, setTo] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (lendable.length === 0) return null;
  const office = lendable.find((o) => o.id === positionId)?.office as OfficeCode | undefined;
  const carried = (office && matrix.data?.offices.find((o) => o.code === office)?.letters) || {};
  const key = (m: ModuleKey, l: AccessLetter) => `${m}:${l}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const letters: Partial<Record<ModuleKey, AccessLetter[]>> = {};
    for (const [k, on] of Object.entries(picked)) {
      if (!on) continue;
      const [m, l] = k.split(':') as [ModuleKey, AccessLetter];
      letters[m] = [...(letters[m] ?? []), l];
    }
    if (!toPersonId || !endDate || Object.keys(letters).length === 0) {
      setError(t('door.access.form.incomplete'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await lendLetters({ positionId, toPersonId, letters, endDate });
      setPicked({});
      onDone();
    } catch (err) {
      setError(t(accessErrorKey(bodyCode(err)) as 'door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.access.delegation.lend')}</h3>
      {lendable.length > 1 && (
        <SelectField label={t('door.access.delegation.fromOffice')} name="from-office" value={positionId} onChange={(e) => { setPositionId(e.target.value); setPicked({}); }}>
          {lendable.map((o) => (
            <option key={o.id} value={o.id}>
              {t(`door.office.${o.office}` as const)}
            </option>
          ))}
        </SelectField>
      )}
      <div className="door-search-row">
        <TextField label={t('door.access.delegation.to')} name="to-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('door.people.search')} />
        <button
          type="button"
          className="btn secondary"
          onClick={() => void fetchPeople({ q: q.trim() }).then(setFound, () => setError(t('door.people.error')))}
        >
          {t('door.access.form.search')}
        </button>
      </div>
      {found.length > 0 && (
        <SelectField label={t('door.access.form.pickPerson')} name="to" value={toPersonId} onChange={(e) => setTo(e.target.value)}>
          <option value="">{t('door.access.form.choose')}</option>
          {found.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName} {p.memberCode ?? ''}
            </option>
          ))}
        </SelectField>
      )}
      <fieldset className="door-fieldset">
        <legend>{t('door.access.delegation.which')}</legend>
        {MODULE_KEYS.filter((m) => (carried[m] ?? []).filter((l) => l !== 'R').length > 0).map((m) => (
          <div key={m} className="door-check-row">
            <span className="door-check-label">{t(`door.module.${m}` as const)}</span>
            {(carried[m] ?? []).filter((l) => l !== 'R').map((l) => (
              <label key={l} className="door-check">
                <input type="checkbox" checked={!!picked[key(m, l)]} onChange={(e) => setPicked((p) => ({ ...p, [key(m, l)]: e.target.checked }))} />
                {t(`door.letter.${l}.name` as const)}
              </label>
            ))}
          </div>
        ))}
      </fieldset>
      <TextField label={t('door.access.delegation.endDate')} name="lend-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      {error && <p className="door-error" role="alert">{error}</p>}
      <button type="submit" className="btn" disabled={busy}>
        {t('door.access.delegation.submit')}
      </button>
    </form>
  );
}

function AuditPanel() {
  const t = useT();
  const { loading, failed, data, reload } = useLoad(() => fetchAuditTrail(100), 'access|audit');
  return (
    <LoadState loading={loading} failed={failed} retry={reload}>
      {data && (
        <div className="panel">
          <h3>{t('door.access.audit.title')}</h3>
          {data.length === 0 ? (
            <p className="muted">{t('door.access.audit.none')}</p>
          ) : (
            <ul className="door-list">
              {data.map((e) => (
                <li key={e.id}>
                  <strong>{e.detail}</strong>
                  <div className="muted">
                    {e.at?.slice(0, 16).replace('T', ' ')} · {e.actorName ?? '—'} · {e.action}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </LoadState>
  );
}
