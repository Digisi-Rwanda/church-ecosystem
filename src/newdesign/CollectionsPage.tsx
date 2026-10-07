import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import {
  confirmCount, fetchCountOptions, fetchCounts, handOverCount, recordCount, voidCount,
  type CountItem, type CountKind, type CountOptions, type DirectoryPerson,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { countStatusKey, formatRwf, moneyErrorKey, parseAmount } from './money';
import { PersonPicker } from './PersonPicker';
import { useLoad } from './useLoad';

function CountForm({ options, systemId, onDone, onCancel }: { options: CountOptions; systemId: string; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const units = options.units.filter((u) => u.systemId === systemId);
  const [unitId, setUnitId] = useState(units.length === 1 ? units[0].id : '');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<CountKind>('OFFERING');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [counters, setCounters] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const add = (p: DirectoryPerson) => {
    if (!counters.some((c) => c.id === p.id) && counters.length < 10) setCounters([...counters, { id: p.id, name: p.fullName }]);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseAmount(amount);
    if (!unitId || !label.trim() || !day) return setError(t('door.money.form.incomplete'));
    if (n === null || n > options.limits.amountMax) return setError(t('door.money.err.amount'));
    if (counters.length < 2) return setError(t('door.money.err.twoCounters'));
    setBusy(true);
    setError('');
    try {
      await recordCount({ unitId, serviceOn: day, label: label.trim(), kind, amount: n, counterIds: counters.map((c) => c.id), note: note.trim() || null });
      onDone();
    } catch (err) {
      setError(t(moneyErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.money.count.new')}</h3>
      {units.length > 1 && (
        <SelectField label={t('door.work.form.unit')} name="c-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </SelectField>
      )}
      <TextField label={t('door.money.count.label')} name="c-label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
      <TextField label={t('door.money.count.day')} name="c-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      <SelectField label={t('door.money.entry.kind')} name="c-kind" value={kind} onChange={(e) => setKind(e.target.value as CountKind)}>
        {options.kinds.map((k) => (
          <option key={k} value={k}>
            {t(`door.money.count.kind.${k}` as const)}
          </option>
        ))}
      </SelectField>
      <TextField label={t('door.money.entry.amount')} name="c-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <p className="muted">{t('door.money.count.countersHint')}</p>
      {counters.length > 0 && (
        <ul className="door-chips">
          {counters.map((c) => (
            <li key={c.id}>
              <button type="button" className="door-chip" onClick={() => setCounters(counters.filter((x) => x.id !== c.id))} aria-label={t('door.work.form.removeHelper', { name: c.name })}>
                {c.name} ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <PersonPicker label={t('door.money.count.pickCounter')} name="c-counter" onPick={add} />
      <TextAreaField label={t('door.money.entry.note')} name="c-note" rows={2} value={note} maxLength={options.limits.noteMax} onChange={(e) => setNote(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {t('door.money.count.record')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

function CountRow({ item, onChange }: { item: CountItem; onChange: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [ask, setAsk] = useState<'void' | 'handover' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const run = async (job: () => Promise<void>) => {
    setError('');
    try {
      await job();
      setAsk(null);
      setReason('');
      onChange();
    } catch (err) {
      setError(t(moneyErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${item.serviceOn}T00:00:00Z`));
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row">
          <strong>
            {item.label} · {formatRwf(item.amount)}
          </strong>
          <span className={`door-chip${item.status === 'RECORDED' ? ' warn' : ''}`}>{t(countStatusKey(item.status))}</span>
        </div>
        <p className="muted">
          {day} · {item.unitName} · {t(`door.money.count.kind.${item.kind}` as const)}
        </p>
        <p className="muted">{t('door.money.count.countedBy', { names: item.counters.map((c) => c.name).join(', ') })}</p>
        {item.confirmedByName && <p className="muted">{t('door.money.count.confirmedBy', { name: item.confirmedByName })}</p>}
        {item.handedToName && <p className="muted">{t('door.money.count.handedTo', { name: item.handedToName })}</p>}
        {item.voidReason && <p className="muted">{item.voidReason}</p>}
        {item.note && <p>{item.note}</p>}
        {ask === 'void' && (
          <div className="door-form">
            <TextField label={t('door.money.reason')} name={`c-reason-${item.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="door-row">
              <button type="button" className="btn" disabled={!reason.trim()} onClick={() => void run(() => voidCount(item.id, reason.trim()))}>
                {t('door.money.entry.void')}
              </button>
              <button type="button" className="btn ghost" onClick={() => setAsk(null)}>
                {t('door.settings.cancel')}
              </button>
            </div>
          </div>
        )}
        {ask === 'handover' && (
          <div className="door-form">
            <PersonPicker label={t('door.money.count.pickTreasurer')} name={`c-to-${item.id}`} onPick={(p) => void run(() => handOverCount(item.id, p.id))} />
            <button type="button" className="btn ghost sm" onClick={() => setAsk(null)}>
              {t('door.settings.cancel')}
            </button>
          </div>
        )}
        {!ask && (
          <div className="door-row">
            {item.canConfirm && (
              <button type="button" className="btn sm" onClick={() => void run(() => confirmCount(item.id))}>
                {t('door.money.count.confirm')}
              </button>
            )}
            {item.canHandOver && (
              <button type="button" className="btn sm" onClick={() => setAsk('handover')}>
                {t('door.money.count.handOver')}
              </button>
            )}
            {item.canVoid && (
              <button type="button" className="btn ghost sm" onClick={() => setAsk('void')}>
                {t('door.money.entry.void')}
              </button>
            )}
          </div>
        )}
        {error && (
          <p className="door-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

/** Collections, a tab of Governance: offerings counted at services, kept apart from Money. */
export function CollectionsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const [creating, setCreating] = useState(false);
  const list = useLoad(() => fetchCounts(systemId), `counts|${systemId}`);
  const options = useLoad(fetchCountOptions, 'count-options');
  const canWrite = !!list.data?.canWrite && !!options.data && options.data.units.some((u) => u.systemId === systemId);
  return (
    <>
      <p className="muted">{t('door.money.count.intro')}</p>
      {canWrite && !creating && (
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          {t('door.money.count.new')}
        </button>
      )}
      {creating && options.data && (
        <CountForm options={options.data} systemId={systemId} onDone={() => { setCreating(false); list.reload(); }} onCancel={() => setCreating(false)} />
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {(list.data?.counts ?? []).length === 0 ? (
          <EmptyState title={t('door.money.count.none')} detail={t('door.money.count.noneDetail')} />
        ) : (
          <ul className="door-notices">
            {(list.data?.counts ?? []).map((c) => (
              <CountRow key={c.id} item={c} onChange={list.reload} />
            ))}
          </ul>
        )}
      </LoadState>
    </>
  );
}
