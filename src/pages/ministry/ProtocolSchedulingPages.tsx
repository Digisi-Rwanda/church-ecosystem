import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import type {
  ProtocolAttendanceStatus,
  ProtocolTeamRole,
} from '../../domain/types';
import { PROTOCOL_SCORE_POINTS } from '../../domain/teamEngine';
import { musicScheduleService, protocolService } from '../../services';

const SYS = 'sys-protocol' as const;

function useProtocolMonth() {
  const initial = protocolService.liveMonthKey();
  const [monthKey, setMonthKey] = useState(initial);
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
          {m}
        </option>
      ))}
    </select>
  );
}

function roleLabel(role: ProtocolTeamRole) {
  if (role === 'TEAM_LEADER') return 'TL';
  if (role === 'VICE_LEADER') return 'VTL';
  return 'Member';
}

/**
 * Service teams workspace — depends on published Music schedule.
 * Generate → recommend TL/VTL → coordinator approve/manual → review/publish.
 */
export function ProtocolTeamsPage() {
  const { account, can } = useAuth();
  const canView = can('PROTOCOL_SCHEDULE', 'VIEW', SYS);
  const canManage = can('PROTOCOL_SCHEDULE', 'MANAGE', SYS);
  const { monthKey, setMonthKey, refresh, tick } = useProtocolMonth();
  const [message, setMessage] = useState('');
  const [focusServiceId, setFocusServiceId] = useState<string | null>(null);

  const musicPublished = useMemo(
    () => musicScheduleService.getPublished(monthKey),
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
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>Service teams</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Built from published Music schedule · team of {rules.defaultTeamSize}{' '}
              · target {rules.preferTarget}/month · Extra when all at target · no
              Friday
            </p>
          </div>
          <MonthPicker monthKey={monthKey} onChange={setMonthKey} />
        </div>

        <div className="row" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <span className="badge">{plan?.status ?? 'OPEN'}</span>
          {musicPublished ? (
            <span className="badge">
              Music published v{musicPublished.version}
            </span>
          ) : (
            <span className="badge planned">Music schedule missing</span>
          )}
          {!musicPublished && (
            <Link className="btn secondary sm" to="/systems/music/schedule">
              Open Music schedule
            </Link>
          )}
          {canManage && (
            <button
              type="button"
              className="btn"
              disabled={!musicPublished && services.length === 0}
              onClick={() => {
                const result = protocolService.generateTeams(monthKey);
                setMessage(
                  result.ok
                    ? `Built ${result.slotCount} slots` +
                        (result.warnings.length
                          ? ` · ${result.warnings.length} notes`
                          : '')
                    : (result.reason ?? 'Failed'),
                );
                refresh();
              }}
            >
              Generate / rebuild
            </button>
          )}
          <Link to="/systems/protocol/review">Review & publish →</Link>
          <Link to="/systems/protocol/faithful">Faithful Servant →</Link>
        </div>
        {message && <p className="muted">{message}</p>}
        {!musicPublished && (
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            Protocol cannot staff teams until Music publishes this month&apos;s
            choir schedule (SS1, SS2, Tuesday, Igaburo — not Friday).
          </p>
        )}
      </div>

      <div className="grid-2">
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

        <div className="panel">
          <h3>Teams by service</h3>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {services.map((svc) => {
              const team = protocolService.teamForService(svc.id);
              return (
                <li key={svc.id} className="panel" style={{ padding: '0.65rem' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>
                      {svc.kind} · {svc.date}
                    </strong>
                    <span className="muted">
                      {team.length}/{svc.targetTeamSize}
                    </span>
                  </div>
                  {team.length === 0 ? (
                    <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                      No team yet — generate
                    </p>
                  ) : (
                    <ul
                      style={{
                        margin: '0.35rem 0 0',
                        paddingLeft: '1.1rem',
                        fontSize: '0.9rem',
                      }}
                    >
                      {team.map((slot) => (
                        <li key={slot.id}>
                          {protocolService.personLabel(slot.personId)}
                          {slot.recommendedRole &&
                          slot.recommendedRole !== 'MEMBER' &&
                          slot.roleStatus === 'RECOMMENDED' ? (
                            <span className="badge planned">
                              rec. {roleLabel(slot.recommendedRole)}
                            </span>
                          ) : null}{' '}
                          {slot.role !== 'MEMBER' ? (
                            <span className="badge">{roleLabel(slot.role)}</span>
                          ) : null}{' '}
                          {slot.slotKind === 'EXTRA' ? (
                            <span className="badge planned">Extra</span>
                          ) : null}
                          {slot.slotKind === 'FILL_IN' ? (
                            <span className="badge">Fill-in</span>
                          ) : null}
                          {teamsEditable && slot.slotKind !== 'FILL_IN' && (
                            <span className="row" style={{ marginLeft: '0.35rem' }}>
                              <select
                                defaultValue=""
                                aria-label={`Replace ${protocolService.personLabel(slot.personId)}`}
                                onChange={(e) => {
                                  const toId = e.target.value;
                                  if (!toId || !account) return;
                                  const r = protocolService.replaceTeamMember(
                                    svc.id,
                                    slot.personId,
                                    toId,
                                    account.personId,
                                  );
                                  setMessage(
                                    r.ok
                                      ? 'Member replaced'
                                      : (r.reason ?? 'Failed'),
                                  );
                                  refresh();
                                  e.target.value = '';
                                }}
                              >
                                <option value="">Replace…</option>
                                {protocolService
                                  .eligibleForServiceTeam(svc.id)
                                  .map((m) => (
                                    <option key={m.id} value={m.personId}>
                                      {protocolService.personLabel(m.personId)}
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                className="btn ghost sm"
                                onClick={() => {
                                  if (!account) return;
                                  const r = protocolService.removeTeamMember(
                                    svc.id,
                                    slot.personId,
                                    account.personId,
                                  );
                                  setMessage(
                                    r.ok
                                      ? 'Member removed'
                                      : (r.reason ?? 'Failed'),
                                  );
                                  refresh();
                                }}
                              >
                                Remove
                              </button>
                            </span>
                          )}
                        </li>
                      ))}
                      {teamsEditable &&
                        team.filter((s) => s.slotKind !== 'FILL_IN').length <
                          svc.targetTeamSize && (
                          <li style={{ marginTop: '0.35rem' }}>
                            <label className="muted" style={{ fontSize: '0.85rem' }}>
                              Add member (target {svc.targetTeamSize})
                              <select
                                defaultValue=""
                                onChange={(e) => {
                                  const pid = e.target.value;
                                  if (!pid || !account) return;
                                  const r = protocolService.addTeamMember(
                                    svc.id,
                                    pid,
                                    account.personId,
                                  );
                                  setMessage(
                                    r.ok ? 'Member added' : (r.reason ?? 'Failed'),
                                  );
                                  refresh();
                                  e.target.value = '';
                                }}
                              >
                                <option value="">Choose…</option>
                                {protocolService
                                  .eligibleForServiceTeam(svc.id)
                                  .map((m) => (
                                    <option key={m.id} value={m.personId}>
                                      {protocolService.personLabel(m.personId)}
                                    </option>
                                  ))}
                              </select>
                            </label>
                          </li>
                        )}
                    </ul>
                  )}
                  {canManage && team.length > 0 && (
                    <button
                      type="button"
                      className="btn ghost sm"
                      style={{ marginTop: '0.35rem' }}
                      onClick={() =>
                        setFocusServiceId(
                          focusServiceId === svc.id ? null : svc.id,
                        )
                      }
                    >
                      {focusServiceId === svc.id
                        ? 'Hide TL/VTL'
                        : 'Approve TL / VTL'}
                    </button>
                  )}
                  {canManage && focusServiceId === svc.id && (
                    <div className="stack" style={{ marginTop: '0.5rem' }}>
                      {team
                        .filter(
                          (s) =>
                            s.recommendedRole === 'TEAM_LEADER' ||
                            s.recommendedRole === 'VICE_LEADER' ||
                            s.role === 'TEAM_LEADER' ||
                            s.role === 'VICE_LEADER',
                        )
                        .map((s) => (
                          <div key={s.id} className="row">
                            <span>
                              {protocolService.personLabel(s.personId)} ·{' '}
                              {s.roleStatus ?? '—'}
                            </span>
                            {s.roleStatus === 'RECOMMENDED' &&
                              account &&
                              s.recommendedRole &&
                              s.recommendedRole !== 'MEMBER' && (
                                <>
                                  <button
                                    type="button"
                                    className="btn sm"
                                    onClick={() => {
                                      const r = protocolService.approveTeamRole(
                                        svc.id,
                                        s.personId,
                                        account.personId,
                                      );
                                      setMessage(
                                        r.ok
                                          ? 'Role approved'
                                          : (r.reason ?? 'Failed'),
                                      );
                                      refresh();
                                    }}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="btn secondary sm"
                                    onClick={() => {
                                      protocolService.setTeamRole(
                                        svc.id,
                                        s.personId,
                                        'MEMBER',
                                        account.personId,
                                      );
                                      setMessage('Recommendation cleared');
                                      refresh();
                                    }}
                                  >
                                    Decline
                                  </button>
                                </>
                              )}
                          </div>
                        ))}
                      <label className="muted" style={{ fontSize: '0.85rem' }}>
                        Manual TL
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const pid = e.target.value;
                            if (!pid || !account) return;
                            protocolService.setTeamRole(
                              svc.id,
                              pid,
                              'TEAM_LEADER',
                              account.personId,
                            );
                            setMessage('Team Leader set');
                            refresh();
                            e.target.value = '';
                          }}
                        >
                          <option value="">Choose…</option>
                          {team.map((s) => (
                            <option key={s.id} value={s.personId}>
                              {protocolService.personLabel(s.personId)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="muted" style={{ fontSize: '0.85rem' }}>
                        Manual VTL
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const pid = e.target.value;
                            if (!pid || !account) return;
                            protocolService.setTeamRole(
                              svc.id,
                              pid,
                              'VICE_LEADER',
                              account.personId,
                            );
                            setMessage('Vice Team Leader set');
                            refresh();
                            e.target.value = '';
                          }}
                        >
                          <option value="">Choose…</option>
                          {team.map((s) => (
                            <option key={s.id} value={s.personId}>
                              {protocolService.personLabel(s.personId)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
            {services.length === 0 && (
              <li className="muted">
                No Protocol services yet — publish Music, then generate.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Faithful Servant — served counts, extras, fill-ins, score, ranking. */
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
        <h2>Faithful Servant</h2>
        <p className="muted">No access</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>Faithful Servant</h2>
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
