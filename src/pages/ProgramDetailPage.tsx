import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { isApiEnabled } from '../api';
import { apiGetProgramPulse, type ApiPulse } from '../api/missionApi';
import { useAuth } from '../auth/AuthContext';
import { MissionPulsePanel } from '../components/MissionPulsePanel';
import { DeliveryPanel } from '../components/DeliveryPanel';
import { StatusPill } from '../components/ui/StatusPill';
import { useToast } from '../components/ui/Toast';
import {
  upsertHealthSnapshot,
} from '../domain/stewardship';
import { computeMissionHealth } from '../domain/missionHealth';
import {
  indicatorProgress,
  latestValue,
} from '../domain/impact';
import { templatesForProgramType } from '../domain/taskTemplates';
import { nextWeeklyOccurrence } from '../domain/checkInQr';
import type { AttendanceStatus, MembershipType } from '../domain/types';
import { reportsService } from '../services/reportsService';
import { missionListPath } from '../navigation/missionPaths';
import {
  isChurchLeader,
  missionService,
  peopleService,
  systemsService,
} from '../services';
import {
  hydrateProgramDetailFromApi,
  writeApproveProgram,
  writeBeginCloseProgram,
  writeCreateActivity,
  writeEnroll,
  writeMarkAttendance,
  writeStartProgram,
  writeSubmitProgram,
} from '../services/missionWrite';

export function ProgramDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const listPath = missionListPath(location.pathname, 'programs');
  const navigate = useNavigate();
  const { account, can, roles, refreshSession } = useAuth();
  const { push: toast } = useToast();
  const [, setTick] = useState(0);
  const refresh = () => {
    void (async () => {
      if (id) await hydrateProgramDetailFromApi(id);
      setTick((t) => t + 1);
      refreshSession();
    })();
  };
  const [msg, setMsg] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const hydrated = await hydrateProgramDetailFromApi(id);
      if (!cancelled && hydrated) setTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const program = id ? missionService.getProgram(id) : null;
  const canView = can('PROGRAM', 'VIEW');
  const canManageOutside = can('PROGRAM', 'MANAGE');
  const canRecord = can('ACTIVITY', 'RECORD_ATTENDANCE');
  const churchLead = isChurchLeader(roles);

  const [enrollPersonId, setEnrollPersonId] = useState('');
  const [enrollRoleKey, setEnrollRoleKey] = useState('PARTICIPANT');
  const [sessTitle, setSessTitle] = useState('');
  const [sessAt, setSessAt] = useState('2026-09-21T15:00');
  const [sessLoc, setSessLoc] = useState('');
  const [customRoleKey, setCustomRoleKey] = useState('');
  const [customRoleLabel, setCustomRoleLabel] = useState('');

  /** Option B panel for a completed enrollment */
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [issueCert, setIssueCert] = useState(true);
  const [addMem, setAddMem] = useState(false);
  const [memType, setMemType] = useState<MembershipType>('CHURCH_MEMBER');
  const [doBaptism, setDoBaptism] = useState(false);
  const [bapDate, setBapDate] = useState('2026-09-08');
  const [bapPlace, setBapPlace] = useState('ADEPR Kacyiru');
  const [tab, setTab] = useState<
    | 'pulse'
    | 'roster'
    | 'sessions'
    | 'about'
    | 'roles'
    | 'delivery'
    | 'impact'
  >('pulse');
  const [objTitle, setObjTitle] = useState('');
  const [valueObjId, setValueObjId] = useState('');
  const [valueIndId, setValueIndId] = useState('');
  const [valueNum, setValueNum] = useState('');
  const [pulse, setPulse] = useState<ApiPulse | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      if (isApiEnabled()) {
        try {
          const p = await apiGetProgramPulse(id);
          if (!cancelled) {
            setPulse({
              ...p,
              impact: p.impact ?? { participantsServed: reportsService.participantsServed(id) },
            });
          }
          return;
        } catch {
          /* local */
        }
      }
      const prog = missionService.getProgram(id);
      if (!prog || cancelled) return;
      const acts = missionService.activitiesForProgram(id);
      const nextSession = [...acts].sort((a, b) =>
        a.startsAt.localeCompare(b.startsAt),
      )[0];
      const health = computeMissionHealth(prog, { status: prog.status });
      const today = new Date().toISOString().slice(0, 10);
      if (
        prog.status !== 'ENDED' &&
        !(prog.healthSnapshots ?? []).some((h) => h.date === today)
      ) {
        const patched = upsertHealthSnapshot(prog, {
          date: today,
          score: health.score,
          tone: health.tone,
          label: health.label,
          parts: health.parts,
        });
        missionService.updateProgram(id, {
          healthSnapshots: patched.healthSnapshots,
        });
      }
      const live = missionService.getProgram(id) ?? prog;
      setPulse({
        kind: 'PROGRAM',
        id: live.id,
        name: live.name,
        status: live.status,
        health,
        openRequiredDelivery: (live.deliveryItems ?? [])
          .filter((d) => d.tier === 'REQUIRED' && d.status === 'TODO')
          .map((d) => ({ id: d.id, title: d.title, status: d.status })),
        nextSession: nextSession
          ? {
              id: nextSession.id,
              title: nextSession.title,
              startsAt: nextSession.startsAt,
              sessionClosedAt: nextSession.sessionClosedAt,
            }
          : null,
        needsMeHints: [],
        healthSnapshots: (live.healthSnapshots ?? []).slice(-14).map((h) => ({
          date: h.date,
          score: h.score,
          tone: h.tone,
          label: h.label,
        })),
        impact: { participantsServed: reportsService.participantsServed(live.id) },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!account || !canView) {
    return (
      <div className="panel">
        <p className="error">No access</p>
        <Link to={listPath}>Back</Link>
      </div>
    );
  }
  if (!program) {
    return (
      <div className="panel">
        <h2>Program not found</h2>
        <Link to={listPath}>Back</Link>
      </div>
    );
  }

  const programRoles = missionService.ensureProgramRoles(program.id);
  const myRole = missionService.enrollmentRole(program.id, account.personId);
  const insideOpen = program.status === 'ACTIVE';
  const canManageEnroll =
    (insideOpen &&
      missionService.canInProgram(
        program.id,
        account.personId,
        'MANAGE_ENROLL',
      )) ||
    (!insideOpen && canManageOutside) ||
    canManageOutside;
  const canManageSessions =
    (insideOpen &&
      missionService.canInProgram(
        program.id,
        account.personId,
        'MANAGE_SESSIONS',
      )) ||
    canRecord ||
    canManageOutside;
  const canClose =
    missionService.canInProgram(program.id, account.personId, 'CLOSE_PROGRAM') ||
    canManageOutside;
  const canManageRoles =
    missionService.canInProgram(program.id, account.personId, 'MANAGE_ROLES') ||
    canManageOutside;

  const parent = program.parentProgramId
    ? missionService.getProgram(program.parentProgramId)
    : null;
  const cohorts = missionService.cohortsOf(program.id);
  const childProjects = missionService.projectsForProgram(program.id);
  const enrollments = missionService.listEnrollments(program.id);
  const activities = missionService.activitiesForProgram(program.id);
  const people = peopleService.list();
  const poolSystems = missionService.audiencePoolSystems(program.ownerSystemId);

  async function onSubmitApproval() {
    const r = await writeSubmitProgram(program!.id);
    setMsg(r.ok ? 'Submitted for approval' : (r.reason ?? 'Failed'));
    refresh();
  }

  async function onApprove() {
    const r = await writeApproveProgram(
      program!.id,
      account!.personId,
      roles,
    );
    const text = r.ok
      ? 'Approved — SETUP (prep before run)'
      : (r.reason ?? 'Failed');
    setMsg(text);
    toast({
      title: r.ok ? 'Program approved' : 'Could not approve',
      detail: text,
      tone: r.ok ? 'success' : 'danger',
    });
    refresh();
  }

  async function onEnd() {
    const r = await writeBeginCloseProgram(program!.id);
    if (r.ok) setCloseOpen(true);
    else setMsg(r.reason ?? 'Failed');
    refresh();
  }

  async function onEnroll(e: FormEvent) {
    e.preventDefault();
    if (!enrollPersonId) return;
    const roleDef = programRoles.find((r) => r.key === enrollRoleKey);
    const r = await writeEnroll({
      programId: program!.id,
      personId: enrollPersonId,
      roleKey: enrollRoleKey,
      role: roleDef?.isStaff ? 'LEADER' : 'PARTICIPANT',
      staffBypass: !!roleDef?.isStaff,
    });
    setMsg(r.ok ? 'Enrolled' : (r.reason ?? 'Failed'));
    setEnrollPersonId('');
    refresh();
  }

  async function onAddSession(e: FormEvent) {
    e.preventDefault();
    const r = await writeCreateActivity({
      programId: program!.id,
      title: sessTitle || `Session ${sessAt}`,
      startsAt: new Date(sessAt).toISOString(),
      location: sessLoc || undefined,
    });
    setMsg(r.ok ? 'Session added' : (r.reason ?? 'Failed'));
    setSessTitle('');
    refresh();
  }

  async function onSpawnWeekly() {
    const last = activities[activities.length - 1];
    if (!last) {
      setMsg('Add a session first');
      return;
    }
    const next = nextWeeklyOccurrence(last.startsAt, 1)[0];
    if (!next) {
      setMsg('Could not compute next weekly occurrence');
      return;
    }
    const seriesId = last.seriesId ?? `aser-${program!.id}`;
    const seriesLabel = last.seriesLabel ?? `${program!.name} weekly`;
    const when = new Date(next);
    const title =
      last.title.replace(/\s—\s.+$/, '') +
      ` — ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    const r = await writeCreateActivity({
      programId: program!.id,
      title,
      startsAt: next,
      location: last.location,
      seriesId,
      seriesLabel,
    });
    setMsg(r.ok ? 'Spawned next weekly session' : (r.reason ?? 'Failed'));
    refresh();
  }

  async function markAttend(
    activityId: string,
    personId: string,
    status: AttendanceStatus,
  ) {
    await writeMarkAttendance({ activityId, personId, status });
    setMsg(`Attendance: ${status}`);
    refresh();
  }

  function runComplete(e: FormEvent) {
    e.preventDefault();
    if (!completeId || !account) return;
    const r = missionService.completeEnrollment({
      enrollmentId: completeId,
      issueCertificate: issueCert,
      actorPersonId: account.personId,
      nextSteps: {
        addMembershipType: addMem ? memType : undefined,
        membershipLabel: addMem ? 'Church member' : undefined,
        updateBaptism: doBaptism
          ? { baptizedOn: bapDate, place: bapPlace }
          : undefined,
      },
    });
    setMsg(
      r.ok
        ? 'Completed — timeline/certificate saved; confirmed next steps applied'
        : (r.reason ?? 'Failed'),
    );
    setCompleteId(null);
    setAddMem(false);
    setDoBaptism(false);
    refresh();
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="muted" style={{ margin: 0 }}>
              <Link to={listPath}>← Programs</Link>
            </p>
            <h2 style={{ margin: '0.35rem 0' }}>{program.name}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {program.description}
            </p>
          </div>
          <div className="row">
            <StatusPill status={program.status}>{program.status}</StatusPill>
            {program.programType && (
              <span className="badge">{program.programType}</span>
            )}
            {program.cohortLabel && (
              <span className="badge">{program.cohortLabel}</span>
            )}
          </div>
        </div>
        <p className="muted">
          Owner:{' '}
          {systemsService.getById(program.ownerSystemId)?.shortName ??
            program.ownerSystemId}
          {parent ? (
            <>
              {' '}
              · Under{' '}
              <Link to={`/programs/${parent.id}`}>{parent.name}</Link>
            </>
          ) : null}
          {program.scheduleHint ? ` · ${program.scheduleHint}` : ''}
        </p>
        {myRole && (
          <p className="badge" style={{ marginTop: '0.5rem' }}>
            Your program role: {myRole.label}
            {myRole.isStaff ? ' (staff)' : ''}
          </p>
        )}
        <div className="row">
          {canManageOutside && program.status === 'DRAFT' && (
            <button type="button" className="btn" onClick={onSubmitApproval}>
              Submit for approval
            </button>
          )}
          {churchLead &&
            (program.status === 'PENDING_APPROVAL' ||
              program.status === 'DRAFT') && (
              <button type="button" className="btn" onClick={onApprove}>
                Approve → SETUP
              </button>
            )}
          {canManageOutside && program.status === 'SETUP' && (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const r = await writeStartProgram(program.id);
                setMsg(
                  r.ok
                    ? [
                        'Program started — ACTIVE',
                        r.openRequired
                          ? `(${r.openRequired} required delivery still open)`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')
                    : (r.reason ?? 'Failed'),
                );
                refresh();
              }}
            >
              Start running
            </button>
          )}
          {canManageOutside && program.status === 'ACTIVE' && (
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  missionService.pauseProgram(program.id);
                  refresh();
                }}
              >
                Pause
              </button>
              {canClose && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setTab('delivery');
                    onEnd();
                  }}
                >
                  Begin close-out
                </button>
              )}
            </>
          )}
          {canClose && program.status === 'CLOSING' && (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTab('delivery');
                  setCloseOpen(true);
                }}
              >
                Finish close-out…
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  const r = missionService.abandonCloseProgram(program.id);
                  setMsg(r.ok ? 'Resumed ACTIVE' : (r.reason ?? 'Failed'));
                  refresh();
                }}
              >
                Resume running
              </button>
            </>
          )}
          {canManageOutside && program.status === 'PAUSED' && (
            <>
              <button type="button" className="btn" onClick={onSubmitApproval}>
                Re-submit / resume path
              </button>
              {canClose && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setTab('delivery');
                    onEnd();
                  }}
                >
                  Begin close-out
                </button>
              )}
            </>
          )}
        </div>
        {program.status === 'CLOSING' && (
          <p className="steward-banner warn" style={{ marginTop: '0.75rem' }}>
            In CLOSING — complete the close-out report, or resume running.
          </p>
        )}
      </div>

      {msg && (
        <p className="steward-banner" role="status">
          {msg}
        </p>
      )}

      {cohorts.length > 0 && (
        <div className="panel">
          <h3>Cohorts under this standing program</h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {cohorts.map((c) => (
              <li key={c.id}>
                <Link to={`/programs/${c.id}`}>{c.name}</Link>{' '}
                <span className="muted">
                  {c.cohortLabel} · {c.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {childProjects.length > 0 && (
        <div className="panel">
          <h3>Projects under this programme</h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {childProjects.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`}>{p.name}</Link>{' '}
                <span className="muted">· {p.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row">
        <button
          type="button"
          className={`btn ${tab === 'pulse' ? '' : 'ghost'}`}
          onClick={() => setTab('pulse')}
        >
          Pulse
        </button>
        <button
          type="button"
          className={`btn ${tab === 'roster' ? '' : 'ghost'}`}
          onClick={() => setTab('roster')}
        >
          Roster ({enrollments.length})
        </button>
        <button
          type="button"
          className={`btn ${tab === 'sessions' ? '' : 'ghost'}`}
          onClick={() => setTab('sessions')}
        >
          Sessions ({activities.length})
        </button>
        <button
          type="button"
          className={`btn ${tab === 'delivery' ? '' : 'ghost'}`}
          onClick={() => setTab('delivery')}
        >
          Delivery
        </button>
        <button
          type="button"
          className={`btn ${tab === 'impact' ? '' : 'ghost'}`}
          onClick={() => setTab('impact')}
        >
          Impact
        </button>
        <button
          type="button"
          className={`btn ${tab === 'about' ? '' : 'ghost'}`}
          onClick={() => setTab('about')}
        >
          About
        </button>
        <button
          type="button"
          className={`btn ${tab === 'roles' ? '' : 'ghost'}`}
          onClick={() => setTab('roles')}
        >
          Roles ({programRoles.length})
        </button>
      </div>

      {tab === 'pulse' && (
        <div className="panel">
          {pulse ? (
            <MissionPulsePanel
              pulse={pulse}
              sessionHref={
                pulse.nextSession && !pulse.nextSession.sessionClosedAt
                  ? `/programs/${program.id}/sessions/${pulse.nextSession.id}`
                  : undefined
              }
            />
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Loading pulse…
            </p>
          )}
        </div>
      )}

      {(tab === 'delivery' || closeOpen || !!program.closeout) && (
        <DeliveryPanel
          kind="PROGRAM"
          id={program.id}
          canEdit={canManageOutside || canClose}
          personId={account.personId}
          closeOpen={closeOpen}
          onCloseOpenChange={setCloseOpen}
          onChanged={() => {
            refresh();
            setMsg('Delivery updated');
          }}
        />
      )}

      {tab === 'impact' && (
        <div className="panel stack">
          <h3 style={{ margin: 0 }}>Impact</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Objectives → indicators → values. People served{' '}
            {reportsService.participantsServed(program.id)}.
          </p>
          {(program.objectives ?? []).length === 0 ? (
            <p className="muted">No objectives yet.</p>
          ) : (
            (program.objectives ?? []).map((obj) => (
              <div key={obj.id}>
                <strong>{obj.title}</strong>
                {obj.description && (
                  <p className="muted" style={{ margin: '0.25rem 0' }}>
                    {obj.description}
                  </p>
                )}
                <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
                  {obj.indicators.map((ind) => {
                    const latest = latestValue(obj, ind.id);
                    const prog = indicatorProgress(ind, latest);
                    return (
                      <li key={ind.id}>
                        {ind.label}:{' '}
                        <strong>
                          {latest ? String(latest.value) : '—'}
                        </strong>
                        {ind.target != null ? ` / ${ind.target}` : ''}
                        {prog != null ? ` (${prog}%)` : ''}
                        {latest?.asOf ? (
                          <span className="muted"> · as of {latest.asOf}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          {canManageOutside && (
            <>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!objTitle.trim()) return;
                  const id = `obj-${Date.now().toString(36)}`;
                  const r = missionService.upsertProgramObjective(program.id, {
                    id,
                    title: objTitle.trim(),
                    indicators: [
                      {
                        id: `ind-${Date.now().toString(36)}`,
                        label: 'Primary count',
                        kind: 'COUNT',
                        target: 10,
                      },
                    ],
                    values: [],
                  });
                  setMsg(r.ok ? 'Objective added' : (r.reason ?? 'Failed'));
                  if (r.ok) setObjTitle('');
                  refresh();
                }}
              >
                <input
                  placeholder="New objective title"
                  value={objTitle}
                  onChange={(e) => setObjTitle(e.target.value)}
                  required
                />
                <button type="submit" className="btn ghost">
                  Add objective
                </button>
              </form>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!valueObjId || !valueIndId) return;
                  const r = missionService.recordImpactValue(
                    program.id,
                    valueObjId,
                    {
                      indicatorId: valueIndId,
                      asOf: new Date().toISOString().slice(0, 10),
                      value: Number(valueNum) || 0,
                      recordedByPersonId: account.personId,
                    },
                  );
                  setMsg(r.ok ? 'Value recorded' : (r.reason ?? 'Failed'));
                  if (r.ok) setValueNum('');
                  refresh();
                }}
              >
                <select
                  value={valueObjId}
                  onChange={(e) => {
                    setValueObjId(e.target.value);
                    setValueIndId('');
                  }}
                >
                  <option value="">Objective…</option>
                  {(program.objectives ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
                <select
                  value={valueIndId}
                  onChange={(e) => setValueIndId(e.target.value)}
                >
                  <option value="">Indicator…</option>
                  {(
                    (program.objectives ?? []).find((o) => o.id === valueObjId)
                      ?.indicators ?? []
                  ).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Value"
                  value={valueNum}
                  onChange={(e) => setValueNum(e.target.value)}
                  inputMode="numeric"
                  style={{ maxWidth: '6rem' }}
                  required
                />
                <button type="submit" className="btn">
                  Record
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {tab === 'about' && (
        <div className="panel stack">
          <h3 style={{ margin: 0 }}>About</h3>
          <p style={{ marginTop: 0 }}>
            {program.description || 'No description.'}
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Visibility {program.visibility}
            {program.scheduleHint ? ` · ${program.scheduleHint}` : ''}
          </p>
          <div>
            <h4 style={{ marginBottom: '0.35rem' }}>Audience pool</h4>
            <p className="muted" style={{ marginTop: 0 }}>
              Owner system + descendants:{' '}
              {poolSystems
                .map((sid) => systemsService.getById(sid)?.shortName ?? sid)
                .join(', ')}
            </p>
            <p className="muted">
              Membership in the pool alone does not grant see/join — eligibility
              still applies.
            </p>
          </div>
          {program.eligibility && (
            <div>
              <h4 style={{ marginBottom: '0.35rem' }}>Eligibility</h4>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {program.eligibility.minAge != null && (
                  <li>Min age {program.eligibility.minAge}</li>
                )}
                {program.eligibility.maxAge != null && (
                  <li>Max age {program.eligibility.maxAge}</li>
                )}
                {program.eligibility.requireMarried && <li>Married required</li>}
                {program.eligibility.requireInviteOnly && (
                  <li>Invite only</li>
                )}
              </ul>
            </div>
          )}
          {canManageOutside &&
            program.status !== 'ENDED' &&
            program.status !== 'CLOSING' && (
            <div>
              <h4 style={{ marginBottom: '0.35rem' }}>Spawn checklist</h4>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const tpl = (
                    e.currentTarget.elements.namedItem(
                      'tpl',
                    ) as HTMLSelectElement
                  ).value;
                  const r = missionService.spawnTasksFromTemplate({
                    templateId: tpl,
                    ownerPersonId: account.personId,
                    createdByPersonId: account.personId,
                    systemId: program.ownerSystemId,
                    contextType: 'PROGRAM',
                    contextId: program.id,
                    contextLabel: program.name,
                  });
                  setMsg(
                    r.ok
                      ? `Spawned ${r.tasks?.length ?? 0} tasks`
                      : (r.reason ?? 'Failed'),
                  );
                  refresh();
                }}
              >
                <select name="tpl">
                  {templatesForProgramType(program.programType).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} ({t.items.length})
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn ghost">
                  Spawn tasks
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {tab === 'roles' && (
        <div className="panel stack">
          <h3 style={{ margin: 0 }}>Program roles</h3>
          <p className="muted" style={{ margin: 0 }}>
            Inside this open program, permissions follow these roles — not system
            office.
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {programRoles.map((r) => (
              <li key={r.key}>
                <strong>{r.label}</strong> ({r.key})
                {r.isStaff ? ' · staff' : ''} — {r.permissions.join(', ')}
              </li>
            ))}
          </ul>
          {canManageRoles && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!customRoleKey.trim() || !customRoleLabel.trim()) return;
                const r = missionService.addProgramRole(program.id, {
                  key: customRoleKey.trim().toUpperCase().replace(/\s+/g, '_'),
                  label: customRoleLabel.trim(),
                  permissions: ['PARTICIPATE', 'VIEW_ROSTER'],
                });
                setMsg(r.ok ? 'Role added' : (r.reason ?? 'Failed'));
                setCustomRoleKey('');
                setCustomRoleLabel('');
                refresh();
              }}
            >
              <input
                placeholder="Key (e.g. MENTOR)"
                value={customRoleKey}
                onChange={(e) => setCustomRoleKey(e.target.value)}
                required
              />
              <input
                placeholder="Label"
                value={customRoleLabel}
                onChange={(e) => setCustomRoleLabel(e.target.value)}
                required
              />
              <button type="submit" className="btn">
                Add custom role
              </button>
            </form>
          )}
        </div>
      )}

      {tab === 'roster' && (
      <div className="panel">
        <h3>Roster</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Status</th>
              <th>Enrolled</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {enrollments.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No enrollments
                </td>
              </tr>
            ) : (
              enrollments.map((en) => (
                <tr key={en.id}>
                  <td>
                    {peopleService.getById(en.personId)?.preferredName ??
                      en.personId}
                  </td>
                  <td>{en.roleKey ?? en.role}</td>
                  <td>{en.status}</td>
                  <td>{en.enrolledOn}</td>
                  <td>
                    {canManageEnroll && en.status === 'ACTIVE' && (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setCompleteId(en.id)}
                      >
                        Complete…
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {canManageEnroll &&
          (program.status === 'ACTIVE' ||
            program.status === 'SETUP' ||
            program.status === 'PENDING_APPROVAL') && (
            <form className="row" onSubmit={onEnroll} style={{ marginTop: '0.75rem' }}>
              <select
                value={enrollPersonId}
                onChange={(e) => setEnrollPersonId(e.target.value)}
                required
              >
                <option value="">Add person…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.preferredName || p.fullName}
                  </option>
                ))}
              </select>
              <select
                value={enrollRoleKey}
                onChange={(e) => setEnrollRoleKey(e.target.value)}
              >
                {programRoles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn">
                Enroll
              </button>
            </form>
          )}
      </div>
      )}

      {tab === 'roster' && completeId && (
        <div className="panel">
          <h3>Complete enrollment — Option B</h3>
          <p className="muted">
            Always writes timeline (+ certificate if checked). Extra steps only
            if you confirm below.
          </p>
          <form className="stack" onSubmit={runComplete}>
            <label className="row">
              <input
                type="checkbox"
                checked={issueCert}
                onChange={(e) => setIssueCert(e.target.checked)}
              />
              Issue certificate document
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={addMem}
                onChange={(e) => setAddMem(e.target.checked)}
              />
              Add membership
            </label>
            {addMem && (
              <select
                value={memType}
                onChange={(e) =>
                  setMemType(e.target.value as MembershipType)
                }
              >
                <option value="CHURCH_MEMBER">Church member</option>
                <option value="YOUTH_MEMBER">Youth member</option>
                <option value="CHOIR_MEMBER">Choir member</option>
              </select>
            )}
            <label className="row">
              <input
                type="checkbox"
                checked={doBaptism}
                onChange={(e) => setDoBaptism(e.target.checked)}
              />
              Update baptism record
            </label>
            {doBaptism && (
              <div className="grid-2">
                <input
                  type="date"
                  value={bapDate}
                  onChange={(e) => setBapDate(e.target.value)}
                />
                <input
                  value={bapPlace}
                  onChange={(e) => setBapPlace(e.target.value)}
                  placeholder="Place"
                />
              </div>
            )}
            <div className="row">
              <button type="submit" className="btn">
                Confirm complete
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setCompleteId(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'sessions' && (
      <div className="panel">
        <h3>Sessions</h3>
        {program.status !== 'ACTIVE' && (
          <p className="muted">Sessions can be added when status is ACTIVE.</p>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>Session</th>
              <th>When</th>
              <th>Location</th>
              <th>Attendance</th>
            </tr>
          </thead>
          <tbody>
            {activities.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No sessions
                </td>
              </tr>
            ) : (
              activities.map((a) => {
                const summary = missionService.attendanceSummary(a.id);
                return (
                  <tr key={a.id}>
                    <td>
                      {a.title}
                      {a.sessionClosedAt ? (
                        <span className="muted"> · closed</span>
                      ) : null}
                    </td>
                    <td>{new Date(a.startsAt).toLocaleString()}</td>
                    <td>{a.location ?? '—'}</td>
                    <td>
                      {summary.total === 0
                        ? '—'
                        : `${summary.present}/${summary.total}`}
                      {canManageSessions && (
                        <div style={{ marginTop: '0.35rem' }}>
                          <Link to={`/programs/${program.id}/sessions/${a.id}`}>
                            Session Mode →
                          </Link>
                        </div>
                      )}
                      {canRecord &&
                        program.status === 'ACTIVE' &&
                        !a.sessionClosedAt &&
                        enrollments
                          .filter((en) => en.status === 'ACTIVE')
                          .slice(0, 3)
                          .map((en) => (
                            <div key={en.id} className="row">
                              <span className="muted">
                                {peopleService.getById(en.personId)
                                  ?.preferredName ?? en.personId}
                              </span>
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() =>
                                  markAttend(a.id, en.personId, 'PRESENT')
                                }
                              >
                                Present
                              </button>
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() =>
                                  markAttend(a.id, en.personId, 'ABSENT')
                                }
                              >
                                Absent
                              </button>
                            </div>
                          ))}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {canManageSessions &&
          (program.status === 'ACTIVE' || program.status === 'SETUP') && (
          <form className="stack" onSubmit={onAddSession} style={{ marginTop: '0.75rem' }}>
            <h4 style={{ margin: 0 }}>Add session</h4>
            <div className="grid-2">
              <input
                placeholder="Title"
                value={sessTitle}
                onChange={(e) => setSessTitle(e.target.value)}
              />
              <input
                type="datetime-local"
                value={sessAt}
                onChange={(e) => setSessAt(e.target.value)}
                required
              />
              <input
                placeholder="Location"
                value={sessLoc}
                onChange={(e) => setSessLoc(e.target.value)}
              />
            </div>
            <div className="row">
              <button type="submit" className="btn">
                Add session
              </button>
              {activities.length > 0 && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void onSpawnWeekly()}
                >
                  Spawn next weekly session
                </button>
              )}
            </div>
          </form>
        )}
      </div>
      )}

      <button type="button" className="btn ghost" onClick={() => navigate(-1)}>
        Back
      </button>
    </div>
  );
}

