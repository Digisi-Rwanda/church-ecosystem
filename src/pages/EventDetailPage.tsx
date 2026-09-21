import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApprovalRecord } from '../components/ui/ApprovalRecord';
import { StatusPill } from '../components/ui/StatusPill';
import {
  isCatechist,
  isChurchLeader,
  isOrdainedPastor,
} from '../domain/churchLeadership';
import { canApproveEventLevel } from '../domain/eventScope';
import {
  checkedInCount,
  eventOperatingState,
  eventOpStateLabel,
  eventPrimaryVerbs,
  expectedCheckIn,
  offerWindowLabel,
  seatedCount,
  waitlistCount,
} from '../domain/eventOps';
import { checkInToken, checkInUrl, qrImageUrl } from '../domain/checkInQr';
import { statusLabel } from '../domain/statusCopy';
import { eventTypeLabel } from '../domain/permissions';
import type { SystemRole } from '../domain/types';
import { PEOPLE } from '../data/seed';
import { missionListPath } from '../navigation/missionPaths';
import { missionService, systemsService } from '../services';
import {
  hydrateEventRegistrationsFromApi,
  writeAddEventCollaboratorPerson,
  writeAddEventCollaboratorSystem,
  writeApproveEventLevel,
  writeCancelEventRegistration,
  writeCompleteEvent,
  writeEventNextSteps,
  writeMarkEventAttendance,
  writePatchEvent,
  writeRegisterForEvent,
  writeSubmitEvent,
} from '../services/missionWrite';

/** Pastor (not Leader / Catechist) — pastoral summary, not event ops console. */
function isPastoralEventLens(roles: SystemRole[]) {
  return (
    isOrdainedPastor(roles) &&
    !isChurchLeader(roles) &&
    !isCatechist(roles)
  );
}

/** Church Leader — attendance outcome + event report; not day-of ops. */
function isLeaderEventLens(roles: SystemRole[]) {
  return isChurchLeader(roles);
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const listPath = missionListPath(location.pathname, 'events');
  const { can, account, positions, roles, refreshSession } = useAuth();
  const [, setTick] = useState(0);
  const refresh = () => {
    void (async () => {
      if (id) await hydrateEventRegistrationsFromApi(id);
      setTick((t) => t + 1);
      refreshSession();
    })();
  };
  const [msg, setMsg] = useState('');
  const [nextPersonId, setNextPersonId] = useState('');
  const [enrollProgram, setEnrollProgram] = useState(true);

  const [collabSys, setCollabSys] = useState('');
  const [collabPerson, setCollabPerson] = useState('');
  const [linkProjectId, setLinkProjectId] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const hydrated = await hydrateEventRegistrationsFromApi(id);
      if (!cancelled && hydrated) setTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const event = id ? missionService.getEvent(id) : null;
  if (!account || !can('EVENT', 'VIEW')) {
    return (
      <div className="panel">
        <p className="muted">No access.</p>
        <Link to={listPath}>← Events</Link>
      </div>
    );
  }
  if (!event) {
    return (
      <div className="panel">
        <p>Event not found.</p>
        <Link to={listPath}>← Events</Link>
      </div>
    );
  }

  const owner = systemsService.getById(event.ownerSystemId);
  const chain = missionService.eventApprovalChain(event.id);
  const regs = missionService.listEventRegistrations(event.id);
  const myReg = regs.find(
    (r) => r.personId === account.personId && r.status !== 'CANCELLED',
  );
  const canManage = can('EVENT', 'MANAGE');
  const pastoralLens = isPastoralEventLens(roles);
  const leaderLens = isLeaderEventLens(roles);
  /** Catechist / ministry EVENT managers — not Leader or Pastor. */
  const showOps = canManage && !pastoralLens && !leaderLens;
  const openForReg =
    event.status === 'CONFIRMED' || event.status === 'PLANNED';
  const regMode = event.registrationMode ?? 'ANNOUNCEMENT_ONLY';

  const activePrograms = missionService
    .listPrograms({ viewerSystemId: 'sys-main' })
    .filter((p) => p.status === 'ACTIVE');

  function personName(pid: string) {
    const p = PEOPLE.find((x) => x.id === pid);
    return p?.preferredName ?? p?.fullName ?? pid;
  }

  async function doApprove(levelKey: string) {
    const r = await writeApproveEventLevel({
      eventId: event!.id,
      levelKey,
      personId: account!.personId,
      positions,
      roles,
    });
    setMsg(r.ok ? 'Approval recorded' : (r.reason ?? 'Failed'));
    refresh();
  }

  async function doRegister() {
    const r = await writeRegisterForEvent({
      eventId: event!.id,
      personId: account!.personId,
    });
    setMsg(r.ok ? `Registered (${r.registration?.status})` : (r.reason ?? 'Failed'));
    refresh();
  }

  async function doCancel(personId: string) {
    const r = await writeCancelEventRegistration({
      eventId: event!.id,
      personId,
    });
    setMsg(
      r.ok
        ? r.promoted
          ? `Cancelled — promoted ${personName(
              (r.promoted as { personId: string }).personId,
            )} from waitlist`
          : 'Registration cancelled'
        : (r.reason ?? 'Failed'),
    );
    refresh();
  }

  async function doAttend(personId: string, attended: boolean) {
    const r = await writeMarkEventAttendance({
      eventId: event!.id,
      personId,
      attended,
    });
    setMsg(r.ok ? (attended ? 'Marked attended' : 'Marked no-show') : (r.reason ?? 'Failed'));
    refresh();
  }

  async function doComplete() {
    await writeCompleteEvent(event!.id);
    setMsg('Event completed — unmarked seats → no-show · apply follow-up below');
    refresh();
  }

  async function doStartDeliver() {
    const r = await writePatchEvent(event!.id, { lifecyclePhase: 'DELIVER' });
    setMsg(r.ok ? 'Lifecycle → Deliver (live)' : (r.reason ?? 'Failed'));
    refresh();
  }

  async function doEnterClose() {
    const r = await writePatchEvent(event!.id, { lifecyclePhase: 'CLOSE' });
    setMsg(
      r.ok
        ? 'Entered close-out — finish check-in then complete'
        : (r.reason ?? 'Failed'),
    );
    refresh();
  }

  async function doSubmit() {
    const r = await writeSubmitEvent(event!.id);
    setMsg(r.ok ? 'Submitted' : (r.reason ?? 'Failed'));
    refresh();
  }

  async function doSetPhase(phase: 'PREPARE' | 'DELIVER' | 'CLOSE') {
    const r = await writePatchEvent(event!.id, { lifecyclePhase: phase });
    setMsg(
      r.ok
        ? phase === 'CLOSE'
          ? 'Entered close-out'
          : `Phase → ${statusLabel(phase)}`
        : (r.reason ?? 'Failed'),
    );
    refresh();
  }

  async function doNextSteps() {
    if (!nextPersonId) return;
    const suggestBaptism =
      event!.type === 'BAPTISM' && enrollProgram
        ? 'prg-baptism-standing'
        : undefined;
    const r = await writeEventNextSteps({
      personId: nextPersonId,
      eventId: event!.id,
      enrollProgramId: suggestBaptism,
      createFollowUpTask: {
        title: `Follow up after ${event!.name}: ${personName(nextPersonId)}`,
        ownerPersonId: account!.personId,
      },
    });
    setMsg(
      r.ok
        ? `Next steps applied${
            suggestBaptism ? ' · enrolled in Baptism class' : ''
          } · follow-up task created`
        : (r.reason ?? 'Failed'),
    );
    refresh();
  }

  const activeRegs = seatedCount(regs);
  const waitlisted = waitlistCount(regs);
  const expected = expectedCheckIn(regs);
  const checked = checkedInCount(regs);
  const opState = eventOperatingState(event);
  const canApproveAny = chain.some((level) =>
    canApproveEventLevel(level, roles, positions),
  );
  const verbs = eventPrimaryVerbs(opState, {
    canManage: showOps,
    canApprove: canApproveAny,
  });
  const capPct =
    event.capacity && event.capacity > 0
      ? Math.min(100, Math.round((activeRegs / event.capacity) * 100))
      : 0;

  const activePeople = regs.filter((r) => r.status !== 'CANCELLED');

  const primaryCta =
    event.beyondOwnerScope &&
    event.status === 'PENDING_APPROVAL' &&
    chain.some(
      (level) =>
        !(event.approvals ?? []).some((a) => a.levelKey === level.levelKey) &&
        canApproveEventLevel(level, roles, positions),
    )
      ? { label: 'Review approvals', scroll: 'approvals' }
      : !pastoralLens &&
          !leaderLens &&
          regMode === 'REGISTRATION_REQUIRED' &&
          openForReg &&
          (!myReg || myReg.status === 'CANCELLED')
        ? { label: 'Register myself', action: doRegister }
        : null;

  const noShowCount = regs.filter((r) => r.status === 'NO_SHOW').length;
  const attendedList = regs.filter(
    (r) => r.status === 'ATTENDED' || r.attendedAt,
  );

  /* ── Church Leader: report + attendance results only ────────────── */
  if (leaderLens) {
    return (
      <div className="stack">
        <p>
          <Link to={listPath}>← Events</Link>
        </p>
        {msg && <p className="badge">{msg}</p>}

        <div className="detail-hero">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <p className="hero-kicker">
                {eventTypeLabel(event.type)} ·{' '}
                {owner?.shortName ?? owner?.name} ·{' '}
                {event.beyondOwnerScope ? 'Beyond scope' : 'In-scope'}
              </p>
              <h2>{event.name}</h2>
            </div>
            <StatusPill status={event.status} />
          </div>
          <p className="hero-when">
            {new Date(event.startsAt).toLocaleString()}
            {event.location ? ` · ${event.location}` : ''}
          </p>
          {event.description && (
            <p className="muted" style={{ marginBottom: 0 }}>
              {event.description}
            </p>
          )}
          <p className="muted" style={{ marginBottom: 0, marginTop: '0.75rem' }}>
            Oversight view — QR check-in and lifecycle are for Catechist /
            Protocol / ministry ops. You see the report and attendance
            results.
          </p>
        </div>

        <div className="panel stack">
          <h3 style={{ margin: 0 }}>Event report</h3>
          <p style={{ margin: 0 }}>
            Status: <strong>{statusLabel(event.status)}</strong>
            {' · '}
            Stage: <strong>{eventOpStateLabel(opState)}</strong>
            {event.lifecyclePhase
              ? ` (${statusLabel(event.lifecyclePhase)})`
              : ''}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {regMode === 'REGISTRATION_REQUIRED'
              ? event.capacity != null
                ? `${activeRegs} / ${event.capacity} registered${
                    waitlisted > 0 ? ` · ${waitlisted} waitlisted` : ''
                  }`
                : `${activeRegs} registered${
                    waitlisted > 0 ? ` · ${waitlisted} waitlisted` : ''
                  }`
              : 'Announcement only — no registration list'}
            {event.seriesLabel ? ` · Series: ${event.seriesLabel}` : ''}
          </p>
          {event.programId && (
            <p style={{ margin: 0 }}>
              Program:{' '}
              <Link to={`/programs/${event.programId}`}>
                {missionService.getProgram(event.programId)?.name ??
                  event.programId}
              </Link>
            </p>
          )}
          {event.projectId && (
            <p style={{ margin: 0 }}>
              Project:{' '}
              <Link to={`/projects/${event.projectId}`}>
                {missionService.getProject(event.projectId)?.name ??
                  event.projectId}
              </Link>
            </p>
          )}
          {(event.collaboratorSystemIds?.length ||
            event.collaboratorPersonIds?.length) ? (
            <p style={{ marginBottom: 0 }}>
              Collaborators:{' '}
              {[
                ...(event.collaboratorSystemIds ?? []).map(
                  (sid) => systemsService.getById(sid)?.shortName ?? sid,
                ),
                ...(event.collaboratorPersonIds ?? []).map((pid) =>
                  personName(pid),
                ),
              ].join(' · ')}
            </p>
          ) : null}
        </div>

        <div className="panel stack">
          <h3 style={{ margin: 0 }}>Attendance results</h3>
          <p style={{ margin: 0, fontSize: '1.15rem' }}>
            <strong>{checked}</strong>{' '}
            {checked === 1 ? 'person attended' : 'people attended'}
            {noShowCount > 0 ? (
              <span className="muted">
                {' '}
                · {noShowCount} no-show
              </span>
            ) : null}
          </p>
          {attendedList.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Checked in</th>
                </tr>
              </thead>
              <tbody>
                {attendedList.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/people/${r.personId}`}>
                        {personName(r.personId)}
                      </Link>
                    </td>
                    <td className="muted">
                      {r.attendedAt
                        ? new Date(r.attendedAt).toLocaleString()
                        : 'Attended'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted" style={{ marginBottom: 0 }}>
              {event.status === 'COMPLETED'
                ? 'Nobody was marked as attended for this event.'
                : 'Attendance not recorded yet. Numbers appear here after ops check people in.'}
            </p>
          )}
        </div>

        {event.beyondOwnerScope && (
          <div className="panel" id="approvals">
            <h3>Approval chain</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Beyond-scope events need each level before confirmation.
            </p>
            <ApprovalRecord
              routeLabel="Beyond owner scope · event chain"
              gateHint="Every level must approve before the event is confirmed."
              completeHint="All levels approved — event is confirmed."
              timeline={(event.approvals ?? []).map((a) => ({
                id: `${a.levelKey}-${a.approvedAt}`,
                at: a.approvedAt.slice(0, 10),
                label: a.label,
                detail: personName(a.personId),
              }))}
              steps={chain.map((level) => {
                const done = (event.approvals ?? []).some(
                  (a) => a.levelKey === level.levelKey,
                );
                const canHere = canApproveEventLevel(level, roles, positions);
                const approver = (event.approvals ?? []).find(
                  (a) => a.levelKey === level.levelKey,
                );
                return {
                  key: level.levelKey,
                  label: level.label,
                  done,
                  detail:
                    done && approver
                      ? personName(approver.personId)
                      : undefined,
                  action:
                    !done && canHere ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void doApprove(level.levelKey)}
                      >
                        Approve
                      </button>
                    ) : undefined,
                };
              })}
            />
          </div>
        )}
      </div>
    );
  }

  /* ── Pastor lens: pastoral summary only ─────────────────────────── */
  if (pastoralLens) {
    return (
      <div className="stack">
        <p>
          <Link to={listPath}>← Events</Link>
        </p>
        {msg && <p className="badge">{msg}</p>}

        <div className="detail-hero">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <p className="hero-kicker">
                {eventTypeLabel(event.type)} ·{' '}
                {owner?.shortName ?? owner?.name}
              </p>
              <h2>{event.name}</h2>
            </div>
            <StatusPill status={event.status} />
          </div>
          <p className="hero-when">
            {new Date(event.startsAt).toLocaleString()}
            {event.location ? ` · ${event.location}` : ''}
          </p>
          {event.description && (
            <p className="muted" style={{ marginBottom: 0 }}>
              {event.description}
            </p>
          )}
          <p className="muted" style={{ marginBottom: 0, marginTop: '0.75rem' }}>
            Pastoral view — check-in, QR, and lifecycle are run by Protocol /
            ministry ops, not from this desk.
          </p>
        </div>

        <div className="panel stack">
          <h3 style={{ margin: 0 }}>At a glance</h3>
          <p style={{ margin: 0 }}>
            {regMode === 'REGISTRATION_REQUIRED' ? (
              <>
                <strong>{activeRegs}</strong>
                {event.capacity != null ? ` / ${event.capacity}` : ''} registered
                {waitlisted > 0 ? ` · ${waitlisted} waitlisted` : ''}
                {event.status === 'COMPLETED' || checked > 0
                  ? ` · ${checked} attended`
                  : ''}
              </>
            ) : (
              <>Announcement only — no seat list.</>
            )}
          </p>
          {event.programId && (
            <p className="muted" style={{ marginBottom: 0 }}>
              Linked program:{' '}
              <Link to={`/programs/${event.programId}`}>
                {missionService.getProgram(event.programId)?.name ??
                  event.programId}
              </Link>
            </p>
          )}
          {event.type === 'BAPTISM' && (
            <p style={{ marginBottom: 0 }}>
              <Link to="/pastoral">Open pastoral desk →</Link>
              <span className="muted">
                {' '}
                (baptism pathways, name gate, follow-up)
              </span>
            </p>
          )}
        </div>

        {regMode === 'REGISTRATION_REQUIRED' && activePeople.length > 0 && (
          <div className="panel">
            <h3>
              {event.type === 'BAPTISM' ? 'Candidates / seats' : 'People'}
            </h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Read-only roster. Staff mark check-in on the ops console.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activePeople.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/people/${r.personId}`}>
                        {personName(r.personId)}
                      </Link>
                    </td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {event.beyondOwnerScope && (
          <div className="panel" id="approvals">
            <h3>Approval chain</h3>
            <ApprovalRecord
              routeLabel="Beyond owner scope · event chain"
              gateHint="Every level must approve before the event is confirmed."
              completeHint="All levels approved — event is confirmed."
              timeline={(event.approvals ?? []).map((a) => ({
                id: `${a.levelKey}-${a.approvedAt}`,
                at: a.approvedAt.slice(0, 10),
                label: a.label,
                detail: personName(a.personId),
              }))}
              steps={chain.map((level) => {
                const done = (event.approvals ?? []).some(
                  (a) => a.levelKey === level.levelKey,
                );
                const canHere = canApproveEventLevel(level, roles, positions);
                const approver = (event.approvals ?? []).find(
                  (a) => a.levelKey === level.levelKey,
                );
                return {
                  key: level.levelKey,
                  label: level.label,
                  done,
                  detail:
                    done && approver
                      ? personName(approver.personId)
                      : undefined,
                  action:
                    !done && canHere ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void doApprove(level.levelKey)}
                      >
                        Approve
                      </button>
                    ) : undefined,
                };
              })}
            />
          </div>
        )}

        {event.status === 'COMPLETED' && (
          <div className="panel">
            <h3>Post-event follow-up</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Pastoral next steps for people who attended (enroll + follow-up
              task).
            </p>
            {event.type === 'BAPTISM' && (
              <label className="row">
                <input
                  type="checkbox"
                  checked={enrollProgram}
                  onChange={(e) => setEnrollProgram(e.target.checked)}
                />
                Enroll in Baptism class (
                {activePrograms.find((p) => p.id === 'prg-baptism-standing')
                  ?.name ?? 'standing'}
                )
              </label>
            )}
            <div className="row">
              <select
                value={nextPersonId}
                onChange={(e) => setNextPersonId(e.target.value)}
              >
                <option value="">Select attended person…</option>
                {regs
                  .filter((r) => r.status === 'ATTENDED' || r.attendedAt)
                  .map((r) => (
                    <option key={r.id} value={r.personId}>
                      {personName(r.personId)}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="btn"
                disabled={!nextPersonId}
                onClick={() => void doNextSteps()}
              >
                Apply next steps
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Ops / general event console ─────────────────────────────────── */
  return (
    <div className="stack">
      <p>
        <Link to={listPath}>← Events</Link>
      </p>
      {msg && <p className="badge">{msg}</p>}

      <div className="detail-hero">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="hero-kicker">
              {eventTypeLabel(event.type)} · {owner?.shortName ?? owner?.name} ·{' '}
              {event.beyondOwnerScope ? 'Beyond scope' : 'In-scope'}
            </p>
            <h2>{event.name}</h2>
          </div>
          <StatusPill status={event.status} />
        </div>
        {showOps && (
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            Operating · <strong>{eventOpStateLabel(opState)}</strong>
            {event.lifecyclePhase
              ? ` · ${statusLabel(event.lifecyclePhase)}`
              : ''}
          </p>
        )}
        {showOps && verbs.length > 0 && (
          <div className="row" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {verbs.map((v) => (
              <button
                key={v.id}
                type="button"
                className="btn"
                onClick={() => {
                  if (v.id === 'submit') void doSubmit();
                  else if (v.id === 'start') void doStartDeliver();
                  else if (v.id === 'close') void doEnterClose();
                  else if (v.id === 'complete') void doComplete();
                  else if (v.id === 'approve') {
                    document.getElementById('approvals')?.scrollIntoView();
                  }
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        <p className="hero-when">
          {new Date(event.startsAt).toLocaleString()}
          {event.location ? ` · ${event.location}` : ''}
        </p>
        {event.description && (
          <p className="muted" style={{ marginBottom: 0 }}>
            {event.description}
          </p>
        )}
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <span className="badge">
            {regMode === 'REGISTRATION_REQUIRED'
              ? 'Registration required'
              : 'Announcement only'}
          </span>
          {event.seriesLabel && (
            <span className="badge">Series: {event.seriesLabel}</span>
          )}
          {primaryCta &&
            ('action' in primaryCta && primaryCta.action ? (
              <button type="button" className="btn" onClick={primaryCta.action}>
                {primaryCta.label}
              </button>
            ) : (
              <a href="#approvals" className="btn">
                {primaryCta.label}
              </a>
            ))}
        </div>
        {regMode === 'REGISTRATION_REQUIRED' && event.capacity != null && (
          <div className="capacity-meter">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                Capacity
              </span>
              <strong style={{ fontSize: '0.9rem' }}>
                {activeRegs} / {event.capacity}
              </strong>
            </div>
            <div className="track" style={{ marginTop: '0.35rem' }}>
              <div className="fill" style={{ width: `${capPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {showOps && (
        <div className="panel stack">
          <h3 style={{ margin: 0 }}>Check-in QR</h3>
          <p className="muted" style={{ margin: 0 }}>
            Staff scan or open the link to mark attendance.
          </p>
          <div className="row" style={{ alignItems: 'flex-start', gap: '1rem' }}>
            <img
              src={qrImageUrl(checkInUrl('event', event.id))}
              alt="Check-in QR"
              width={160}
              height={160}
            />
            <div>
              <p style={{ marginTop: 0 }}>
                <Link
                  to={`/check-in?k=event&id=${encodeURIComponent(event.id)}&t=${encodeURIComponent(
                    checkInToken('event', event.id),
                  )}`}
                >
                  Open check-in page →
                </Link>
              </p>
              <p
                className="muted"
                style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}
              >
                {checkInUrl('event', event.id)}
              </p>
            </div>
          </div>
        </div>
      )}

      {showOps && (
        <div className="panel stack">
          <h3 style={{ margin: 0 }}>Lifecycle</h3>
          <p className="muted" style={{ margin: 0 }}>
            Same as the operating verbs above — prepare → deliver → close-out.
            Current:{' '}
            <strong>{statusLabel(event.lifecyclePhase ?? 'PREPARE')}</strong>
          </p>
          <div className="row">
            {(['PREPARE', 'DELIVER', 'CLOSE'] as const).map((phase) => (
              <button
                key={phase}
                type="button"
                className={`btn ${
                  (event.lifecyclePhase ?? 'PREPARE') === phase ? '' : 'ghost'
                }`}
                onClick={() => void doSetPhase(phase)}
              >
                {statusLabel(phase)}
              </button>
            ))}
          </div>
        </div>
      )}

      {showOps && (
        <div className="panel stack">
          <h3 style={{ margin: 0 }}>Collaborators</h3>
          <p className="muted" style={{ margin: 0 }}>
            Peer systems and people helping run this event (like projects).
          </p>
          <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            {(event.collaboratorSystemIds ?? []).map((sid) => (
              <span key={sid} className="badge">
                {systemsService.getById(sid)?.shortName ?? sid}
              </span>
            ))}
            {(event.collaboratorPersonIds ?? []).map((pid) => (
              <span key={pid} className="badge">
                {personName(pid)}
              </span>
            ))}
            {!event.collaboratorSystemIds?.length &&
              !event.collaboratorPersonIds?.length && (
                <span className="muted">None yet</span>
              )}
          </div>
          <div className="row">
            <select
              value={collabSys}
              onChange={(e) => setCollabSys(e.target.value)}
            >
              <option value="">Add system…</option>
              {systemsService
                .list()
                .filter(
                  (s) =>
                    s.id !== 'sys-main' && s.id !== event.ownerSystemId,
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shortName}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn secondary"
              disabled={!collabSys}
              onClick={async () => {
                const r = await writeAddEventCollaboratorSystem(
                  event.id,
                  collabSys as typeof event.ownerSystemId,
                );
                setCollabSys('');
                setMsg(
                  r.ok ? 'Collaborator system added' : (r.reason ?? 'Failed'),
                );
                refresh();
              }}
            >
              Add system
            </button>
            <select
              value={collabPerson}
              onChange={(e) => setCollabPerson(e.target.value)}
            >
              <option value="">Add person…</option>
              {PEOPLE.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.preferredName || p.fullName}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn secondary"
              disabled={!collabPerson}
              onClick={async () => {
                const r = await writeAddEventCollaboratorPerson(
                  event.id,
                  collabPerson,
                );
                setCollabPerson('');
                setMsg(
                  r.ok ? 'Collaborator person added' : (r.reason ?? 'Failed'),
                );
                refresh();
              }}
            >
              Add person
            </button>
          </div>
          {event.programId && (
            <p className="muted" style={{ marginBottom: 0 }}>
              Linked program:{' '}
              <Link to={`/programs/${event.programId}`}>
                {missionService.getProgram(event.programId)?.name ??
                  event.programId}
              </Link>
            </p>
          )}
          {event.projectId && (
            <p className="muted" style={{ marginBottom: 0 }}>
              Linked project:{' '}
              <Link to={`/projects/${event.projectId}`}>
                {missionService.getProject(event.projectId)?.name ??
                  event.projectId}
              </Link>
            </p>
          )}
          <form
            className="row"
            style={{ marginTop: '0.5rem' }}
            onSubmit={(e) => {
              e.preventDefault();
              const r = missionService.linkEventToProject(
                event.id,
                linkProjectId || null,
              );
              setMsg(
                r.ok
                  ? linkProjectId
                    ? 'Linked to project (+ planned delivery)'
                    : 'Project link cleared'
                  : (r.reason ?? 'Failed'),
              );
              refresh();
            }}
          >
            <select
              value={linkProjectId || event.projectId || ''}
              onChange={(e) => setLinkProjectId(e.target.value)}
            >
              <option value="">No project</option>
              {missionService
                .listProjects({ viewerSystemId: event.ownerSystemId })
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <button type="submit" className="btn ghost">
              Save project link
            </button>
          </form>
        </div>
      )}

      {event.beyondOwnerScope && (
        <div className="panel" id="approvals">
          <h3>Approval chain</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Every level must approve before the event is confirmed.
          </p>
          <ApprovalRecord
            routeLabel="Beyond owner scope · event chain"
            gateHint="Every level must approve before the event is confirmed."
            completeHint="All levels approved — event is confirmed."
            timeline={(event.approvals ?? []).map((a) => ({
              id: `${a.levelKey}-${a.approvedAt}`,
              at: a.approvedAt.slice(0, 10),
              label: a.label,
              detail: personName(a.personId),
            }))}
            steps={chain.map((level) => {
              const done = (event.approvals ?? []).some(
                (a) => a.levelKey === level.levelKey,
              );
              const canHere = canApproveEventLevel(level, roles, positions);
              const approver = (event.approvals ?? []).find(
                (a) => a.levelKey === level.levelKey,
              );
              return {
                key: level.levelKey,
                label: level.label,
                done,
                detail:
                  done && approver ? personName(approver.personId) : undefined,
                action:
                  !done && canHere ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void doApprove(level.levelKey)}
                    >
                      Approve
                    </button>
                  ) : undefined,
              };
            })}
          />
        </div>
      )}

      {regMode === 'REGISTRATION_REQUIRED' && openForReg && (
        <div className="panel">
          <h3>Registration</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {activeRegs}
            {event.capacity ? ` / ${event.capacity}` : ''} seated
            {waitlisted > 0 ? ` · ${waitlisted} waitlisted` : ''}
          </p>
          {!myReg || myReg.status === 'CANCELLED' ? (
            <button type="button" className="btn" onClick={() => void doRegister()}>
              Register myself
            </button>
          ) : (
            <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <p className="badge" style={{ margin: 0 }}>
                You are {myReg.status.toLowerCase()}
                {offerWindowLabel(myReg) ? ` · ${offerWindowLabel(myReg)}` : ''}
              </p>
              {myReg.status !== 'ATTENDED' && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void doCancel(account.personId)}
                >
                  Cancel my spot
                </button>
              )}
            </div>
          )}
          {activePeople.length > 0 && (
            <table className="table" style={{ marginTop: '0.75rem' }}>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Status</th>
                  <th>Offer</th>
                  {showOps && <th />}
                </tr>
              </thead>
              <tbody>
                {activePeople.map((r) => (
                  <tr key={r.id}>
                    <td>{personName(r.personId)}</td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                    <td className="muted">{offerWindowLabel(r) ?? '—'}</td>
                    {showOps && (
                      <td>
                        {r.status !== 'ATTENDED' && (
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => void doCancel(r.personId)}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showOps &&
        regMode === 'REGISTRATION_REQUIRED' &&
        (event.status === 'CONFIRMED' ||
          event.lifecyclePhase === 'DELIVER' ||
          event.status === 'COMPLETED') && (
          <div className="panel">
            <h3>Check-in</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              {checked} checked in · {expected.length} expected
              {expected.length - checked > 0
                ? ` · ${expected.length - checked} remaining`
                : ''}
            </p>
            {expected.length === 0 ? (
              <p className="muted">No seated registrations yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {expected.map((r) => (
                    <tr key={r.id}>
                      <td>{personName(r.personId)}</td>
                      <td>
                        <StatusPill status={r.status} />
                      </td>
                      <td>
                        {r.status !== 'ATTENDED' && r.status !== 'NO_SHOW' && (
                          <span className="row" style={{ gap: '0.35rem' }}>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => void doAttend(r.personId, true)}
                            >
                              Check in
                            </button>
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => void doAttend(r.personId, false)}
                            >
                              No-show
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      {showOps &&
        (event.status === 'CONFIRMED' ||
          opState === 'LIVE' ||
          opState === 'CLOSING') && (
          <div className="panel">
            <h3>Complete event</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Remaining REGISTERED seats become NO_SHOW. Then use follow-up
              enroll.
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => void doComplete()}
            >
              Mark completed
            </button>
          </div>
        )}

      {(event.status === 'COMPLETED' ||
        (showOps && event.lifecyclePhase === 'CLOSE')) && (
        <div className="panel">
          <h3>
            {event.status === 'COMPLETED'
              ? 'Post-event follow-up'
              : 'Close-out follow-up'}
          </h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {event.status === 'COMPLETED'
              ? 'Guided next steps for people who attended (enroll + follow-up task).'
              : 'Finish check-in, then complete the event — or start follow-up for anyone already attended.'}
          </p>
          {event.type === 'BAPTISM' && (
            <label className="row">
              <input
                type="checkbox"
                checked={enrollProgram}
                onChange={(e) => setEnrollProgram(e.target.checked)}
              />
              Enroll in Baptism class (
              {activePrograms.find((p) => p.id === 'prg-baptism-standing')
                ?.name ?? 'standing'}
              )
            </label>
          )}
          <div className="row">
            <select
              value={nextPersonId}
              onChange={(e) => setNextPersonId(e.target.value)}
            >
              <option value="">Select attended person…</option>
              {regs
                .filter((r) => r.status === 'ATTENDED' || r.attendedAt)
                .map((r) => (
                  <option key={r.id} value={r.personId}>
                    {personName(r.personId)}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={!nextPersonId || event.status !== 'COMPLETED'}
              onClick={() => void doNextSteps()}
            >
              Apply next steps
            </button>
          </div>
          {event.status !== 'COMPLETED' && (
            <p
              className="muted"
              style={{ marginBottom: 0, fontSize: '0.85rem' }}
            >
              Complete the event to unlock next-steps writes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
