import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import type { ProtocolAttendanceStatus } from '../../domain/types';
import { PROTOCOL_SCORE_POINTS } from '../../domain/teamEngine';
import { musicScheduleService, protocolService } from '../../services';
import type { ProtocolMonthRow } from '../../services/protocolService';
import { ProtocolCoveragePanel } from './ProtocolCoveragePanel';
import { ProtocolTeamsBoard } from './ProtocolTeamsBoard';
import { ProtocolMusicSyncPanel } from './ProtocolMusicSync';

const SYS = 'sys-protocol' as const;

function useProtocolMonth(startAt?: () => string) {
  const [monthKey, setMonthKey] = useState(
    () => startAt?.() ?? protocolService.liveMonthKey(),
  );
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  return { monthKey, setMonthKey, refresh, tick };
}

function MonthPicker({
  monthKey,
  onChange,
}: {
  monthKey: string;
  onChange: (m: string) => void;
}) {
  return (
    <select value={monthKey} onChange={(e) => onChange(e.target.value)}>
      {protocolService.allowedMonths().map((m) => (
        <option key={m} value={m}>
          {protocolService.monthLabel(m)}
        </option>
      ))}
    </select>
  );
}


function MonthsOverview({
  tick,
  canManage,
  personId,
  selected,
  onOpen,
  onChange,
}: {
  tick: number;
  canManage: boolean;
  personId?: string;
  selected: string;
  onOpen: (monthKey: string) => void;
  onChange: () => void;
}) {
  const [note, setNote] = useState('');
  const rows = useMemo(
    () => protocolService.monthsOverview(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const toBuild = rows.filter((r) => r.next === 'BUILD');
  if (rows.length === 0) {
    return (
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Months</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          Nothing to plan yet. Music has not confirmed any month. You will be
          notified when it does.
        </p>
      </div>
    );
  }
  const music = (r: ProtocolMonthRow) =>
    r.musicState === 'PUBLISHED'
      ? `Published v${r.musicVersion}`
      : r.musicState === 'CONFIRMED'
        ? `Confirmed v${r.musicVersion}`
        : 'Not yet';
  const review = (r: ProtocolMonthRow) =>
    r.planStatus === 'PUBLISHED'
      ? 'Approved'
      : r.planStatus === 'REVIEW'
        ? 'With the President'
        : r.places > 0
          ? 'Not sent'
          : '—';
  const publish = (r: ProtocolMonthRow) =>
    r.planStatus === 'PUBLISHED'
      ? 'Published'
      : r.musicState === 'NONE'
        ? '—'
        : r.publishBlockReason
          ? 'After Music publishes'
          : 'Ready when approved';
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Months</h3>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            Every month Music has confirmed or published, and where it stands.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            className="btn"
            disabled={toBuild.length === 0}
            onClick={() => {
              if (!personId) return;
              const r = protocolService.buildAllReady(personId);
              setNote(
                !r.ok
                  ? (r.reason ?? 'Could not build')
                  : r.failed.length
                    ? `Built ${r.built.length} month${r.built.length === 1 ? '' : 's'}; ${r.failed.length} could not be built (${r.failed.map((f) => `${f.monthKey}: ${f.reason}`).join('; ')})`
                    : `Built teams for ${r.built.length} month${r.built.length === 1 ? '' : 's'}`,
              );
              onChange();
            }}
          >
            {toBuild.length > 0
              ? `Build all (${toBuild.length} month${toBuild.length === 1 ? '' : 's'})`
              : 'Nothing to build'}
          </button>
        )}
      </div>
      {note && <p className="muted" style={{ marginBottom: 0 }}>{note}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ marginTop: '0.6rem' }}>
          <thead>
            <tr>
              <th>Month</th>
              <th>Music</th>
              <th>Teams</th>
              <th>President review</th>
              <th>Publish</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.monthKey}
                className={r.monthKey === selected ? 'row-selected' : undefined}
              >
                <td>
                  <strong>{r.label}</strong>
                  {r.batchLabel && (
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      {r.batchLabel}
                    </div>
                  )}
                </td>
                <td>{music(r)}</td>
                <td>
                  {r.places > 0
                    ? `${r.places} places · ${r.services} services`
                    : r.musicState === 'NONE'
                      ? '—'
                      : 'Not built'}
                </td>
                <td>{review(r)}</td>
                <td>{publish(r)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {r.next === 'WAIT_MUSIC' ? (
                    <span className="muted">Waiting for Music</span>
                  ) : (
                    <button
                      type="button"
                      className={`btn sm${r.next === 'BUILD' || r.next === 'SEND' ? '' : ' ghost'}`}
                      onClick={() => onOpen(r.monthKey)}
                    >
                      {r.next === 'BUILD' && canManage
                        ? 'Build teams'
                        : r.next === 'SEND' && canManage
                          ? 'Check & send'
                          : 'Open'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Service teams workspace — depends on published Music schedule.
 * Generate → recommend TL/VTL → coordinator approve/manual → review/publish.
 */
export function ProtocolTeamsPage() {
  const { account, can } = useAuth();
  const canView = can('PROTOCOL_SCHEDULE', 'VIEW', SYS);
  const canManage = can('PROTOCOL_SCHEDULE', 'MANAGE', SYS);
  const { monthKey, setMonthKey, refresh, tick } = useProtocolMonth(() =>
    protocolService.firstActionMonth(),
  );
  const [message, setMessage] = useState('');
  const workspaceRef = useRef<HTMLDivElement>(null);

  const musicPublished = useMemo(
    () => musicScheduleService.getPlannedForMonth(monthKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKey, tick],
  );
  const services = useMemo(
    () => protocolService.servicesForMonth(monthKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKey, tick],
  );
  const plan = useMemo(
    () => protocolService.getMonthPlan(monthKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKey, tick],
  );
  const teamsEditable =
    canManage && plan?.status !== 'REVIEW' && plan?.status !== 'PUBLISHED';
  const load = useMemo(
    () => protocolService.dutyLoad(monthKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKey, tick],
  );
  const rules = protocolService.rules();
  const totalPlaces = services.reduce(
    (n, svc) => n + protocolService.teamForService(svc.id).length,
    0,
  );
  const buildBlocked =
    plan?.status === 'REVIEW'
      ? 'This month is with the President. Withdraw it from review to rebuild.'
      : plan?.status === 'PUBLISHED'
        ? 'This month is published. Reopen it to rebuild.'
        : !musicPublished && services.length === 0
          ? 'Music has not confirmed this month yet.'
          : undefined;
  const publishBlock = protocolService.publishBlockReason(monthKey);
  type Tone = 'done' | 'todo' | 'warn';
  const steps: { label: string; value: string; tone: Tone }[] = [
    {
      label: '1 · Music schedule',
      value: musicPublished
        ? musicPublished.musicState === 'CONFIRMED'
          ? `Confirmed v${musicPublished.version}`
          : `Published v${musicPublished.version}`
        : 'Missing',
      tone: !musicPublished ? 'warn' : musicPublished.musicState === 'CONFIRMED' ? 'todo' : 'done',
    },
    {
      label: '2 · Teams',
      value:
        totalPlaces > 0
          ? `${totalPlaces} places · ${services.length} services`
          : 'Not built',
      tone: totalPlaces > 0 ? 'done' : 'todo',
    },
    {
      label: '3 · President review',
      value:
        plan?.status === 'PUBLISHED'
          ? 'Approved'
          : plan?.status === 'REVIEW'
            ? 'Waiting for the President'
            : 'Not sent yet',
      tone:
        plan?.status === 'PUBLISHED' ? 'done' : plan?.status === 'REVIEW' ? 'warn' : 'todo',
    },
    {
      label: '4 · Published',
      value:
        plan?.status === 'PUBLISHED'
          ? 'Published to the team'
          : publishBlock
            ? 'Waiting for Music to publish'
            : 'Not yet',
      tone: plan?.status === 'PUBLISHED' ? 'done' : 'todo',
    },
  ];

  if (!canView) {
    return (
      <div className="panel">
        <h2>Service teams</h2>
        <p className="muted">No PROTOCOL_SCHEDULE / VIEW</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <MonthsOverview
        tick={tick}
        canManage={canManage}
        personId={account?.personId}
        selected={monthKey}
        onOpen={(m) => {
          setMonthKey(m);
          setTimeout(
            () => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
            0,
          );
        }}
        onChange={refresh}
      />

      <div className="panel" ref={workspaceRef}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Service teams</h2>
          <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
        </div>

        <ol className="flow-steps" aria-label="Progress for this month">
          {steps.map((st) => (
            <li key={st.label} className={`flow-step ${st.tone}`}>
              <span className="flow-step-label">{st.label}</span>
              <span className="flow-step-value">{st.value}</span>
            </li>
          ))}
        </ol>

        <div className="row" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
          {canManage && (
            <button
              type="button"
              className="btn"
              disabled={!!buildBlocked}
              title={buildBlocked}
              onClick={() => {
                if (!account) return;
                if (
                  totalPlaces > 0 &&
                  !window.confirm(
                    'Rebuilding replaces the current teams, including any manual changes. Continue?',
                  )
                ) {
                  return;
                }
                const result = protocolService.generateTeams(
                  monthKey,
                  account.personId,
                );
                setMessage(
                  result.ok
                    ? `Teams built: ${result.slotCount} places` +
                        (result.warnings.length
                          ? ` · ${result.warnings.length} note${result.warnings.length === 1 ? '' : 's'} to check`
                          : '')
                    : (result.reason ?? 'Could not build the teams'),
                );
                refresh();
              }}
            >
              {totalPlaces > 0 ? 'Rebuild teams' : 'Build teams'}
            </button>
          )}
          {canManage && plan?.status === 'DRAFT' && totalPlaces > 0 && (
            <Link className="btn secondary" to="/systems/protocol/review">
              Check &amp; send to the President →
            </Link>
          )}
          {!canManage && plan?.status === 'REVIEW' && (
            <Link className="btn secondary" to="/systems/protocol/review">
              Review &amp; publish →
            </Link>
          )}
          {!musicPublished && (
            <Link className="btn secondary" to="/systems/music/schedule">
              Open Music schedule
            </Link>
          )}
        </div>
        {message && <p className="muted" style={{ marginBottom: 0 }}>{message}</p>}
        {!musicPublished && (
          <p className="muted" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            Teams can be built once Music has confirmed or published this
            month&apos;s choir schedule.
          </p>
        )}
        {musicPublished?.musicState === 'CONFIRMED' && (
          <p className="muted" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            Music has confirmed this month but not yet released it to the
            choirs. You can build now; the month can be published only after
            Music publishes it.
          </p>
        )}
        <details style={{ marginTop: '0.75rem' }}>
          <summary className="muted">How teams are built</summary>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            Team of {rules.defaultTeamSize} per service · each member serves
            about {rules.preferTarget} times a month · a fourth (extra) duty is
            given only when everyone is at target · no Friday services.
          </p>
        </details>
      </div>

      {plan?.status !== 'REVIEW' && plan?.status !== 'PUBLISHED' && (
        <ProtocolCoveragePanel
          monthKey={monthKey}
          tick={tick}
          onChange={refresh}
          editable={teamsEditable}
        />
      )}

      <ProtocolMusicSyncPanel
        monthKey={monthKey}
        tick={tick}
        onChange={refresh}
        canManage={canManage}
      />

      <ProtocolTeamsBoard
        services={services}
        monthKey={monthKey}
        tick={tick}
        refresh={refresh}
        canManage={canManage}
        teamsEditable={teamsEditable}
        actorPersonId={account?.personId}
      />

      <div>
        <div className="panel">
          <h3>Official duty load ({monthKey})</h3>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            REGULAR serves only (not fill-ins). Extra = 4th when allowed.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Office</th>
                <th>Duties</th>
              </tr>
            </thead>
            <tbody>
              {load.map((row) => (
                <tr key={row.personId}>
                  <td>{row.name}</td>
                  <td>{protocolService.officeLabel(row.office)}</td>
                  <td>
                    <span
                      className={
                        row.count >= rules.preferTarget
                          ? 'badge planned'
                          : 'badge'
                      }
                    >
                      {row.count}
                    </span>
                  </td>
                </tr>
              ))}
              {load.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    Generate teams to see load
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Member performance — served counts, extras, fill-ins, score, ranking. */
export function ProtocolFaithfulPage() {
  const { can } = useAuth();
  const canView = can('PROTOCOL_SCHEDULE', 'VIEW', SYS);
  const { monthKey, setMonthKey, tick } = useProtocolMonth();
  const [scope, setScope] = useState<'month' | 'all'>('month');

  const rows = useMemo(
    () =>
      protocolService.faithfulServantStats(
        scope === 'all' ? 'ALL' : monthKey,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKey, scope, tick],
  );

  if (!canView) {
    return (
      <div className="panel">
        <h2>Member performance</h2>
        <p className="muted">No access</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>Member performance</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Counts from submitted attendance (Present / Half-present). Updates
              when attendance is recorded.
            </p>
          </div>
          <div className="row">
            <button
              type="button"
              className={scope === 'month' ? 'btn sm' : 'btn secondary sm'}
              onClick={() => setScope('month')}
            >
              This month
            </button>
            <button
              type="button"
              className={scope === 'all' ? 'btn sm' : 'btn secondary sm'}
              onClick={() => setScope('all')}
            >
              All time
            </button>
            {scope === 'month' && (
              <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
            )}
          </div>
        </div>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Score: Present {PROTOCOL_SCORE_POINTS.PRESENT} · Half-present{' '}
          {PROTOCOL_SCORE_POINTS.HALF_PRESENT} · Excused{' '}
          {PROTOCOL_SCORE_POINTS.EXCUSED} · Absent {PROTOCOL_SCORE_POINTS.ABSENT}{' '}
          · Extra {PROTOCOL_SCORE_POINTS.EXTRA} · Fill-in{' '}
          {PROTOCOL_SCORE_POINTS.FILL_IN}
        </p>
      </div>

      <div className="panel">
        <h3>Ranking · {scope === 'all' ? 'All time' : monthKey}</h3>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Served</th>
              <th>Extra</th>
              <th>Fill-in</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.personId}>
                <td>{i + 1}</td>
                <td>{r.name}</td>
                <td>{r.servedCount}</td>
                <td>{r.extraCount}</td>
                <td>{r.fillInCount}</td>
                <td>
                  <strong>{r.score}</strong>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No attendance recorded yet for this scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const PROTOCOL_ATTENDANCE_STATUSES: ProtocolAttendanceStatus[] = [
  'PRESENT',
  'HALF_PRESENT',
  'EXCUSED',
  'ABSENT',
];
