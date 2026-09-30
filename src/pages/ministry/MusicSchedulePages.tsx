import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Drawer } from '../../components/ui/Drawer';
import { PageHead } from '../../components/ui/FilterBar';
import { StatusPill } from '../../components/ui/StatusPill';
import type { MusicHorizon, MusicScheduleDraft, MusicServiceKind } from '../../domain/musicSchedule';
import { MUSIC_SERVICE_LABELS } from '../../domain/musicSchedule';
import {
  ministryModulesForOffice,
  resolveMinistryBoardOffice,
} from '../../domain/ministryNavAccess';
import { MUSIC_UNITS, musicUnitName } from '../../domain/musicUnits';
import {
  financeService,
  ministryFinanceService,
  missionService,
} from '../../services';
import { downloadMusicSchedulePdf } from '../../services/musicSchedulePdf';
import { musicScheduleService } from '../../services/musicScheduleService';
import { MinistryMissionBoard } from './MinistryMissionBoard';

const SYS = 'sys-music' as const;
const BASE = '/systems/music';

function useTick() {
  const [tick, setTick] = useState(0);
  return { tick, refresh: () => setTick((t) => t + 1) };
}

type ScheduleEditState = {
  serviceId: string;
  date: string;
  kind: MusicServiceKind;
  /** When set, drawer focuses that choir (remove / replace). */
  focusUnitId?: string;
};

function unitsEligibleForService(
  kind: MusicServiceKind,
  scheduled: string[],
  opts?: { forReplaceOf?: string },
): typeof MUSIC_UNITS {
  return MUSIC_UNITS.filter((u) => {
    if (u.id === 'mu-hope' && kind !== 'SS1') return false;
    if (u.id === 'mu-worship' && kind !== 'TUESDAY') return false;
    if (kind !== 'TUESDAY' && u.id === 'mu-worship') return false;
    if (opts?.forReplaceOf && u.id === opts.forReplaceOf) return false;
    if (scheduled.includes(u.id) && u.id !== opts?.forReplaceOf) return false;
    return true;
  });
}

function ScheduleEditDrawer({
  open,
  target,
  scheduled,
  onClose,
  onRemove,
  onReplace,
  onAdd,
}: {
  open: boolean;
  target: ScheduleEditState | null;
  scheduled: string[];
  onClose: () => void;
  onRemove: (unitId: string) => void;
  onReplace: (fromUnitId: string, toUnitId: string) => void;
  onAdd: (unitId: string) => void;
}) {
  const [action, setAction] = useState<'menu' | 'remove' | 'replace' | 'add'>(
    'menu',
  );
  const [pickFrom, setPickFrom] = useState('');
  const [pickTo, setPickTo] = useState('');

  const focused = target?.focusUnitId;
  const title = target
    ? focused
      ? `${musicUnitName(focused)} · ${target.date}`
      : `Edit · ${MUSIC_SERVICE_LABELS[target.kind]} · ${target.date}`
    : 'Edit schedule';

  const targetKey = target
    ? `${target.serviceId}:${target.focusUnitId ?? ''}`
    : '';
  useEffect(() => {
    setAction('menu');
    setPickFrom(focused ?? '');
    setPickTo('');
  }, [targetKey, focused]);

  useEffect(() => {
    setPickTo('');
  }, [scheduled.join('|')]);

  if (!target) return null;

  const replaceCandidates = unitsEligibleForService(target.kind, scheduled, {
    forReplaceOf: pickFrom || focused,
  });
  const addCandidates = unitsEligibleForService(target.kind, scheduled);

  return (
    <Drawer open={open} title={title} onClose={onClose}>
      <div className="stack" style={{ gap: '0.75rem' }}>
        <p className="muted" style={{ margin: 0 }}>
          Currently:{' '}
          {scheduled.length
            ? scheduled.map(musicUnitName).join(' · ')
            : 'none'}
        </p>

        {action === 'menu' && focused && (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => onRemove(focused)}
            >
              Remove {musicUnitName(focused)}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setPickFrom(focused);
                setAction('replace');
              }}
            >
              Replace {musicUnitName(focused)}
            </button>
          </>
        )}

        {action === 'menu' && !focused && (
          <>
            <button
              type="button"
              className="btn secondary"
              disabled={!scheduled.length}
              onClick={() => {
                setPickFrom(scheduled[0] ?? '');
                setAction('remove');
              }}
            >
              Remove a choir
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={!scheduled.length}
              onClick={() => {
                setPickFrom(scheduled[0] ?? '');
                setAction('replace');
              }}
            >
              Replace a choir
            </button>
            <button
              type="button"
              className="btn"
              disabled={!addCandidates.length}
              onClick={() => setAction('add')}
            >
              Add a choir
            </button>
          </>
        )}

        {action === 'remove' && (
          <>
            <label className="field">
              Choir to remove
              <select
                value={pickFrom}
                onChange={(e) => setPickFrom(e.target.value)}
              >
                <option value="">Select…</option>
                {scheduled.map((id) => (
                  <option key={id} value={id}>
                    {musicUnitName(id)}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={!pickFrom}
                onClick={() => pickFrom && onRemove(pickFrom)}
              >
                Remove
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setAction('menu')}
              >
                Back
              </button>
            </div>
          </>
        )}

        {action === 'replace' && (
          <>
            {!focused && (
              <label className="field">
                Choir to replace
                <select
                  value={pickFrom}
                  onChange={(e) => {
                    setPickFrom(e.target.value);
                    setPickTo('');
                  }}
                >
                  <option value="">Select…</option>
                  {scheduled.map((id) => (
                    <option key={id} value={id}>
                      {musicUnitName(id)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              Replace with
              <select
                value={pickTo}
                onChange={(e) => setPickTo(e.target.value)}
              >
                <option value="">Select…</option>
                {replaceCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={!(focused || pickFrom) || !pickTo}
                onClick={() => {
                  const fromId = focused || pickFrom;
                  if (fromId && pickTo) onReplace(fromId, pickTo);
                }}
              >
                Replace
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setAction('menu')}
              >
                Back
              </button>
            </div>
          </>
        )}

        {action === 'add' && (
          <>
            <label className="field">
              Choir to add
              <select
                value={pickTo}
                onChange={(e) => setPickTo(e.target.value)}
              >
                <option value="">Select…</option>
                {addCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={!pickTo}
                onClick={() => pickTo && onAdd(pickTo)}
              >
                Add
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setAction('menu')}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

function musicNotifyRecipients(): string[] {
  return [
    'p-music-leader',
    'p-choir-pres',
    'p-choir-leader',
    'p-worship-pres',
    'p-worship-leader',
    'p-pastor',
    'p-assistant',
    'p-secretary',
  ];
}

export function MusicHomePage() {
  const { account, positions, personName } = useAuth();
  const month = musicScheduleService.liveMonthKey();
  const published = musicScheduleService.getPublished(month);
  const drafts = musicScheduleService.listDrafts(month);
  const office = account
    ? resolveMinistryBoardOffice(account.personId, SYS, positions)
    : 'MEMBER';
  const allowed = new Set(ministryModulesForOffice(SYS, office));
  const showFinance = allowed.has('finance') || allowed.has('reports');

  const programs = missionService.listPrograms({
    ownerSystemId: SYS,
    status: 'ACTIVE',
  });
  const events = missionService
    .listEvents()
    .filter((e) => e.ownerSystemId === SYS);
  const projects = missionService
    .listProjects({ viewerSystemId: SYS })
    .filter(
      (p) =>
        p.ownerSystemId === SYS &&
        (p.status === 'ACTIVE' || p.status === 'PLANNED'),
    );
  const openTasks = missionService
    .listTasks({ viewerSystemId: SYS, systemId: SYS })
    .filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');

  const finance = showFinance
    ? ministryFinanceService.financeReport(SYS)
    : null;
  const myPending =
    account && allowed.has('my-contributions')
      ? ministryFinanceService.listContributions(SYS, {
          personId: account.personId,
          status: 'PENDING',
        }).length
      : 0;

  const upcoming = (published?.services ?? [])
    .filter((s) => s.date >= new Date().toISOString().slice(0, 10))
    .slice(0, 4);

  const pendingClaims = financeReportPendingCount(SYS);
  const pendingExpenses = finance
    ? ministryFinanceService
        .listExpenses(SYS)
        .filter((e) => e.status === 'PENDING').length
    : 0;

  type Need = { id: string; title: string; reason: string; to: string };
  const needs: Need[] = [];
  if (!published && allowed.has('schedule')) {
    needs.push({
      id: 'sched',
      title: `${month} choir schedule not published`,
      reason: 'Build, save a draft, then publish',
      to: `${BASE}/schedule`,
    });
  }
  if (drafts.length > 0 && allowed.has('schedule-drafts')) {
    needs.push({
      id: 'drafts',
      title: `${drafts.length} draft${drafts.length === 1 ? '' : 's'} waiting`,
      reason: 'Review and publish one',
      to: `${BASE}/schedule-drafts`,
    });
  }
  if (pendingClaims > 0 && allowed.has('finance')) {
    needs.push({
      id: 'claims',
      title: `${pendingClaims} claim${pendingClaims === 1 ? '' : 's'} to verify`,
      reason: 'Pending contributions',
      to: `${BASE}/finance`,
    });
  }
  if (pendingExpenses > 0 && allowed.has('accounting')) {
    needs.push({
      id: 'exp',
      title: `${pendingExpenses} expense${pendingExpenses === 1 ? '' : 's'} pending`,
      reason: 'Accounting approval',
      to: `${BASE}/accounting`,
    });
  }
  if (myPending > 0) {
    needs.push({
      id: 'mine',
      title: `${myPending} of your claims pending`,
      reason: 'Waiting on treasurer',
      to: `${BASE}/my-contributions`,
    });
  }

  const kicker =
    office === 'TREASURER'
      ? 'Treasurer · Music finance'
      : office === 'PRESIDENT' || office === 'VP'
        ? 'Music leadership overview'
        : office === 'SECRETARY'
          ? 'Secretary · Music records'
          : 'Music member home';

  return (
    <div className="stack">
      <div className="detail-hero">
        <p className="hero-kicker">{kicker}</p>
        <h2 style={{ margin: 0 }}>Music · {personName}</h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          At-a-glance status. Open modules from the nav.
        </p>
        <div className="overview-strip" style={{ marginTop: '0.85rem' }}>
          <div className="overview-tile">
            <div className="label">Choir schedule</div>
            <div className="value" style={{ fontSize: '0.95rem' }}>
              {published ? `${month} · v${published.version}` : `${month} · none`}
            </div>
          </div>
          <div className="overview-tile">
            <div className="label">Drafts</div>
            <div className="value">{drafts.length}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Units</div>
            <div className="value">{MUSIC_UNITS.length}</div>
          </div>
          {showFinance && finance ? (
            <div className="overview-tile">
              <div className="label">Fund balance</div>
              <div className="value" style={{ fontSize: '0.95rem' }}>
                {financeService.formatAmount(finance.fundBalance)}
              </div>
            </div>
          ) : (
            <div className="overview-tile">
              <div className="label">Active programs</div>
              <div className="value">{programs.length}</div>
            </div>
          )}
        </div>
      </div>

      {needs.length > 0 && (
        <div className="needs-me">
          <h3>Needs attention · {needs.length}</h3>
          <ul className="needs-me-list">
            {needs.slice(0, 5).map((n) => (
              <li key={n.id}>
                <div>
                  <Link to={n.to}>
                    <strong>{n.title}</strong>
                  </Link>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    {n.reason}
                  </div>
                </div>
                <Link to={n.to} className="btn ghost">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel">
        <div
          className="row"
          style={{ justifyContent: 'space-between', marginBottom: '0.65rem' }}
        >
          <h3 style={{ margin: 0 }}>Mission</h3>
          {programs[0] ? (
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Lead program · {programs[0].name}
            </span>
          ) : null}
        </div>
        <div className="overview-strip" style={{ marginTop: 0 }}>
          <div className="overview-tile">
            <div className="label">Programs</div>
            <div className="value">{programs.length}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Events</div>
            <div className="value">{events.length}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Open tasks</div>
            <div className="value">{openTasks.length}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Projects</div>
            <div className="value">{projects.length}</div>
          </div>
        </div>
      </div>

      {showFinance && finance && (
        <div className="panel">
          <h3 style={{ marginTop: 0, marginBottom: '0.65rem' }}>Finance</h3>
          <div className="overview-strip" style={{ marginTop: 0 }}>
            <div className="overview-tile">
              <div className="label">Confirmed</div>
              <div className="value" style={{ fontSize: '0.95rem' }}>
                {financeService.formatAmount(finance.contributionsConfirmed)}
              </div>
            </div>
            <div className="overview-tile">
              <div className="label">Claims pending</div>
              <div className="value">{pendingClaims}</div>
            </div>
            <div className="overview-tile">
              <div className="label">Expenses approved</div>
              <div className="value" style={{ fontSize: '0.95rem' }}>
                {financeService.formatAmount(finance.expensesApproved)}
              </div>
            </div>
            <div className="overview-tile">
              <div className="label">Expenses pending</div>
              <div className="value">{pendingExpenses}</div>
            </div>
            <div className="overview-tile">
              <div className="label">Assets</div>
              <div className="value" style={{ fontSize: '0.95rem' }}>
                {financeService.formatAmount(finance.assets)}
              </div>
            </div>
            <div className="overview-tile">
              <div className="label">Liabilities</div>
              <div className="value" style={{ fontSize: '0.95rem' }}>
                {financeService.formatAmount(finance.liabilities)}
              </div>
            </div>
            <div className="overview-tile">
              <div className="label">Net assets</div>
              <div className="value" style={{ fontSize: '0.95rem' }}>
                {financeService.formatAmount(finance.netAssets)}
              </div>
            </div>
            <div className="overview-tile">
              <div className="label">Fund</div>
              <div className="value" style={{ fontSize: '0.95rem' }}>
                {financeService.formatAmount(finance.fundBalance)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div
          className="row"
          style={{ justifyContent: 'space-between', marginBottom: '0.65rem' }}
        >
          <h3 style={{ margin: 0 }}>Next on choir schedule</h3>
          <span className="badge">
            {published ? `Published v${published.version}` : 'Not published'}
          </span>
        </div>
        {!published ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            No live schedule for {month}
            {drafts.length
              ? ` · ${drafts.length} draft${drafts.length === 1 ? '' : 's'} ready to review`
              : ''}
            .
          </p>
        ) : upcoming.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            No upcoming services left in this period.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Service</th>
                <th>Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((s) => {
                const units = musicScheduleService.assignmentsForService(
                  published.assignments,
                  s.id,
                );
                return (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td>{MUSIC_SERVICE_LABELS[s.kind]}</td>
                    <td>
                      {units.map(musicUnitName).join(' · ') || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function financeReportPendingCount(systemId: typeof SYS): number {
  return ministryFinanceService.listContributions(systemId, {
    status: 'PENDING',
  }).length;
}

export function MusicMissionPage() {
  return (
    <MinistryMissionBoard systemId={SYS} title="Music mission board" />
  );
}

export function MusicScheduleWorkspacePage() {
  const { account, positions } = useAuth();
  const canManage = missionService.canManageBoard(positions, SYS);
  const { refresh, tick } = useTick();
  const [periodKey, setPeriodKey] = useState(
    musicScheduleService.liveMonthKey(),
  );
  const [horizon, setHorizon] = useState<MusicHorizon>('MONTH');
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState<ScheduleEditState | null>(null);
  const canvas = useMemo(
    () => musicScheduleService.getCanvas(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, periodKey, horizon],
  );

  if (!account) return null;

  function onBuildCalendar() {
    musicScheduleService.buildCalendar(periodKey, horizon);
    setMsg(`Calendar built for ${periodKey} (${horizon.toLowerCase()})`);
    refresh();
  }

  function onBuildSchedule() {
    const r = musicScheduleService.buildChoirSchedule();
    setMsg(
      r.ok
        ? `Choir schedule generated${r.warnings.length ? ` · ${r.warnings.length} note(s)` : ''}`
        : r.reason ?? 'Failed',
    );
    refresh();
  }

  function onSaveDraft() {
    if (!canManage) {
      setMsg('Only Music leaders can save drafts');
      return;
    }
    const r = musicScheduleService.saveDraft(account!.personId);
    setMsg(r.ok ? `Saved draft: ${r.draft?.label}` : r.reason ?? 'Save failed');
    refresh();
  }

  function applyEditResult(
    r: { ok: boolean; reason?: string; warnings?: string[] },
    okMsg: string,
    opts?: { closeDrawer?: boolean },
  ) {
    if (!r.ok) {
      setMsg(r.reason ?? 'Edit failed');
      return;
    }
    const notes = r.warnings?.length ? ` · ${r.warnings.length} note(s)` : '';
    setMsg(`${okMsg}${notes}`);
    if (opts?.closeDrawer !== false) setEdit(null);
    refresh();
  }

  function onDownloadPdf() {
    if (!canvas?.services.length) {
      setMsg('Build a calendar first');
      return;
    }
    const r = downloadMusicSchedulePdf({
      periodKey: canvas.periodKey,
      horizon: canvas.horizon,
      services: canvas.services,
      assignments: canvas.assignments,
    });
    setMsg(r.ok ? `Downloaded ${r.filename}` : r.reason ?? 'Export failed');
  }

  const services = canvas?.services ?? [];
  const assignments = canvas?.assignments ?? [];
  const editUnits = edit
    ? musicScheduleService.assignmentsForService(assignments, edit.serviceId)
    : [];

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Choir schedule workspace"
          subtitle="Build calendar → generate choir schedule → edit manually → save draft. Identical schedules cannot be saved twice — rebuild or change a choir first. Publish from Open drafts."
        />
        <div className="row" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <label className="field" style={{ margin: 0 }}>
            Period
            <select
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
            >
              {musicScheduleService.allowedMonths().map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ margin: 0 }}>
            Horizon
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as MusicHorizon)}
            >
              <option value="MONTH">Month</option>
              <option value="QUARTER">Quarter</option>
              <option value="HALF">Half year</option>
              <option value="YEAR">Year</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <Link className="btn secondary" to={`${BASE}/schedule-drafts`}>
            Open drafts
          </Link>
          <button type="button" className="btn" onClick={onBuildCalendar}>
            Build calendar
          </button>
          <button
            type="button"
            className="btn"
            onClick={onBuildSchedule}
            disabled={!services.length}
          >
            Build choir schedule
          </button>
          {canManage && (
            <button
              type="button"
              className="btn"
              onClick={onSaveDraft}
              disabled={!assignments.length}
            >
              Save draft
            </button>
          )}
          <button
            type="button"
            className="btn secondary"
            onClick={onDownloadPdf}
            disabled={!services.length}
          >
            Download PDF
          </button>
        </div>
        {msg && <p className="badge" style={{ marginTop: '0.75rem' }}>{msg}</p>}
        {canvas?.warnings?.length ? (
          <ul className="muted" style={{ marginTop: '0.5rem' }}>
            {canvas.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>
          {services.length
            ? `${services.length} services · ${assignments.length} assignments`
            : 'No calendar yet'}
        </h3>
        {services.length === 0 ? (
          <p className="muted">Click Build calendar to start.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Service</th>
                <th>Scheduled</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => {
                const units = musicScheduleService.assignmentsForService(
                  assignments,
                  s.id,
                );
                return (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td>{MUSIC_SERVICE_LABELS[s.kind]}</td>
                    <td>
                      {units.length ? (
                        <div
                          className="row"
                          style={{ flexWrap: 'wrap', gap: '0.35rem' }}
                        >
                          {units.map((uid) => (
                            <button
                              key={uid}
                              type="button"
                              className="filter-chip"
                              title="Remove or replace this choir"
                              onClick={() =>
                                setEdit({
                                  serviceId: s.id,
                                  date: s.date,
                                  kind: s.kind,
                                  focusUnitId: uid,
                                })
                              }
                            >
                              {musicUnitName(uid)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() =>
                          setEdit({
                            serviceId: s.id,
                            date: s.date,
                            kind: s.kind,
                          })
                        }
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ScheduleEditDrawer
        open={!!edit}
        target={edit}
        scheduled={editUnits}
        onClose={() => setEdit(null)}
        onRemove={(unitId) => {
          if (!edit) return;
          applyEditResult(
            musicScheduleService.removeCanvasUnit(edit.serviceId, unitId),
            `Removed ${musicUnitName(unitId)}`,
            { closeDrawer: false },
          );
        }}
        onReplace={(from, to) => {
          if (!edit) return;
          applyEditResult(
            musicScheduleService.replaceCanvasUnit(edit.serviceId, from, to),
            `Replaced ${musicUnitName(from)} with ${musicUnitName(to)}`,
            { closeDrawer: false },
          );
        }}
        onAdd={(unitId) => {
          if (!edit) return;
          applyEditResult(
            musicScheduleService.addCanvasUnit(edit.serviceId, unitId),
            `Added ${musicUnitName(unitId)}`,
            { closeDrawer: false },
          );
        }}
      />
    </div>
  );
}

export function MusicScheduleDraftsPage() {
  const { account, positions } = useAuth();
  const canManage = missionService.canManageBoard(positions, SYS);
  const { refresh, tick } = useTick();
  const [msg, setMsg] = useState('');
  const [viewId, setViewId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const drafts = useMemo(
    () => musicScheduleService.listDrafts(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  if (!account) return null;

  function onPublish(id: string) {
    if (!canManage) return;
    const r = musicScheduleService.publishDraft(
      id,
      account!.personId,
      musicNotifyRecipients(),
    );
    setMsg(
      r.ok
        ? `Published choir schedule ${r.schedule?.periodKey} v${r.schedule?.version}`
        : r.reason ?? 'Publish failed',
    );
    setViewId(null);
    setCompareOpen(false);
    refresh();
  }

  function onDelete(id: string) {
    if (!canManage) return;
    musicScheduleService.deleteDraft(id);
    setMsg('Draft deleted');
    if (viewId === id) setViewId(null);
    setCompareIds((ids) => ids.filter((x) => x !== id));
    refresh();
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  const viewing = viewId ? musicScheduleService.getDraft(viewId) : null;
  const compareDrafts = compareIds
    .map((id) => musicScheduleService.getDraft(id))
    .filter(Boolean);

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Schedule drafts"
          subtitle="Open drafts to review, compare two side by side, then publish one. Publishing clears other drafts for that period."
          actions={
            <Link className="btn secondary" to={`${BASE}/schedule`}>
              Workspace
            </Link>
          }
        />
        {msg && <p className="badge">{msg}</p>}
        {compareIds.length > 0 && (
          <div className="row" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <span className="muted">
              Compare selected: {compareIds.length}/2
            </span>
            <button
              type="button"
              className="btn"
              disabled={compareIds.length !== 2}
              onClick={() => setCompareOpen(true)}
            >
              Compare drafts
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setCompareIds([])}
            >
              Clear selection
            </button>
          </div>
        )}
      </div>
      <div className="panel">
        {drafts.length === 0 ? (
          <p className="muted">No drafts.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '2.5rem' }} title="Select for compare">
                  Cmp
                </th>
                <th>Label</th>
                <th>Period</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={compareIds.includes(d.id)}
                      onChange={() => toggleCompare(d.id)}
                      aria-label={`Select ${d.label} for compare`}
                    />
                  </td>
                  <td>
                    <strong>{d.label}</strong>
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      {d.assignments.length} assignments · {d.services.length}{' '}
                      services
                    </div>
                  </td>
                  <td>{d.periodKey}</td>
                  <td>
                    <StatusPill status={d.status}>{d.status}</StatusPill>
                  </td>
                  <td>{new Date(d.createdAt).toLocaleString()}</td>
                  <td>
                    <div className="row" style={{ flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setViewId(d.id)}
                      >
                        View
                      </button>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => onPublish(d.id)}
                          >
                            Publish
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => onDelete(d.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer
        open={!!viewing}
        title={viewing ? `Draft · ${viewing.label}` : 'Draft'}
        onClose={() => setViewId(null)}
        wide
      >
        {viewing && (
          <div className="stack" style={{ gap: '0.75rem' }}>
            <p className="muted" style={{ margin: 0 }}>
              {viewing.periodKey} · {viewing.services.length} services ·{' '}
              {viewing.assignments.length} assignments · created{' '}
              {new Date(viewing.createdAt).toLocaleString()}
            </p>
            {viewing.warnings?.length ? (
              <ul className="muted" style={{ margin: 0 }}>
                {viewing.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            <DraftScheduleTable draft={viewing} />
            {canManage && (
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => onPublish(viewing.id)}
                >
                  Publish this draft
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onDelete(viewing.id)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Drawer
        open={compareOpen && compareDrafts.length === 2}
        title="Compare drafts"
        onClose={() => setCompareOpen(false)}
        wide
      >
        {compareDrafts.length === 2 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              alignItems: 'start',
            }}
          >
            {compareDrafts.map((d) =>
              d ? (
                <div key={d.id} className="stack" style={{ gap: '0.5rem' }}>
                  <div>
                    <strong>{d.label}</strong>
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      {d.periodKey} · {new Date(d.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <DraftScheduleTable draft={d} compact />
                  {canManage && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onPublish(d.id)}
                    >
                      Publish this one
                    </button>
                  )}
                </div>
              ) : null,
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function DraftScheduleTable({
  draft,
  compact,
}: {
  draft: MusicScheduleDraft;
  compact?: boolean;
}) {
  return (
    <table className="table" style={compact ? { fontSize: '0.85rem' } : undefined}>
      <thead>
        <tr>
          <th>Date</th>
          <th>Service</th>
          <th>Scheduled</th>
        </tr>
      </thead>
      <tbody>
        {draft.services.map((s) => {
          const units = musicScheduleService.assignmentsForService(
            draft.assignments,
            s.id,
          );
          return (
            <tr key={s.id}>
              <td>{s.date}</td>
              <td>{MUSIC_SERVICE_LABELS[s.kind]}</td>
              <td>
                {units.length ? units.map(musicUnitName).join(' · ') : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function MusicSchedulePublishedPage() {
  const { account, positions } = useAuth();
  const canManage = missionService.canManageBoard(positions, SYS);
  const { refresh, tick } = useTick();
  const [periodKey, setPeriodKey] = useState(
    musicScheduleService.liveMonthKey(),
  );
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState<ScheduleEditState | null>(null);
  const published = useMemo(
    () => musicScheduleService.getPublished(periodKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodKey, tick],
  );

  function applyEditResult(
    r: { ok: boolean; reason?: string; warnings?: string[]; schedule?: { version: number } },
    okMsg: string,
    opts?: { closeDrawer?: boolean },
  ) {
    if (!r.ok) {
      setMsg(r.reason ?? 'Edit failed');
      return;
    }
    const ver = r.schedule ? ` · v${r.schedule.version}` : '';
    const notes = r.warnings?.length ? ` · ${r.warnings.length} note(s)` : '';
    setMsg(`${okMsg}${ver}${notes}`);
    if (opts?.closeDrawer !== false) setEdit(null);
    refresh();
  }

  function onDownloadPublishedPdf() {
    if (!published) {
      setMsg('Nothing published for this period');
      return;
    }
    const r = downloadMusicSchedulePdf({
      periodKey: published.periodKey,
      horizon: published.horizon,
      services: published.services,
      assignments: published.assignments,
      label: `Published v${published.version}`,
    });
    setMsg(r.ok ? `Downloaded ${r.filename}` : r.reason ?? 'Export failed');
  }

  const editUnits =
    edit && published
      ? musicScheduleService.assignmentsForService(
          published.assignments,
          edit.serviceId,
        )
      : [];

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Published choir schedule"
          subtitle="Published schedule can be edited; viewers always see the latest version."
        />
        <label className="field">
          Period
          <select
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
          >
            {musicScheduleService.allowedMonths().map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        {msg && <p className="badge">{msg}</p>}
      </div>
      {!published ? (
        <div className="panel">
          <p className="muted">No published choir schedule for {periodKey}.</p>
        </div>
      ) : (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>
              Choir schedule · {published.periodKey} · v{published.version}
            </h3>
            <StatusPill status="PUBLISHED">PUBLISHED</StatusPill>
          </div>
          <p className="muted">
            Updated {new Date(published.updatedAt).toLocaleString()}
          </p>
          <div className="row" style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="btn secondary"
              onClick={onDownloadPublishedPdf}
            >
              Download PDF
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Service</th>
                <th>Scheduled</th>
                {canManage ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {published.services.map((s) => {
                const units = musicScheduleService.assignmentsForService(
                  published.assignments,
                  s.id,
                );
                return (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td>{MUSIC_SERVICE_LABELS[s.kind]}</td>
                    <td>
                      {units.length ? (
                        <div
                          className="row"
                          style={{ flexWrap: 'wrap', gap: '0.35rem' }}
                        >
                          {units.map((uid) =>
                            canManage ? (
                              <button
                                key={uid}
                                type="button"
                                className="filter-chip"
                                title="Remove or replace this choir"
                                onClick={() =>
                                  setEdit({
                                    serviceId: s.id,
                                    date: s.date,
                                    kind: s.kind,
                                    focusUnitId: uid,
                                  })
                                }
                              >
                                {musicUnitName(uid)}
                              </button>
                            ) : (
                              <span key={uid} className="filter-chip">
                                {musicUnitName(uid)}
                              </span>
                            ),
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    {canManage ? (
                      <td>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() =>
                            setEdit({
                              serviceId: s.id,
                              date: s.date,
                              kind: s.kind,
                            })
                          }
                        >
                          Edit
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage && account && (
        <ScheduleEditDrawer
          open={!!edit}
          target={edit}
          scheduled={editUnits}
          onClose={() => setEdit(null)}
          onRemove={(unitId) => {
            if (!edit || !account) return;
            applyEditResult(
              musicScheduleService.removePublishedUnit(
                periodKey,
                account.personId,
                edit.serviceId,
                unitId,
                musicNotifyRecipients(),
              ),
              `Removed ${musicUnitName(unitId)}`,
              { closeDrawer: false },
            );
          }}
          onReplace={(from, to) => {
            if (!edit || !account) return;
            applyEditResult(
              musicScheduleService.replacePublishedUnit(
                periodKey,
                account.personId,
                edit.serviceId,
                from,
                to,
                musicNotifyRecipients(),
              ),
              `Replaced ${musicUnitName(from)} with ${musicUnitName(to)}`,
              { closeDrawer: false },
            );
          }}
          onAdd={(unitId) => {
            if (!edit || !account) return;
            applyEditResult(
              musicScheduleService.addPublishedUnit(
                periodKey,
                account.personId,
                edit.serviceId,
                unitId,
                musicNotifyRecipients(),
              ),
              `Added ${musicUnitName(unitId)}`,
              { closeDrawer: false },
            );
          }}
        />
      )}
    </div>
  );
}

export function MusicScheduleInboxPage() {
  const { account } = useAuth();
  const { refresh, tick } = useTick();
  const notes = useMemo(
    () =>
      account
        ? musicScheduleService.listNotifications(account.personId)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, tick],
  );

  if (!account) return null;

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Schedule inbox"
          subtitle="Notifications when a choir schedule is published or updated."
        />
      </div>
      <div className="panel">
        {notes.length === 0 ? (
          <p className="muted">No notifications.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {notes.map((n) => (
              <li key={n.id} style={{ marginBottom: '0.75rem' }}>
                <strong>{n.title}</strong>
                {!n.readAt && <span className="badge"> New</span>}
                <div className="muted">{n.body}</div>
                <div className="row" style={{ marginTop: '0.25rem' }}>
                  <Link to={`${BASE}/schedule-published`}>View schedule</Link>
                  {!n.readAt && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        musicScheduleService.markRead(n.id, account.personId);
                        refresh();
                      }}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
