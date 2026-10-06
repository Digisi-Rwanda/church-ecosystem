import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchDecisions, fetchGovernanceOptions, type DecisionStatus } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { DecisionCard, DecisionForm } from './DecisionParts';
import { decisionStatusKey, groupDecisions } from './governance';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';

const STATUSES: DecisionStatus[] = ['DRAFT', 'APPROVED', 'REJECTED', 'WITHDRAWN'];

/** The decision register of this system: search it, and read what waits for approval first. */
export function DecisionsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<DecisionStatus | ''>('');
  const [drafting, setDrafting] = useState(false);
  const [notice, setNotice] = useState('');
  const list = useLoad(() => fetchDecisions({ systemId, q: q.trim() || undefined, status: status || undefined }), `decisions|${systemId}|${q.trim()}|${status}`);
  const options = useLoad(fetchGovernanceOptions, 'gov-options');
  const units = options.data?.units.filter((u) => u.systemId === systemId) ?? [];
  const groups = groupDecisions(list.data ?? []);

  return (
    <>
      <div className="door-filters">
        <TextField label={t('door.gov.decision.search')} name="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectField label={t('door.gov.decision.statusFilter')} name="status" value={status} onChange={(e) => setStatus(e.target.value as DecisionStatus | '')}>
          <option value="">{t('door.gov.decision.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(decisionStatusKey(s))}
            </option>
          ))}
        </SelectField>
        {units.length > 0 && !drafting && (
          <button type="button" className="btn" onClick={() => { setDrafting(true); setNotice(''); }}>
            {t('door.gov.decision.add')}
          </button>
        )}
      </div>
      {notice && (
        <p className="door-ok" role="status">
          {notice}
        </p>
      )}
      {drafting && options.data && (
        <DecisionForm
          units={units}
          limits={options.data.limits}
          onCancel={() => setDrafting(false)}
          onDone={() => {
            setDrafting(false);
            setNotice(t('door.gov.decision.drafted'));
            list.reload();
          }}
        />
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {groups.length === 0 ? (
          <EmptyState title={t('door.gov.decision.none')} detail={t('door.gov.decision.noneDetail')} />
        ) : (
          groups.map((g) => (
            <div key={g.status} className="door-decisions">
              <h3>{t(decisionStatusKey(g.status))}</h3>
              {g.items.map((d) => (
                <DecisionCard key={d.id} item={d} onChanged={list.reload} notify={setNotice} />
              ))}
            </div>
          ))
        )}
      </LoadState>
    </>
  );
}
