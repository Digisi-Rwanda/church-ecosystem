import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { isApiEnabled } from '../api';
import { apiGetProjectPulse, type ApiPulse } from '../api/missionApi';
import { useAuth } from '../auth/AuthContext';
import { MissionPulsePanel } from '../components/MissionPulsePanel';
import { DeliveryPanel } from '../components/DeliveryPanel';
import { ApprovalRecord } from '../components/ui/ApprovalRecord';
import { StatusPill } from '../components/ui/StatusPill';
import { canApproveScopeLevel } from '../domain/eventScope';
import { computeMissionHealth } from '../domain/missionHealth';
import {
  blockerAgeDays,
  openBlockers,
} from '../domain/deliveryRisk';
import { projectTemplates } from '../domain/taskTemplates';
import {
  upsertHealthSnapshot,
} from '../domain/stewardship';
import type { SystemId } from '../domain/types';
import { missionListPath } from '../navigation/missionPaths';
import {
  isChurchLeader,
  missionService,
  peopleService,
  systemsService,
} from '../services';
import {
  writeAddProjectCollaboratorPerson,
  writeAddProjectCollaboratorSystem,
  writeApproveProject,
  writeApproveProjectLevel,
  writeBeginCloseProject,
  writeCancelProject,
  writeStartProject,
  writeSubmitProject,
} from '../services/missionWrite';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const listPath = missionListPath(location.pathname, 'projects');
  const { can, account, positions, roles, refreshSession } = useAuth();
  const [, setTick] = useState(0);
  const refresh = () => {
    setTick((t) => t + 1);
    refreshSession();
  };
  const [msg, setMsg] = useState('');
  const [pulse, setPulse] = useState<ApiPulse | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      if (isApiEnabled()) {
        try {
          const p = await apiGetProjectPulse(id);
          if (!cancelled) setPulse(p);
          return;
        } catch {
          /* local */
        }
      }
      const proj = missionService.getProject(id);
      if (!proj || cancelled) return;
      const health = computeMissionHealth(proj, { status: proj.status });
      const today = new Date().toISOString().slice(0, 10);
      if (
        proj.status !== 'DONE' &&
        proj.status !== 'CANCELLED' &&
        !(proj.healthSnapshots ?? []).some((h) => h.date === today)
      ) {
        const patched = upsertHealthSnapshot(proj, {
          date: today,
          score: health.score,
          tone: health.tone,
          label: health.label,
          parts: health.parts,
        });
        missionService.updateProject(id, {
          healthSnapshots: patched.healthSnapshots,
        });
      }
      const live = missionService.getProject(id) ?? proj;
      setPulse({
        kind: 'PROJECT',
        id: live.id,
        name: live.name,
        status: live.status,
        health,
        openRequiredDelivery: (live.deliveryItems ?? [])
          .filter((d) => d.tier === 'REQUIRED' && d.status === 'TODO')
          .map((d) => ({ id: d.id, title: d.title, status: d.status })),
        nextSession: null,
        needsMeHints: [],
        healthSnapshots: (live.healthSnapshots ?? []).slice(-14).map((h) => ({
          date: h.date,
          score: h.score,
          tone: h.tone,
          label: h.label,
        })),
        blockers: openBlockers(live.blockers).map((b) => ({
          id: b.id,
          title: b.title,
          severity: b.severity,
          status: b.status,
          ownerPersonId: b.ownerPersonId,
          createdAt: b.createdAt,
          ageDays: blockerAgeDays(b),
          deliveryItemId: b.deliveryItemId,
          taskId: b.taskId,
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);
  const [closeOpen, setCloseOpen] = useState(false);
  const [addSys, setAddSys] = useState<SystemId | ''>('');
  const [addPerson, setAddPerson] = useState('');
  const [linkProgramId, setLinkProgramId] = useState('');
  const [blockerTitle, setBlockerTitle] = useState('');
  const [blockerSeverity, setBlockerSeverity] = useState<'BLOCKER' | 'RISK'>(
    'BLOCKER',
  );
  const [blockerOwner, setBlockerOwner] = useState('');
  const [blockerDeliveryId, setBlockerDeliveryId] = useState('');
  const [blockerTaskId, setBlockerTaskId] = useState('');
  const [tplId, setTplId] = useState('tpl-project-kickoff');

  const project = id ? missionService.getProject(id) : null;

  if (!account || !can('PROJECT', 'VIEW')) {
    return (
      <div className="panel">
        <p className="muted">No access.</p>
        <Link to={listPath}>← Projects</Link>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="panel">
        <p>Project not found.</p>
        <Link to={listPath}>← Projects</Link>
      </div>
    );
  }

  const canManage = can('PROJECT', 'MANAGE');
  const churchLead = isChurchLeader(roles);
  const closed = project.status === 'DONE' || project.status === 'CANCELLED';
  const owner = systemsService.getById(project.ownerSystemId);
  const chain = missionService.projectApprovalChain(project.id);
  const openTasks = missionService.openTasksForProject(project.id);
  const linkedEvents = missionService.eventsForProject(project.id);
  const parentProgram = project.programId
    ? missionService.getProgram(project.programId)
    : null;
  const people = peopleService.list();
  const standingPrograms = missionService
    .listPrograms({ viewerSystemId: project.ownerSystemId })
    .filter((p) => !p.parentProgramId);
  const systems = systemsService
    .list()
    .filter(
      (s) =>
        s.id !== project.ownerSystemId &&
        !(project.collaboratorSystemIds ?? []).includes(s.id),
    );
  const collabCount =
    (project.collaboratorSystemIds ?? []).length +
    (project.collaboratorPersonIds ?? []).length;
  const deliveryRequired = (project.deliveryItems ?? []).filter(
    (d) => d.tier === 'REQUIRED',
  ).length;
  const deliveryPlanned = (project.deliveryItems ?? []).filter(
    (d) => d.tier === 'PLANNED',
  ).length;

  function personName(pid: string) {
    const p = peopleService.getById(pid);
    return p?.preferredName ?? p?.fullName ?? pid;
  }

  async function doApproveLevel(levelKey: string) {
    const r = await writeApproveProjectLevel({
      projectId: project!.id,
      levelKey,
      personId: account!.personId,
      positions,
      roles,
    });
    setMsg(
      r.ok
        ? r.project?.status === 'PLANNED'
          ? 'Chain complete — PLANNED (setup)'
          : 'Approval recorded'
        : (r.reason ?? 'Failed'),
    );
    refresh();
  }

  async function doCancel() {
    const r = await writeCancelProject(project!.id);
    setMsg(r.ok ? 'Cancelled — recorded' : (r.reason ?? 'Failed'));
    refresh();
  }

  async function doAddSys(e: FormEvent) {
    e.preventDefault();
    if (!addSys) return;
    const r = await writeAddProjectCollaboratorSystem(
      project!.id,
      addSys as SystemId,
    );
    setMsg(r.ok ? 'Collaborating system added' : (r.reason ?? 'Failed'));
    setAddSys('');
    refresh();
  }

  async function doAddPerson(e: FormEvent) {
    e.preventDefault();
    if (!addPerson) return;
    const r = await writeAddProjectCollaboratorPerson(project!.id, addPerson);
    setMsg(r.ok ? 'Collaborating person added' : (r.reason ?? 'Failed'));
    setAddPerson('');
    refresh();
  }

  function doLinkProgram(e: FormEvent) {
    e.preventDefault();
    missionService.updateProject(project!.id, {
      programId: linkProgramId || undefined,
    });
    setMsg(linkProgramId ? 'Linked to programme' : 'Programme link cleared');
    refresh();
  }

  return (
    <div className="stack">
      <p>
        <Link to={listPath}>← Projects</Link>
      </p>
      {msg && <p className="badge">{msg}</p>}

      <div className="detail-hero">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="hero-kicker">
              Project · {owner?.shortName ?? owner?.name} ·{' '}
              {project.beyondOwnerScope ? 'Beyond scope' : 'In-scope'}
              {parentProgram ? (
                <>
                  {' '}
                  · under{' '}
                  <Link to={`/programs/${parentProgram.id}`}>
                    {parentProgram.name}
                  </Link>
                </>
              ) : null}
            </p>
            <h2>{project.name}</h2>
          </div>
          <StatusPill status={project.status}>{project.status}</StatusPill>
        </div>
        {project.description && (
          <p className="muted" style={{ marginBottom: 0 }}>
            {project.description}
          </p>
        )}
        <div className="overview-strip">
          <div className="overview-tile">
            <div className="label">Lead</div>
            <div className="value">
              {project.leadPersonId
                ? personName(project.leadPersonId)
                : 'Not named'}
            </div>
          </div>
          <div className="overview-tile">
            <div className="label">Collaborators</div>
            <div className="value">{collabCount || 'Owner only'}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Delivery</div>
            <div className="value">
              {deliveryRequired || deliveryPlanned
                ? `${deliveryRequired} req · ${deliveryPlanned} planned`
                : '—'}
            </div>
          </div>
          <div className="overview-tile">
            <div className="label">Open tasks</div>
            <div className="value">{openTasks.length}</div>
          </div>
        </div>
        {project.outcomeNote && (
          <p style={{ marginBottom: 0, marginTop: '0.75rem' }}>
            <strong>Outcome:</strong> {project.outcomeNote}
          </p>
        )}
        <div className="row" style={{ marginTop: '0.75rem' }}>
          {canManage && project.status === 'DRAFT' && (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const r = await writeSubmitProject(project.id);
                setMsg(
                  r.ok ? 'Submitted for approval' : (r.reason ?? 'Failed'),
                );
                refresh();
              }}
            >
              Submit for approval
            </button>
          )}
          {churchLead &&
            project.status === 'PENDING_APPROVAL' &&
            !project.beyondOwnerScope && (
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const r = await writeApproveProject(
                    project.id,
                    account.personId,
                    roles,
                  );
                  setMsg(
                    r.ok
                      ? 'Approved — PLANNED (setup)'
                      : (r.reason ?? 'Failed'),
                  );
                  refresh();
                }}
              >
                Approve → SETUP
              </button>
            )}
          {canManage && project.status === 'PLANNED' && (
            <div className="stack" style={{ gap: '0.35rem' }}>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const r = await writeStartProject(project.id);
                  setMsg(
                    r.ok
                      ? [
                          'Project started — ACTIVE',
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
            </div>
          )}
          {canManage && project.status === 'ACTIVE' && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                const r = missionService.pauseProject(project.id);
                setMsg(r.ok ? 'Project paused' : (r.reason ?? 'Failed'));
                refresh();
              }}
            >
              Pause
            </button>
          )}
          {canManage && project.status === 'PAUSED' && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const r = missionService.resumeProject(project.id);
                setMsg(r.ok ? 'Project resumed — ACTIVE' : (r.reason ?? 'Failed'));
                refresh();
              }}
            >
              Resume
            </button>
          )}
        </div>
      </div>

      {project.beyondOwnerScope && (
        <div className="panel">
          <h3>Approval chain</h3>
          <ApprovalRecord
            routeLabel="Beyond owner scope · org chain"
            gateHint="Each level must approve before SETUP (PLANNED)."
            completeHint="All levels approved — project enters SETUP (PLANNED)."
            timeline={(project.approvals ?? []).map((a) => ({
              id: `${a.levelKey}-${a.approvedAt}`,
              at: a.approvedAt.slice(0, 10),
              label: a.label,
              detail: personName(a.personId),
            }))}
            steps={chain.map((level) => {
              const done = (project.approvals ?? []).some(
                (a) => a.levelKey === level.levelKey,
              );
              const canHere = canApproveScopeLevel(level, roles, positions);
              const approver = (project.approvals ?? []).find(
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
                      onClick={() => doApproveLevel(level.levelKey)}
                    >
                      Approve
                    </button>
                  ) : undefined,
              };
            })}
          />
        </div>
      )}

      {canManage && !closed && (
        <div className="panel">
          <h3>Parent programme</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Nest this season/cohort under an ongoing programme.
          </p>
          <form className="row" onSubmit={doLinkProgram}>
            <select
              value={linkProgramId || project.programId || ''}
              onChange={(e) => setLinkProgramId(e.target.value)}
            >
              <option value="">No parent programme</option>
              {standingPrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn ghost">
              Save link
            </button>
          </form>
        </div>
      )}

      {pulse && (
        <div className="panel">
          <MissionPulsePanel pulse={pulse} />
        </div>
      )}

      {canManage && !closed && (
        <div className="panel">
          <h3>Blockers & risks</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Age + owner on Pulse. Link to a delivery item or task when known.
          </p>
          {(project.blockers ?? []).length === 0 ? (
            <p className="muted">None open yet.</p>
          ) : (
            <ul className="steward-list">
              {(project.blockers ?? []).map((b) => (
                <li key={b.id}>
                  <div>
                    <strong>{b.title}</strong>{' '}
                    <span className="badge">{b.severity}</span>{' '}
                    <span className="badge">{b.status}</span>
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      Owner {personName(b.ownerPersonId)} ·{' '}
                      {blockerAgeDays(b)}d
                      {b.taskId ? ` · task ${b.taskId}` : ''}
                      {b.deliveryItemId
                        ? ` · delivery ${b.deliveryItemId}`
                        : ''}
                    </div>
                  </div>
                  {b.status !== 'RESOLVED' && (
                    <div className="row">
                      {b.status === 'OPEN' && (
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            missionService.setBlockerStatus(
                              'PROJECT',
                              project.id,
                              b.id,
                              'MITIGATING',
                            );
                            setMsg('Blocker → mitigating');
                            refresh();
                          }}
                        >
                          Mitigate
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          missionService.setBlockerStatus(
                            'PROJECT',
                            project.id,
                            b.id,
                            'RESOLVED',
                          );
                          setMsg('Blocker resolved');
                          refresh();
                        }}
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form
            className="stack"
            style={{ marginTop: '0.75rem' }}
            onSubmit={(e) => {
              e.preventDefault();
              const r = missionService.addBlocker('PROJECT', project.id, {
                title: blockerTitle,
                severity: blockerSeverity,
                ownerPersonId: blockerOwner || account.personId,
                deliveryItemId: blockerDeliveryId || undefined,
                taskId: blockerTaskId || undefined,
              });
              setMsg(r.ok ? 'Blocker added' : (r.reason ?? 'Failed'));
              if (r.ok) {
                setBlockerTitle('');
                setBlockerDeliveryId('');
                setBlockerTaskId('');
              }
              refresh();
            }}
          >
            <div className="row">
              <input
                placeholder="Blocker / risk title"
                value={blockerTitle}
                onChange={(e) => setBlockerTitle(e.target.value)}
                required
                style={{ flex: 1 }}
              />
              <select
                value={blockerSeverity}
                onChange={(e) =>
                  setBlockerSeverity(e.target.value as 'BLOCKER' | 'RISK')
                }
              >
                <option value="BLOCKER">Blocker</option>
                <option value="RISK">Risk</option>
              </select>
            </div>
            <div className="row">
              <select
                value={blockerOwner || account.personId}
                onChange={(e) => setBlockerOwner(e.target.value)}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    Owner: {p.preferredName ?? p.fullName}
                  </option>
                ))}
              </select>
              <select
                value={blockerDeliveryId}
                onChange={(e) => setBlockerDeliveryId(e.target.value)}
              >
                <option value="">Delivery item (optional)</option>
                {(project.deliveryItems ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
              <select
                value={blockerTaskId}
                onChange={(e) => setBlockerTaskId(e.target.value)}
              >
                <option value="">Task (optional)</option>
                {openTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn">
                Add
              </button>
            </div>
          </form>
        </div>
      )}

      {canManage && !closed && (
        <div className="panel">
          <h3>Spawn checklist from template</h3>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const r = missionService.spawnTasksFromTemplate({
                templateId: tplId,
                ownerPersonId: account.personId,
                createdByPersonId: account.personId,
                systemId: project.ownerSystemId,
                contextType: 'PROJECT',
                contextId: project.id,
                contextLabel: project.name,
              });
              setMsg(
                r.ok
                  ? `Spawned ${r.tasks?.length ?? 0} tasks`
                  : (r.reason ?? 'Failed'),
              );
              refresh();
            }}
          >
            <select
              value={tplId}
              onChange={(e) => setTplId(e.target.value)}
            >
              {projectTemplates().map((t) => (
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

      <DeliveryPanel
        kind="PROJECT"
        id={project.id}
        canEdit={canManage && !closed}
        personId={account.personId}
        closeOpen={closeOpen}
        onCloseOpenChange={setCloseOpen}
        openTaskCount={openTasks.length}
        onChanged={() => {
          refresh();
          setMsg('Delivery updated');
        }}
      />

      <div className="panel">
        <h3>Linked events</h3>
        {linkedEvents.length === 0 ? (
          <p className="muted">No events linked to this project yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {linkedEvents.map((ev) => (
              <li key={ev.id}>
                <Link to={`/events/${ev.id}`}>{ev.name}</Link>
                <span className="muted">
                  {' '}
                  · {new Date(ev.startsAt).toLocaleDateString()} · {ev.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h3>Collaborators (one shared project)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Owning system plus collaborating systems/people — not duplicate
          projects per system.
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          <li>
            <strong>{owner?.shortName}</strong> — owner
          </li>
          {(project.collaboratorSystemIds ?? []).map((sid) => (
            <li key={sid}>
              {systemsService.getById(sid)?.shortName ?? sid} — system
            </li>
          ))}
          {(project.collaboratorPersonIds ?? []).map((pid) => (
            <li key={pid}>{personName(pid)} — person</li>
          ))}
        </ul>
        {canManage && !closed && (
          <div className="stack" style={{ marginTop: '0.75rem' }}>
            <form className="row" onSubmit={doAddSys}>
              <select
                value={addSys}
                onChange={(e) => setAddSys(e.target.value as SystemId | '')}
              >
                <option value="">Add system…</option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shortName}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn" disabled={!addSys}>
                Add system
              </button>
            </form>
            <form className="row" onSubmit={doAddPerson}>
              <select
                value={addPerson}
                onChange={(e) => setAddPerson(e.target.value)}
              >
                <option value="">Add person…</option>
                {people
                  .filter(
                    (p) =>
                      !(project.collaboratorPersonIds ?? []).includes(p.id),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.preferredName ?? p.fullName}
                    </option>
                  ))}
              </select>
              <button type="submit" className="btn" disabled={!addPerson}>
                Add person
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Linked open tasks</h3>
        {openTasks.length === 0 ? (
          <p className="muted">No open tasks linked to this project.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {openTasks.map((t) => (
              <li key={t.id}>
                <Link to={`/tasks/${t.id}`}>{t.title}</Link>
                <span className="muted"> · {t.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && !closed && project.status === 'ACTIVE' && (
        <div className="panel">
          <h3>Close</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Enter CLOSING first — finish required delivery and money honesty,
            then complete the close-out report.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const r = await writeBeginCloseProject(project.id);
                setMsg(
                  r.ok
                    ? 'Entered CLOSING — finish checklist'
                    : (r.reason ?? 'Failed'),
                );
                setCloseOpen(true);
                refresh();
              }}
            >
              Begin close-out
            </button>
            <button type="button" className="btn ghost" onClick={doCancel}>
              Cancel project
            </button>
          </div>
        </div>
      )}
      {canManage && !closed && project.status === 'PAUSED' && (
        <div className="panel">
          <h3>Paused</h3>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                missionService.resumeProject(project.id);
                refresh();
              }}
            >
              Resume
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={async () => {
                await writeBeginCloseProject(project.id);
                setCloseOpen(true);
                refresh();
              }}
            >
              Begin close-out
            </button>
            <button type="button" className="btn ghost" onClick={doCancel}>
              Cancel project
            </button>
          </div>
        </div>
      )}
      {canManage && !closed && project.status === 'CLOSING' && (
        <div className="panel">
          <h3>Closing</h3>
          <p className="steward-banner warn" style={{ marginTop: 0 }}>
            In CLOSING — complete the close-out report, or resume running.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => setCloseOpen(true)}
            >
              Finish close-out…
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                const r = missionService.abandonCloseProject(project.id);
                setMsg(r.ok ? 'Resumed ACTIVE' : (r.reason ?? 'Failed'));
                refresh();
              }}
            >
              Resume running
            </button>
            <button type="button" className="btn ghost" onClick={doCancel}>
              Cancel project
            </button>
          </div>
        </div>
      )}
      {canManage &&
        !closed &&
        project.status !== 'ACTIVE' &&
        project.status !== 'CLOSING' &&
        project.status !== 'PAUSED' && (
          <div className="panel">
            <button type="button" className="btn ghost" onClick={doCancel}>
              Cancel project
            </button>
          </div>
        )}
    </div>
  );
}
