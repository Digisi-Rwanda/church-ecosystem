import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isChurchLeader, isCatechist, isOrdainedPastor } from '../domain/churchLeadership';
import { pastoralOpsService, PULPIT_SERVICE_KINDS, PULPIT_SERVICE_LABELS } from '../services/pastoralOpsService';
import { peopleService } from '../services';
import type { PulpitServiceKind } from '../domain/types';

function nameOf(id: string | undefined) {
  if (!id) return '—';
  return (
    peopleService.getById(id)?.preferredName ||
    peopleService.getById(id)?.fullName ||
    id
  );
}

/**
 * Church Leader pastoral desk: pathways, baptism name gate, discipline,
 * transfer-out letters, pulpit pipeline.
 */
export function PastoralDeskPage() {
  const { account, roles } = useAuth();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const leader = isChurchLeader(roles);
  const catechist = isCatechist(roles);
  const pastor = isOrdainedPastor(roles);
  const high = leader || catechist || pastor;

  const pathways = useMemo(
    () => pastoralOpsService.listPathways({ openOnly: true }),
    [tick],
  );
  const baptismReady = useMemo(
    () =>
      pastoralOpsService
        .listPathways({ kind: 'BAPTISM_TRACK' })
        .filter((p) => p.status !== 'WITHDRAWN' && p.status !== 'COMPLETED'),
    [tick],
  );
  const discipline = useMemo(
    () => pastoralOpsService.listDiscipline(),
    [tick],
  );
  const letters = useMemo(
    () => pastoralOpsService.listTransferLettersOut(),
    [tick],
  );
  const pulpit = useMemo(() => pastoralOpsService.listPulpit(), [tick]);

  const [msg, setMsg] = useState('');

  if (!account || !high) {
    return (
      <div className="panel">
        <h1>Pastoral desk</h1>
        <p className="muted">
          For Church Leader, pastors, and catechist — pathways, discipline,
          letters, and pulpit.
        </p>
        <Link to="/" className="btn secondary">
          Home
        </Link>
      </div>
    );
  }

  return (
    <div className="stack">
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="panel stack">
        <h2 style={{ margin: 0 }}>Pathway list</h2>
        <p className="muted" style={{ margin: 0 }}>
          Separate from official members — transfer, baptism track, and other
          in-process people.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Pathway</th>
              <th>Status</th>
              <th>Label</th>
            </tr>
          </thead>
          <tbody>
            {pathways.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/people/${p.personId}`}>{nameOf(p.personId)}</Link>
                </td>
                <td>{pastoralOpsService.PATHWAY_KIND_LABELS[p.kind]}</td>
                <td>{p.status}</td>
                <td>{p.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel stack">
        <h2 style={{ margin: 0 }}>Baptism names</h2>
        <p className="muted" style={{ margin: 0 }}>
          Catechist prepares · Church Leader must confirm every name before the
          rite.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Status</th>
              <th>Leader confirm</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {baptismReady.map((p) => (
              <tr key={p.id}>
                <td>{nameOf(p.personId)}</td>
                <td>{p.status}</td>
                <td>
                  {p.leaderConfirmedByPersonId
                    ? `Confirmed · ${nameOf(p.leaderConfirmedByPersonId)}`
                    : 'Not yet'}
                </td>
                <td>
                  {leader && !p.leaderConfirmedByPersonId ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        const r = pastoralOpsService.confirmBaptismName(
                          p.id,
                          account.personId,
                        );
                        setMsg(r.ok ? 'Name confirmed' : r.reason ?? 'Failed');
                        refresh();
                      }}
                    >
                      Confirm name
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel stack">
        <h2 style={{ margin: 0 }}>Discipline</h2>
        <p className="muted" style={{ margin: 0 }}>
          Pastors / catechist may start · final standing needs Church Leader.
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {discipline.map((c) => (
            <li key={c.id} style={{ marginBottom: '0.5rem' }}>
              <strong>{c.title}</strong> · {nameOf(c.personId)} · {c.status}
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {c.summary}
              </div>
              {c.status === 'OPEN' && (pastor || catechist || leader) ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => {
                    pastoralOpsService.submitDisciplineForLeader(c.id);
                    refresh();
                  }}
                >
                  Send to Leader
                </button>
              ) : null}
              {c.status === 'AWAITING_LEADER' && leader ? (
                <div className="row" style={{ marginTop: '0.35rem' }}>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      pastoralOpsService.resolveDiscipline(
                        c.id,
                        account.personId,
                        {
                          finalStanding: 'RESTORED',
                          mayServe: true,
                          mayTakeCommunion: true,
                        },
                      );
                      setMsg('Standing restored');
                      refresh();
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => {
                      pastoralOpsService.resolveDiscipline(
                        c.id,
                        account.personId,
                        {
                          finalStanding: 'RESTRICTED',
                          mayServe: false,
                          mayTakeCommunion: true,
                        },
                      );
                      setMsg('Standing restricted');
                      refresh();
                    }}
                  >
                    Restrict
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel stack">
        <h2 style={{ margin: 0 }}>Transfer letters out</h2>
        <p className="muted" style={{ margin: 0 }}>
          Church Leader only signs. Full letter file lives under{' '}
          <Link to="/correspondence">Correspondence</Link>.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Destination</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {letters.map((l) => (
              <tr key={l.id}>
                <td>{nameOf(l.personId)}</td>
                <td>{l.destinationChurch}</td>
                <td>{l.status}</td>
                <td>
                  <div className="row" style={{ gap: '0.35rem' }}>
                    {l.documentId ? (
                      <Link
                        className="btn sm"
                        to={`/correspondence/${l.documentId}`}
                      >
                        {leader && l.status === 'AWAITING_LEADER'
                          ? 'View'
                          : 'Letter'}
                      </Link>
                    ) : leader && l.status === 'AWAITING_LEADER' ? (
                      <span className="muted">No linked letter yet</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel stack">
        <h2 style={{ margin: 0 }}>Pulpit plan</h2>
        <p className="muted" style={{ margin: 0 }}>
          Evangelism prepares → Catechist reviews → Church Leader approves.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Service</th>
              <th>Preacher</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pulpit.map((s) => (
              <tr key={s.id}>
                <td>{s.serviceDate}</td>
                <td>
                  {s.serviceKind
                    ? PULPIT_SERVICE_LABELS[s.serviceKind]
                    : s.serviceLabel}
                </td>
                <td>
                  {s.isGuest && s.guestName ? (
                    <span>
                      {s.guestName}
                      {s.guestFrom ? ` · ${s.guestFrom}` : ''}{' '}
                      <span className="muted">(guest)</span>
                      {s.guestPhone ? (
                        <>
                          <br />
                          <a href={`tel:${s.guestPhone.replace(/\s+/g, '')}`}>
                            {s.guestPhone}
                          </a>
                        </>
                      ) : null}
                    </span>
                  ) : (
                    nameOf(s.preacherPersonId)
                  )}
                </td>
                <td>{s.status}</td>
                <td>
                  {catechist && s.status === 'CATECHIST_REVIEW' ? (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => {
                        pastoralOpsService.catechistReviewPulpit(
                          s.id,
                          account.personId,
                        );
                        refresh();
                      }}
                    >
                      Review OK
                    </button>
                  ) : null}
                  {leader && s.status === 'AWAITING_LEADER' ? (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        pastoralOpsService.approvePulpit(
                          s.id,
                          account.personId,
                        );
                        setMsg('Pulpit approved');
                        refresh();
                      }}
                    >
                      Approve
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(catechist || leader) && (
          <PulpitPrepareForm
            actorId={account.personId}
            onDone={(ok, reason) => {
              setMsg(
                ok
                  ? 'Pulpit slot(s) prepared — awaiting catechist review'
                  : (reason ?? 'Could not prepare slot'),
              );
              if (ok) refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}

function PulpitPrepareForm({
  actorId,
  onDone,
}: {
  actorId: string;
  onDone: (ok: boolean, reason?: string) => void;
}) {
  const [date, setDate] = useState('2026-10-12');
  const [kinds, setKinds] = useState<PulpitServiceKind[]>(['SS1', 'SS2']);
  const [mode, setMode] = useState<'church' | 'guest'>('church');
  const [preacherId, setPreacherId] = useState('p-pastor-2');
  const [guestName, setGuestName] = useState('');
  const [guestFrom, setGuestFrom] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [error, setError] = useState('');

  function toggleKind(kind: PulpitServiceKind) {
    setKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const r = pastoralOpsService.preparePulpit({
      serviceDate: date,
      serviceKinds: kinds,
      preparedByPersonId: actorId,
      ...(mode === 'guest'
        ? {
            isGuest: true,
            guestName: guestName.trim(),
            guestFrom: guestFrom.trim() || undefined,
            guestPhone: guestPhone.trim(),
          }
        : { preacherPersonId: preacherId }),
    });
    if (!r.ok) {
      setError(r.reason);
      onDone(false, r.reason);
      return;
    }
    setGuestName('');
    setGuestFrom('');
    setGuestPhone('');
    onDone(true);
  }

  return (
    <form className="stack" onSubmit={onSubmit} style={{ marginTop: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>Prepare slot (Evangelism / ops)</h3>
      <p className="muted" style={{ margin: 0 }}>
        Pick the real sanctuary services for that date. Tick both SS1 and SS2
        when the same preacher covers both. Guest preachers do not need a church
        account.
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          aria-label="Service date"
        />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'church' | 'guest')}
          aria-label="Preacher type"
        >
          <option value="church">Church person</option>
          <option value="guest">Outside guest</option>
        </select>
        {mode === 'church' ? (
          <select
            value={preacherId}
            onChange={(e) => setPreacherId(e.target.value)}
            aria-label="Church preacher"
            required
          >
            {peopleService.list().map((p) => (
              <option key={p.id} value={p.id}>
                {p.preferredName || p.fullName}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Guest full name"
              required
              aria-label="Guest name"
            />
            <input
              value={guestFrom}
              onChange={(e) => setGuestFrom(e.target.value)}
              placeholder="From (church / district)"
              aria-label="Guest from"
            />
            <input
              type="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="Phone number"
              required
              aria-label="Guest phone"
              autoComplete="tel"
            />
          </>
        )}
        <button type="submit" className="btn">
          Submit for review
        </button>
      </div>
      <fieldset className="pulpit-service-picks">
        <legend>Services on this date</legend>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.65rem' }}>
          {PULPIT_SERVICE_KINDS.map((kind) => (
            <label key={kind} className="pulpit-service-check">
              <input
                type="checkbox"
                checked={kinds.includes(kind)}
                onChange={() => toggleKind(kind)}
              />
              <span>{PULPIT_SERVICE_LABELS[kind]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error ? (
        <p className="error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
