import { type FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Drawer } from '../../components/ui/Drawer';
import { FilterBar, PageHead } from '../../components/ui/FilterBar';
import {
  EmptyState,
  ForbiddenState,
  StatusPill,
} from '../../components/ui/StatusPill';
import type {
  ProtocolContributionType,
  ProtocolPaymentMethod,
} from '../../domain/types';
import { financeService, protocolService } from '../../services';

const SYS = 'sys-protocol' as const;

function useTick() {
  const [tick, setTick] = useState(0);
  return { tick, refresh: () => setTick((t) => t + 1) };
}

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

export function ProtocolFinancePage() {
  const { account, can } = useAuth();
  const { tick, refresh } = useTick();
  const canView = can('PROTOCOL_SCHEDULE', 'VIEW', SYS);
  const canVerify = account
    ? financeService.authorizeFund(account.personId, 'fund-protocol', 'MANAGE')
        .allowed
    : false;
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [amount, setAmount] = useState('5000');
  const [type, setType] = useState<ProtocolContributionType>('MONTHLY');
  const [method, setMethod] = useState<ProtocolPaymentMethod>('MOMO');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');

  const summary = useMemo(
    () => protocolService.contributionSummary(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const mine = useMemo(
    () =>
      account
        ? protocolService.listContributions({ personId: account.personId })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, tick],
  );
  const pending = useMemo(
    () => protocolService.listContributions({ status: 'PENDING' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const all = useMemo(
    () => protocolService.listContributions(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const filtered = useMemo(() => {
    if (statusFilter === 'pending') return pending;
    if (statusFilter === 'verified') {
      return all.filter((c) => c.status === 'VERIFIED');
    }
    if (statusFilter === 'rejected') {
      return all.filter((c) => c.status === 'REJECTED');
    }
    if (statusFilter === 'mine') return mine;
    return all;
  }, [all, mine, pending, statusFilter]);

  if (!account || !canView) {
    return (
      <div className="panel">
        <h2>Protocol finance</h2>
        <ForbiddenState resource="PROTOCOL_SCHEDULE" />
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await protocolService.submitContributionHybrid({
      personId: account!.personId,
      amount: Number(amount),
      contributionType: type,
      paymentMethod: method,
      note: note || undefined,
    });
    setMessage(
      result.ok
        ? 'Submitted for treasurer verification'
        : (result.reason ?? 'Failed'),
    );
    if (result.ok) {
      setNote('');
      setCreateOpen(false);
      refresh();
    }
  }

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Protocol contributions"
          subtitle="Members submit here. Treasurer verifies into the shared Protocol fund vault (org-private)."
          actions={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => setCreateOpen(true)}
              >
                Submit contribution
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  downloadText(
                    'protocol-contributions.csv',
                    protocolService.contributionsCsv(),
                    'text/csv;charset=utf-8',
                  )
                }
              >
                Download CSV
              </button>
            </>
          }
        />
        <div className="overview-strip" style={{ marginTop: '0.85rem' }}>
          <div className="overview-tile">
            <div className="label">Pending</div>
            <div className="value" style={{ fontSize: '1.1rem' }}>
              {summary.pendingCount}
            </div>
          </div>
          <div className="overview-tile">
            <div className="label">Pending RWF</div>
            <div className="value" style={{ fontSize: '1rem' }}>
              {financeService.formatAmount(summary.pendingAmount)}
            </div>
          </div>
          <div className="overview-tile">
            <div className="label">Verified</div>
            <div className="value" style={{ fontSize: '1.1rem' }}>
              {summary.verifiedCount}
            </div>
          </div>
          <div className="overview-tile">
            <div className="label">Fund balance</div>
            <div className="value" style={{ fontSize: '1rem' }}>
              {financeService.formatAmount(summary.fundBalance)}
            </div>
          </div>
        </div>
        {canVerify && (
          <p className="muted" style={{ marginBottom: 0, marginTop: '0.65rem' }}>
            <Link to="/systems/protocol/finance">
              Open Protocol fund ledger →
            </Link>
          </p>
        )}
        <div style={{ marginTop: '0.75rem' }}>
          <FilterBar
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All', count: all.length },
              { value: 'pending', label: 'Pending', count: pending.length },
              {
                value: 'verified',
                label: 'Verified',
                count: all.filter((c) => c.status === 'VERIFIED').length,
              },
              { value: 'mine', label: 'Mine', count: mine.length },
            ]}
          />
        </div>
        {message && <p className="badge">{message}</p>}
      </div>

      <Drawer
        open={createOpen}
        title="Submit contribution"
        onClose={() => setCreateOpen(false)}
      >
        <form className="stack" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="amt">Amount (RWF)</label>
            <input
              id="amt"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="ctype">Type</label>
            <select
              id="ctype"
              value={type}
              onChange={(e) =>
                setType(e.target.value as ProtocolContributionType)
              }
            >
              <option value="MONTHLY">Monthly</option>
              <option value="SPECIAL">Special</option>
              <option value="EVENT">Event</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="pmethod">Payment method</label>
            <select
              id="pmethod"
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as ProtocolPaymentMethod)
              }
            >
              <option value="MOMO">Mobile money</option>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="note">Note</label>
            <input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <button type="submit" className="btn">
            Submit
          </button>
        </form>
      </Drawer>

      {canVerify && pending.length > 0 && statusFilter !== 'verified' && (
        <div className="needs-me">
          <h3>Treasurer queue · {pending.length}</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Method</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.map((c) => (
                <tr key={c.id}>
                  <td>{protocolService.personLabel(c.personId)}</td>
                  <td>{financeService.formatAmount(c.amount)}</td>
                  <td>{c.contributionType}</td>
                  <td>{c.paymentMethod}</td>
                  <td>
                    <div className="row">
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          const r = await protocolService.verifyContributionHybrid(
                            c.id,
                            account.personId,
                          );
                          setMessage(
                            r.ok
                              ? 'Verified → Protocol fund ledger'
                              : (r.reason ?? 'Failed'),
                          );
                          refresh();
                        }}
                      >
                        Verify
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={async () => {
                          await protocolService.rejectContributionHybrid(
                            c.id,
                            account.personId,
                            'Needs clarification',
                          );
                          refresh();
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        {filtered.length === 0 ? (
          <EmptyState
            title={
              all.length > 0 ? 'No contributions match' : 'No contributions'
            }
            detail={
              all.length > 0
                ? 'This filter is empty. Switch to All to see contributions.'
                : 'Submit one, or wait for roster members to contribute.'
            }
            action={
              all.length > 0 ? (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setStatusFilter('all')}
                >
                  Show all
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCreateOpen(true)}
                >
                  Submit contribution
                </button>
              )
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Status</th>
                <th>Finance txn</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>{protocolService.personLabel(c.personId)}</td>
                  <td>{financeService.formatAmount(c.amount)}</td>
                  <td>
                    {c.contributionType} · {c.paymentMethod}
                  </td>
                  <td>
                    <StatusPill status={c.status}>{c.status}</StatusPill>
                  </td>
                  <td className="muted">{c.financeTxnId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function ProtocolNotificationsPage() {
  const { account, can } = useAuth();
  const { tick, refresh } = useTick();
  const canView = can('PROTOCOL_SCHEDULE', 'VIEW', SYS);

  const notes = useMemo(
    () => (account ? protocolService.notificationsFor(account.personId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, tick],
  );
  const activity = useMemo(
    () => protocolService.listActivity(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const unread = notes.filter((n) => !n.read).length;

  if (!account || !canView) {
    return (
      <div className="panel">
        <h2>Notifications</h2>
        <ForbiddenState resource="PROTOCOL_SCHEDULE" />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Inbox"
          subtitle="Schedule published, teams built, contribution updates"
          actions={
            unread > 0 ? (
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  protocolService.markAllNotificationsRead(account.personId);
                  refresh();
                }}
              >
                Mark all read ({unread})
              </button>
            ) : undefined
          }
        />
        {notes.length === 0 ? (
          <EmptyState
            title="Inbox empty"
            detail="Publish a schedule or submit a contribution to generate notifications."
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0 }}>
            {notes.map((n) => (
              <li
                key={n.id}
                style={{
                  padding: '0.65rem 0',
                  borderBottom: '1px solid var(--line)',
                  opacity: n.read ? 0.72 : 1,
                }}
              >
                <div
                  className="row"
                  style={{ justifyContent: 'space-between' }}
                >
                  <strong>{n.title}</strong>
                  <span className="muted">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="muted">{n.body}</div>
                <div className="row">
                  <StatusPill
                    tone={n.read ? 'neutral' : 'info'}
                  >
                    {n.kind}
                  </StatusPill>
                  {n.href && <Link to={n.href}>Open</Link>}
                  {!n.read && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        protocolService.markNotificationRead(n.id);
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

      <div className="panel">
        <h3>Activity trail</h3>
        {activity.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {activity.map((a) => (
              <li key={a.id}>
                <strong>{a.summary}</strong>
                <div className="muted">
                  {protocolService.personLabel(a.actorPersonId)} ·{' '}
                  {new Date(a.at).toLocaleString()} · {a.kind}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ProtocolReportsPage() {
  const { can } = useAuth();
  const canView = can('PROTOCOL_SCHEDULE', 'VIEW', SYS);
  const [monthKey, setMonthKey] = useState(protocolService.liveMonthKey());
  const report = protocolService.leadershipReport(monthKey);
  const maxDuty = Math.max(1, ...report.dutyLoad.map((d) => d.count));

  if (!canView) {
    return (
      <div className="panel">
        <h2>Reports</h2>
        <ForbiddenState resource="PROTOCOL_SCHEDULE" />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Leadership summary"
          subtitle="Attendance, duty load, and contribution snapshot"
          actions={<MonthPicker monthKey={monthKey} onChange={setMonthKey} />}
        />
        <div className="overview-strip" style={{ marginTop: '0.85rem' }}>
          <div className="overview-tile">
            <div className="label">Status</div>
            <div className="value" style={{ fontSize: '1rem' }}>
              <StatusPill status={report.status}>{report.status}</StatusPill>
            </div>
          </div>
          <div className="overview-tile">
            <div className="label">Attendance</div>
            <div className="value">
              {report.attendanceRate == null ? '—' : `${report.attendanceRate}%`}
            </div>
          </div>
          <div className="overview-tile">
            <div className="label">Recorded</div>
            <div className="value">
              {report.recordedRate == null ? '—' : `${report.recordedRate}%`}
            </div>
          </div>
          <div className="overview-tile">
            <div className="label">Slots</div>
            <div className="value">{report.slots}</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: '0.65rem' }}>
          <span className="badge">v{report.version}</span>
          <span className="badge">{report.services} services</span>
          <span className="badge">
            Present {report.attendanceByStatus.PRESENT} · Half{' '}
            {report.attendanceByStatus.HALF_PRESENT} · Absent{' '}
            {report.attendanceByStatus.ABSENT}
          </span>
          <Link to="/systems/protocol/export">Exports →</Link>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Duty load</h3>
          {report.dutyLoad.filter((d) => d.count > 0).length === 0 ? (
            <EmptyState
              title="No duties yet"
              detail="Generate and publish teams for this month."
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Duties</th>
                  <th>Load</th>
                </tr>
              </thead>
              <tbody>
                {report.dutyLoad
                  .filter((d) => d.count > 0)
                  .map((d) => (
                    <tr key={d.personId}>
                      <td>{d.name}</td>
                      <td>{d.count}</td>
                      <td style={{ minWidth: 100 }}>
                        <div className="capacity-meter" style={{ margin: 0 }}>
                          <div className="track">
                            <div
                              className="fill"
                              style={{
                                width: `${Math.round((d.count / maxDuty) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <h3>Contributions</h3>
          <p>
            Pending:{' '}
            {financeService.formatAmount(report.contributions.pendingAmount)} (
            {report.contributions.pendingCount})
          </p>
          <p>
            Verified:{' '}
            {financeService.formatAmount(report.contributions.verifiedAmount)} (
            {report.contributions.verifiedCount})
          </p>
          <p>
            Protocol fund balance:{' '}
            {financeService.formatAmount(report.contributions.fundBalance)}
          </p>
          <Link to="/systems/protocol/finance">Open finance →</Link>
        </div>
      </div>

      <div className="panel">
        <h3>Attendance by service</h3>
        {report.attendanceByService.every((a) => a.teamSize === 0) ? (
          <EmptyState title="No teams for this month" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Team</th>
                <th>Recorded</th>
                <th>Present/Late</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {report.attendanceByService
                .filter((a) => a.teamSize > 0)
                .map((a) => (
                  <tr key={a.service.id}>
                    <td>
                      {a.service.kind} {a.service.date}
                    </td>
                    <td>{a.teamSize}</td>
                    <td>{a.recorded}</td>
                    <td>{a.present}</td>
                    <td>
                      {a.teamSize === 0
                        ? '—'
                        : `${Math.round((a.present / a.teamSize) * 100)}%`}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function ProtocolExportPage() {
  const { can } = useAuth();
  const canView = can('PROTOCOL_SCHEDULE', 'VIEW', SYS);
  const [monthKey, setMonthKey] = useState(protocolService.liveMonthKey());
  const bulletin = protocolService.bulletinText(monthKey);

  if (!canView) {
    return (
      <div className="panel">
        <h2>Exports</h2>
        <ForbiddenState resource="PROTOCOL_SCHEDULE" />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Exports"
          subtitle="CSV downloads and bulletin-style print view"
          actions={<MonthPicker monthKey={monthKey} onChange={setMonthKey} />}
        />
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn"
            onClick={() =>
              downloadText(
                `protocol-schedule-${monthKey}.csv`,
                protocolService.scheduleCsv(monthKey),
                'text/csv;charset=utf-8',
              )
            }
          >
            Schedule CSV
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              downloadText(
                `protocol-attendance-${monthKey}.csv`,
                protocolService.attendanceCsv(monthKey),
                'text/csv;charset=utf-8',
              )
            }
          >
            Attendance CSV
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              downloadText(
                'protocol-contributions.csv',
                protocolService.contributionsCsv(),
                'text/csv;charset=utf-8',
              )
            }
          >
            Contributions CSV
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              downloadText(
                `protocol-bulletin-${monthKey}.txt`,
                bulletin,
                'text/plain;charset=utf-8',
              )
            }
          >
            Bulletin (.txt)
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>Bulletin preview</h3>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            margin: 0,
            fontSize: '0.95rem',
          }}
        >
          {bulletin}
        </pre>
      </div>
    </div>
  );
}
