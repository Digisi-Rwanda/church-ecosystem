import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchLetterOptions, fetchLetters, type LetterStatus } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { LetterForm } from './LetterParts';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';

const STATUSES: LetterStatus[] = ['DRAFT', 'DELIVERED', 'WITHDRAWN'];

/** The Letters desk: every letter of this system, open ones first. Those who may write can draft one. */
export function LettersPage() {
  const t = useT();
  const navigate = useNavigate();
  const { systemId = '' } = useParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<LetterStatus | ''>('');
  const [drafting, setDrafting] = useState(false);
  const list = useLoad(() => fetchLetters({ systemId, q: q.trim() || undefined, status: status || undefined }), `letters|${systemId}|${q.trim()}|${status}`);
  const options = useLoad(fetchLetterOptions, 'letter-options');
  const units = options.data ? { ...options.data, units: options.data.units.filter((u) => u.systemId === systemId) } : null;
  const letters = [...(list.data ?? [])].sort((a, b) => Number(b.status === 'DRAFT') - Number(a.status === 'DRAFT'));

  return (
    <>
      <div className="door-filters">
        <TextField label={t('door.letters.search')} name="lq" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectField label={t('door.letters.statusFilter')} name="lstatus" value={status} onChange={(e) => setStatus(e.target.value as LetterStatus | '')}>
          <option value="">{t('door.letters.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`door.letters.status.${s}` as const)}
            </option>
          ))}
        </SelectField>
        {units && units.units.length > 0 && !drafting && (
          <button type="button" className="btn" onClick={() => setDrafting(true)}>
            {t('door.letters.new')}
          </button>
        )}
      </div>
      {drafting && units && (
        <LetterForm options={units} onCancel={() => setDrafting(false)} onDone={(id) => navigate(`/s/${systemId}/governance/letters/${id}`)} />
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {letters.length === 0 ? (
          <EmptyState title={t('door.letters.none')} detail={t('door.letters.noneDetail')} />
        ) : (
          <ul className="door-notices">
            {letters.map((l) => (
              <li key={l.id} className="panel door-notice">
                <div className="door-notice-main">
                  <div className="door-row">
                    <strong>
                      <Link to={`/s/${systemId}/governance/letters/${l.id}`}>{l.subject}</Link>
                    </strong>
                    <span className={`door-chip${l.status === 'DRAFT' ? ' warn' : ''}`}>{t(`door.letters.status.${l.status}` as const)}</span>
                  </div>
                  <p className="muted door-notice-meta">
                    {l.reference} · {l.typeName} · {t('door.letters.to', { name: l.recipientName })} · {l.unitName}
                    {l.status === 'DRAFT' && l.printed && ` · ${t('door.letters.printedWaiting')}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </>
  );
}
