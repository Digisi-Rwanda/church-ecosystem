import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchGovernanceOptions, fetchMeetings, planMeeting } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode, govErrorKey, isOverdue, meetingStatusKey, sortMeetings, toIso } from './governance';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';

/** Meetings of the units in this system, planned ones first. Those who may write get a form to plan one. */
export function MeetingsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const [unit, setUnit] = useState('');
  const [planning, setPlanning] = useState(false);
  const [notice, setNotice] = useState('');
  const list = useLoad(() => fetchMeetings({ systemId, unitId: unit || undefined }), `meetings|${systemId}|${unit}`);
  const options = useLoad(fetchGovernanceOptions, 'gov-options');
  const units = options.data?.units.filter((u) => u.systemId === systemId) ?? [];
  const meetings = sortMeetings(list.data ?? []);
  const unitNames = [...new Map((list.data ?? []).map((m) => [m.orgUnitId, m.unitName])).entries()];

  return (
    <>
      <div className="door-filters">
        {unitNames.length > 1 || unit ? (
          <SelectField label={t('door.gov.meeting.unit')} name="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">{t('door.gov.meeting.filterAll')}</option>
            {unitNames.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </SelectField>
        ) : null}
        {units.length > 0 && !planning && (
          <button type="button" className="btn" onClick={() => { setPlanning(true); setNotice(''); }}>
            {t('door.gov.meeting.plan')}
          </button>
        )}
      </div>
      {notice && (
        <p className="door-ok" role="status">
          {notice}
        </p>
      )}
      {planning && options.data && (
        <PlanForm
          units={units}
          types={options.data.meetingTypes}
          limits={options.data.limits}
          onCancel={() => setPlanning(false)}
          onDone={() => {
            setPlanning(false);
            setNotice(t('door.gov.meeting.planned'));
            list.reload();
          }}
        />
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {meetings.length === 0 ? (
          <EmptyState title={t('door.gov.meeting.none')} detail={t('door.gov.meeting.noneDetail')} />
        ) : (
          <ul className="door-notices">
            {meetings.map((m) => (
              <li key={m.id} className="panel door-notice">
                <div className="door-notice-main">
                  <div className="door-row">
                    <strong>
                      <Link to={`/s/${systemId}/governance/meetings/${m.id}`}>{m.title}</Link>
                    </strong>
                    <span className={`door-chip${m.status === 'PLANNED' ? ' warn' : ''}`}>{t(meetingStatusKey(m.status))}</span>
                  </div>
                  <p className="muted door-notice-meta">
                    {m.typeName} · {m.unitName}
                    {m.scheduledAt && ` · ${new Date(m.scheduledAt).toLocaleString()}`}
                    {m.location && ` · ${m.location}`}
                    {m.decisionCount > 0 && ` · ${t('door.gov.meeting.decisions', { count: String(m.decisionCount) })}`}
                  </p>
                  {isOverdue(m) && m.canWrite && <p className="door-error">{t('door.gov.meeting.overdue')}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </>
  );
}

function PlanForm({
  units,
  types,
  limits,
  onDone,
  onCancel,
}: {
  units: Array<{ id: string; name: string }>;
  types: Array<{ code: string; name: string }>;
  limits: { titleMax: number; textMax: number };
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { systemId = '' } = useParams();
  const [unitId, setUnitId] = useState(units.length === 1 ? units[0].id : '');
  const [typeCode, setTypeCode] = useState('');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [place, setPlace] = useState('');
  const [agenda, setAgenda] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const at = toIso(when);
    if (!unitId || !typeCode || !at) return setError(t('door.gov.meeting.incomplete'));
    setBusy(true);
    setError('');
    try {
      const id = await planMeeting({ orgUnitId: unitId, typeCode, title: title.trim() || undefined, scheduledAt: at, location: place.trim() || undefined, agenda: agenda.trim() || undefined });
      onDone();
      navigate(`/s/${systemId}/governance/meetings/${id}`);
    } catch (err) {
      setError(t(govErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };

  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.gov.meeting.plan')}</h3>
      <SelectField label={t('door.gov.meeting.unit')} name="m-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
        <option value="">{t('door.gov.meeting.choose')}</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </SelectField>
      <SelectField label={t('door.gov.meeting.type')} name="m-type" value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>
        <option value="">{t('door.gov.meeting.choose')}</option>
        {types.map((x) => (
          <option key={x.code} value={x.code}>
            {x.name}
          </option>
        ))}
      </SelectField>
      <TextField label={t('door.gov.meeting.title')} name="m-title" hint={t('door.gov.meeting.titleHint')} value={title} maxLength={limits.titleMax} onChange={(e) => setTitle(e.target.value)} />
      <TextField label={t('door.gov.meeting.when')} name="m-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      <TextField label={t('door.gov.meeting.location')} name="m-place" value={place} maxLength={200} onChange={(e) => setPlace(e.target.value)} />
      <TextAreaField label={t('door.gov.meeting.agenda')} name="m-agenda" rows={4} value={agenda} maxLength={limits.textMax} onChange={(e) => setAgenda(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {t('door.gov.meeting.submit')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}
