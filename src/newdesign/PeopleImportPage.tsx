import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { importPeople, type ImportResult } from '../api/frontDoorApi';
import { TextAreaField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { mapImport, parseCsv } from './peopleTools';
import { EmptyState, PageHeader, StatusChip } from './kit';
import { useCanWritePeople } from './usePeopleAccess';

/** Bring people in from a spreadsheet: check first, see what would happen to every line, then add the good ones. */
export function PeopleImportPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const canWrite = useCanWritePeople();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!canWrite) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;

  const run = async (commit: boolean) => {
    setError('');
    const m = mapImport(parseCsv(text));
    setUnknown(m.unknown);
    if (!m.hasName || m.rows.length === 0) return setError(t('door.people.import.noName'));
    if (m.rows.length > 500) return setError(t('door.people.import.tooMany'));
    setBusy(true);
    try {
      const r = await importPeople(m.rows, commit);
      setPreview(r);
      if (commit) setDone(r.created ?? 0);
    } catch (err) {
      setError(errorCode(err) === 'NOT_ALLOWED' ? t('door.gov.err.notAllowed') : t('door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    setPreview(null);
    setDone(null);
  };
  return (
    <section className="door-block" aria-labelledby="door-import-title">
      <PageHeader
        id="door-import-title"
        title={t('door.people.import')}
        purpose={t('door.people.import.purpose')}
        back={<Link to={`/s/${systemId}/people`}>← {t('door.people.tab.directory')}</Link>}
      />
      {done !== null ? (
        <div className="panel" role="status">
          <h3>{t('door.people.import.done', { count: done })}</h3>
          <Link className="btn" to={`/s/${systemId}/people`}>
            {t('door.people.tab.directory')}
          </Link>
        </div>
      ) : (
        <>
          <div className="panel door-form">
            <p className="muted">{t('door.people.import.help')}</p>
            <input type="file" accept=".csv,text/csv" aria-label={t('door.people.import.file')} onChange={(e) => void onFile(e.target.files?.[0])} />
            <TextAreaField label={t('door.people.import.paste')} name="imp-text" rows={8} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} />
            {unknown.length > 0 && <p className="muted">{t('door.people.import.unknown', { columns: unknown.join(', ') })}</p>}
            {error && (
              <p className="door-error" role="alert">
                {error}
              </p>
            )}
            <div className="door-row">
              <button type="button" className="btn secondary" disabled={busy || !text.trim()} onClick={() => void run(false)}>
                {t('door.people.import.check')}
              </button>
              <button type="button" className="btn" disabled={busy || !preview || preview.summary.ok === 0} onClick={() => void run(true)}>
                {t('door.people.import.add', { count: preview?.summary.ok ?? 0 })}
              </button>
            </div>
          </div>
          {preview && (
            <div className="panel door-table-wrap">
              <p>{t('door.people.import.summary', { ok: preview.summary.ok, duplicates: preview.summary.duplicates, errors: preview.summary.errors })}</p>
              <table className="door-table door-stack">
                <thead>
                  <tr>
                    <th>{t('door.people.import.line')}</th>
                    <th>{t('door.people.col.name')}</th>
                    <th>{t('door.people.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line}>
                      <td data-label={t('door.people.import.line')}>{r.line}</td>
                      <td data-label={t('door.people.col.name')}>{r.fullName || '—'}</td>
                      <td data-label={t('door.people.col.status')}>
                        <StatusChip tone={r.state === 'OK' ? 'success' : r.state === 'DUPLICATE' ? 'warn' : 'danger'}>{t(`door.people.import.state.${r.state}` as const)}</StatusChip>{' '}
                        {r.message ?? (r.matches ? t('door.people.import.matches', { names: r.matches.join(', ') }) : '')}
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
