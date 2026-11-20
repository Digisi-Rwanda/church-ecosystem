import { useState, type FormEvent } from 'react';
import {
  changeCollection, fetchCollections, recordCollection, voidCollection,
  type CollectionInput, type CollectionItem, type CollectionKind, type CollectionsView,
} from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { collectionErrorKey, collectionsToCsv, parseGiving, yearMonths } from './collections';
import { MonthsChart } from './DashViz';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { EmptyState, Segmented, StatusChip } from './kit';
import { formatRwf } from './money';
import { useLoad } from './useLoad';

type View = 'list' | 'months';
const today = () => new Date().toISOString().slice(0, 10);

/** Record a service or an event with what was given, or correct one already recorded. */
function CollectionForm({ view, existing, onDone, onCancel }: { view: CollectionsView; existing?: CollectionItem; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [kind, setKind] = useState<CollectionKind>(existing?.kind ?? 'SERVICE');
  const [title, setTitle] = useState(existing?.title ?? t('door.coll.defaultService'));
  const [day, setDay] = useState(existing?.heldOn ?? today());
  const [time, setTime] = useState(existing?.startsAt ?? '');
  const [tithe, setTithe] = useState(existing && existing.tithe ? String(existing.tithe) : '');
  const [offering, setOffering] = useState(existing && existing.offering ? String(existing.offering) : '');
  const [other, setOther] = useState(existing && existing.other ? String(existing.other) : '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const figures = [parseGiving(tithe), parseGiving(offering), parseGiving(other)];
  const sum = figures.every((f) => f !== null) ? figures.reduce<number>((a, f) => a + (f ?? 0), 0) : null;
  const pickKind = (k: CollectionKind) => {
    // Swap the suggested name along with the kind, but never overwrite a name the treasurer typed.
    if (title === t('door.coll.defaultService') || title === t('door.coll.defaultEvent') || title === '') setTitle(k === 'SERVICE' ? t('door.coll.defaultService') : t('door.coll.defaultEvent'));
    setKind(k);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !day) return setError(t('door.coll.err.incomplete'));
    if (figures.some((f) => f === null) || figures.some((f) => (f ?? 0) > view.limits.amountMax)) return setError(t('door.coll.err.amount'));
    if (!sum) return setError(t('door.coll.err.amount'));
    const input: CollectionInput = { kind, title: title.trim(), heldOn: day, startsAt: time || null, tithe: figures[0]!, offering: figures[1]!, other: figures[2]!, note: note.trim() || null };
    setBusy(true);
    setError('');
    try {
      if (existing) await changeCollection(existing.id, input);
      else await recordCollection(input);
      onDone();
    } catch (err) {
      setError(t(collectionErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{existing ? t('door.coll.change') : t('door.coll.new')}</h3>
      <SelectField label={t('door.coll.kind')} name="c-kind" value={kind} onChange={(e) => pickKind(e.target.value as CollectionKind)}>
        <option value="SERVICE">{t('door.coll.kind.SERVICE')}</option>
        <option value="EVENT">{t('door.coll.kind.EVENT')}</option>
      </SelectField>
      <TextField label={t('door.coll.title')} name="c-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      <TextField label={t('door.coll.day')} name="c-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      <TextField label={t('door.coll.time')} name="c-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      <TextField label={t('door.coll.tithe')} name="c-tithe" inputMode="numeric" value={tithe} onChange={(e) => setTithe(e.target.value)} />
      <TextField label={t('door.coll.offering')} name="c-offering" inputMode="numeric" value={offering} onChange={(e) => setOffering(e.target.value)} />
      <TextField label={t('door.coll.other')} name="c-other" inputMode="numeric" hint={t('door.coll.otherHint')} value={other} onChange={(e) => setOther(e.target.value)} />
      <p className="muted" aria-live="polite">
        {t('door.coll.sum', { total: sum === null ? '—' : formatRwf(sum) })}
      </p>
      <TextAreaField label={t('door.money.entry.note')} name="c-note" rows={2} value={note} maxLength={view.limits.noteMax} onChange={(e) => setNote(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {existing ? t('door.coll.save') : t('door.coll.record')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

/** Ask for a reason, then cancel the entry. Nothing is deleted. */
function CancelForm({ item, onDone, onCancel }: { item: CollectionItem; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const go = async () => {
    try {
      await voidCollection(item.id, reason.trim());
      onDone();
    } catch (err) {
      setError(t(collectionErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <div className="panel door-form">
      <TextField label={t('door.money.reason')} name={`c-reason-${item.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="button" className="btn" disabled={!reason.trim()} onClick={() => void go()}>
          {t('door.money.entry.void')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </div>
  );
}

/** Collections, a tab of Governance: what was given at each service or event. The treasurer records; the Church Leader reads and downloads. */
export function CollectionsPage() {
  const t = useT();
  const { locale } = useI18n();
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<CollectionItem | 'new' | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const { data, loading, failed, reload } = useLoad(() => fetchCollections(year), `collections|${year}`);
  const done = () => {
    setEditing(null);
    setCancelling(null);
    reload();
  };
  const dayLabel = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const download = () => {
    if (!data) return;
    const head = ['date', 'time', 'kind', 'title', 'tithe', 'offering', 'other', 'total', 'status', 'reason', 'note', 'recordedBy'];
    const blob = new Blob(['﻿', collectionsToCsv(data.items, head)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `collections-${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const months = data ? yearMonths(year, data.byMonth) : [];
  const series = [
    { key: 'tithe', name: t('door.coll.tithe'), slot: 1, points: months.map((m) => ({ label: m.month, value: m.tithe })) },
    { key: 'offering', name: t('door.coll.offering'), slot: 2, points: months.map((m) => ({ label: m.month, value: m.offering })) },
    { key: 'other', name: t('door.coll.other'), slot: 3, points: months.map((m) => ({ label: m.month, value: m.other })) },
  ];
  return (
    <>
      <p className="muted">{t(data?.canWrite ? 'door.coll.introTreasurer' : 'door.coll.intro')}</p>
      <div className="door-row">
        <SelectField label={t('door.money.year')} name="c-year" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
          {(data?.years ?? [year]).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </SelectField>
        {data?.canWrite && !editing && (
          <button type="button" className="btn" onClick={() => setEditing('new')}>
            {t('door.coll.new')}
          </button>
        )}
        <button type="button" className="btn ghost" disabled={!data || data.items.length === 0} onClick={download}>
          {t('door.coll.download')}
        </button>
      </div>
      {data && editing && <CollectionForm view={data} existing={editing === 'new' ? undefined : editing} onDone={done} onCancel={() => setEditing(null)} />}
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && (
          <>
            <div className="pva-net">
              <div className="pva-net-title">{t('door.coll.heroTitle', { year: String(year), count: String(data.totals.count) })}</div>
              <div>
                <span className="pva-net-label">{t('door.coll.total')}</span>
                <strong>{formatRwf(data.totals.all)}</strong>
              </div>
              <div>
                <span className="pva-net-label">{t('door.coll.tithe')}</span>
                <strong>{formatRwf(data.totals.tithe)}</strong>
              </div>
              <div>
                <span className="pva-net-label">{t('door.coll.offering')}</span>
                <strong>{formatRwf(data.totals.offering)}</strong>
              </div>
              <div>
                <span className="pva-net-label">{t('door.coll.other')}</span>
                <strong>{formatRwf(data.totals.other)}</strong>
              </div>
            </div>
            {data.items.length === 0 ? (
              <EmptyState title={t('door.coll.none')} detail={t(data.canWrite ? 'door.coll.noneTreasurer' : 'door.coll.noneDetail')} />
            ) : (
              <>
                <Segmented
                  label={t('door.coll.view')}
                  value={view}
                  onChange={setView}
                  items={[
                    { key: 'list', label: t('door.coll.view.list') },
                    { key: 'months', label: t('door.coll.view.months') },
                  ]}
                />
                {view === 'months' ? (
                  <div className="pva-card">
                    <MonthsChart kind="bars" series={series} title={t('door.coll.byMonth')} format={formatRwf} />
                    <div className="door-table-wrap">
                      <table className="pva-table">
                        <thead>
                          <tr>
                            <th scope="col">{t('door.dash.month')}</th>
                            <th scope="col" className="num">{t('door.coll.tithe')}</th>
                            <th scope="col" className="num">{t('door.coll.offering')}</th>
                            <th scope="col" className="num">{t('door.coll.other')}</th>
                            <th scope="col" className="num">{t('door.coll.total')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {months.map((m) => (
                            <tr key={m.month}>
                              <th scope="row">{new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(`${m.month}-01T00:00:00Z`))}</th>
                              <td className="num" data-label={t('door.coll.tithe')}>{formatRwf(m.tithe)}</td>
                              <td className="num" data-label={t('door.coll.offering')}>{formatRwf(m.offering)}</td>
                              <td className="num" data-label={t('door.coll.other')}>{formatRwf(m.other)}</td>
                              <td className="num" data-label={t('door.coll.total')}>{formatRwf(m.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th scope="row">{t('door.coll.yearTotal')}</th>
                            <td className="num" data-label={t('door.coll.tithe')}>{formatRwf(data.totals.tithe)}</td>
                            <td className="num" data-label={t('door.coll.offering')}>{formatRwf(data.totals.offering)}</td>
                            <td className="num" data-label={t('door.coll.other')}>{formatRwf(data.totals.other)}</td>
                            <td className="num" data-label={t('door.coll.total')}>{formatRwf(data.totals.all)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="pva-card">
                    <div className="door-table-wrap">
                      <table className="pva-table">
                        <thead>
                          <tr>
                            <th scope="col">{t('door.coll.when')}</th>
                            <th scope="col" className="num">{t('door.coll.tithe')}</th>
                            <th scope="col" className="num">{t('door.coll.offering')}</th>
                            <th scope="col" className="num">{t('door.coll.other')}</th>
                            <th scope="col" className="num">{t('door.coll.total')}</th>
                            {data.canWrite && <th scope="col">{t('door.coll.actions')}</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {data.items.map((i) => (
                            <tr key={i.id} className={i.status === 'VOIDED' ? 'muted' : undefined}>
                              <th scope="row">
                                <strong>{i.title}</strong>{' '}
                                <StatusChip tone={i.status === 'VOIDED' ? 'warn' : 'neutral'}>{i.status === 'VOIDED' ? t('door.coll.cancelled') : t(`door.coll.kind.${i.kind}` as const)}</StatusChip>
                                <span className="muted">
                                  {' '}· {dayLabel(i.heldOn)}
                                  {i.startsAt ? ` · ${i.startsAt}` : ''}
                                </span>
                                {i.voidReason && <span className="muted"> · {i.voidReason}</span>}
                                {i.note && <span className="muted"> · {i.note}</span>}
                              </th>
                              <td className="num" data-label={t('door.coll.tithe')}>{formatRwf(i.tithe)}</td>
                              <td className="num" data-label={t('door.coll.offering')}>{formatRwf(i.offering)}</td>
                              <td className="num" data-label={t('door.coll.other')}>{formatRwf(i.other)}</td>
                              <td className="num" data-label={t('door.coll.total')}>{i.status === 'VOIDED' ? '—' : formatRwf(i.total)}</td>
                              {data.canWrite && (
                                <td data-label={t('door.coll.actions')}>
                                  {i.status === 'ACTIVE' && cancelling !== i.id && (
                                    <span className="door-row">
                                      <button type="button" className="btn ghost sm" onClick={() => setEditing(i)}>
                                        {t('door.coll.edit')}
                                      </button>
                                      <button type="button" className="btn ghost sm" onClick={() => setCancelling(i.id)}>
                                        {t('door.money.entry.void')}
                                      </button>
                                    </span>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {cancelling && data.items.find((i) => i.id === cancelling) && (
                      <CancelForm item={data.items.find((i) => i.id === cancelling)!} onDone={done} onCancel={() => setCancelling(null)} />
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </LoadState>
    </>
  );
}
