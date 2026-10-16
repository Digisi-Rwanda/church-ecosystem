import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TextAreaField } from '../../components/ui/Field';
import { useT } from '../../i18n/I18nContext';
import type { MessageKey } from '../../i18n/translate';
import { errorCode } from '../governance';
import { EmptyState, PageHeader, StatusChip } from '../kit';
import { MAX_ROWS, checkAll, mapHeaders, parseCsv, saveAll, toCsv, toRecords, type Checked, type SaveResult } from './engine';
import { TARGETS, isTargetKey, type ImportTarget } from './targets';

type AnyTarget = ImportTarget<any, any>; // oxlint-disable-line no-explicit-any

/**
 * One page for every spreadsheet import: pick the file, see what would happen to each line, then add the good ones.
 * Nothing is saved until the person confirms, and a line that fails never stops the others.
 */
export function ImportPage() {
  const { systemId = '', target: key = '' } = useParams();
  const t = useT();
  if (!isTargetKey(key)) return <EmptyState variant="no-results" title={t('door.import.notFound')} />;
  return <ImportRun key={`${systemId}|${key}`} systemId={systemId} target={TARGETS[key] as AnyTarget} />;
}

function ImportRun({ systemId, target }: { systemId: string; target: AnyTarget }) {
  const t = useT();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Array<Checked<unknown>> | null>(null);
  const [ctx, setCtx] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [saved, setSaved] = useState<SaveResult[] | null>(null);

  const title = t(`door.import.target.${target.key}` as MessageKey);
  const required = target.fields.filter((f) => f.required).map((f) => f.header).join(', ');
  const optional = target.fields.filter((f) => !f.required).map((f) => f.header).join(', ') || '—';

  const reset = () => { setRows(null); setSaved(null); setNote(''); setError(''); };

  const check = async () => {
    reset();
    const table = parseCsv(text);
    if (table.length < 2) return setError(t('door.import.empty'));
    const mapping = mapHeaders(table[0]!, target.fields);
    if (mapping.missing.length) return setError(t('door.import.missingColumns', { columns: mapping.missing.join(', ') }));
    const records = toRecords(table, mapping);
    if (records.length === 0) return setError(t('door.import.empty'));
    if (records.length > MAX_ROWS) return setError(t('door.import.tooMany', { max: MAX_ROWS }));
    if (mapping.unknown.length) setNote(t('door.import.unknownColumns', { columns: mapping.unknown.join(', ') }));
    setBusy(true);
    try {
      const c = await target.load(systemId, records.map((r) => r.values));
      setCtx(c);
      setRows(checkAll(records, (v) => target.judge(v, c), (r) => target.same(r)));
    } catch (e) {
      setError(errorCode(e) === 'NOT_ALLOWED' ? t('door.gov.err.notAllowed') : t('door.import.loadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    reset();
  };

  const add = async () => {
    if (!rows) return;
    setBusy(true);
    setProgress([0, rows.filter((r) => r.state === 'OK').length]);
    try {
      const out = await saveAll(rows, (r) => target.save(r, ctx, systemId), (e) => errorCode(e) ?? 'FAILED', (d, n) => setProgress([d, n]));
      setSaved(out);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const issueText = (r: Checked<unknown>) =>
    r.issue ? t(`door.import.issue.${r.issue.code}` as MessageKey, { field: r.issue.field ?? '', value: r.issue.value ?? '' }) : '';
  const failText = (code?: string) => (code === 'NOT_ALLOWED' ? t('door.gov.err.notAllowed') : t('door.import.saveFailed'));

  const summary = useMemo(() => {
    const c = { ok: 0, duplicates: 0, errors: 0 };
    rows?.forEach((r) => { if (r.state === 'OK') c.ok++; else if (r.state === 'DUPLICATE') c.duplicates++; else c.errors++; });
    return c;
  }, [rows]);

  const download = (name: string, csv: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const template = () => download(`${target.key}-template.csv`, toCsv(target.fields.map((f) => f.header), [target.fields.map((f) => f.example ?? '')]));
  const errorReport = () => {
    if (!rows) return;
    const lines: string[][] = [];
    rows.forEach((r) => {
      if (r.state === 'ERROR') lines.push([String(r.line), r.label, issueText(r)]);
      else if (r.state === 'DUPLICATE') lines.push([String(r.line), r.label, t('door.import.state.DUPLICATE')]);
    });
    saved?.filter((s) => !s.ok).forEach((s) => lines.push([String(s.line), s.label, failText(s.code)]));
    download(`${target.key}-to-correct.csv`, toCsv([t('door.import.line'), t('door.import.what'), t('door.import.result')], lines));
  };

  const back = target.back(systemId);
  const failed = saved?.filter((s) => !s.ok) ?? [];
  const added = saved ? saved.length - failed.length : 0;

  return (
    <section className="door-block" aria-labelledby="door-import-title">
      <PageHeader id="door-import-title" title={title} purpose={t('door.import.purpose')} back={<Link to={back}>←</Link>} />
      {saved ? (
        <div className="panel" role="status">
          <h3>{t('door.import.done', { count: added })}</h3>
          {summary.duplicates > 0 && <p className="muted">{t('door.import.doneSkipped', { count: summary.duplicates })}</p>}
          {failed.length > 0 && <p className="door-warn">{t('door.import.doneFailed', { count: failed.length })}</p>}
          <div className="door-row">
            <Link className="btn" to={back}>OK</Link>
            {(failed.length > 0 || summary.errors > 0 || summary.duplicates > 0) && (
              <button type="button" className="btn ghost" onClick={errorReport}>{t('door.import.errorReport')}</button>
            )}
            <button type="button" className="btn ghost" onClick={() => { setText(''); reset(); }}>{t('door.import.again')}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="panel door-form">
            <p className="muted">{t('door.import.help', { required, optional, max: MAX_ROWS })}</p>
            <div className="door-row">
              <button type="button" className="btn ghost" onClick={template}>{t('door.import.template')}</button>
            </div>
            <input type="file" accept=".csv,text/csv" aria-label={t('door.import.file')} onChange={(e) => void onFile(e.target.files?.[0])} />
            <TextAreaField label={t('door.import.paste')} name="imp-text" rows={8} value={text} onChange={(e) => { setText(e.target.value); setRows(null); }} />
            {note && <p className="muted">{note}</p>}
            {error && <p className="door-error" role="alert">{error}</p>}
            <div className="door-row">
              <button type="button" className="btn secondary" disabled={busy || !text.trim()} onClick={() => void check()}>
                {busy && !progress ? t('door.import.checking') : t('door.import.check')}
              </button>
              <button type="button" className="btn" disabled={busy || !rows || summary.ok === 0} onClick={() => void add()}>
                {progress ? t('door.import.progress', { done: progress[0], total: progress[1] }) : t('door.import.add', { count: summary.ok })}
              </button>
            </div>
          </div>
          {rows && (
            <div className="panel door-table-wrap">
              <p>{t('door.import.summary', { ok: summary.ok, duplicates: summary.duplicates, errors: summary.errors })}</p>
              <table className="door-table door-stack">
                <thead>
                  <tr>
                    <th>{t('door.import.line')}</th>
                    <th>{t('door.import.what')}</th>
                    <th>{t('door.import.result')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line}>
                      <td data-label={t('door.import.line')}>{r.line}</td>
                      <td data-label={t('door.import.what')}>{r.label || '—'}</td>
                      <td data-label={t('door.import.result')}>
                        <StatusChip tone={r.state === 'OK' ? 'success' : r.state === 'DUPLICATE' ? 'warn' : 'danger'}>{t(`door.import.state.${r.state}` as MessageKey)}</StatusChip>{' '}
                        {issueText(r)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
