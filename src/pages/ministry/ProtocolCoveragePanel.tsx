import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { protocolService } from '../../services';
import type { ProtocolCoverageRow } from '../../services/protocolService';

const WHY: Record<NonNullable<ProtocolCoverageRow['limitedBy']>, string> = {
  MUSIC: 'too few members have their choir on this service',
  AVAILABILITY: 'too few members can serve this day / are available',
  DUTY_CAP: 'members reach their monthly duty limit before this service',
};

/**
 * Heads-up before (re)generating teams: which services a dry run of the
 * generator cannot fill, and why. The Coordinator can relax the choir rule for
 * Tuesdays (with a reason) when that is what is holding teams back.
 */
export function ProtocolCoveragePanel({
  monthKey,
  tick,
  onChange,
  editable,
}: {
  monthKey: string;
  tick: number;
  onChange: () => void;
  editable: boolean;
}) {
  const { account } = useAuth();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');

  const preview = useMemo(
    () => protocolService.coveragePreview(monthKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKey, tick],
  );
  const plan = protocolService.getMonthPlan(monthKey);
  const isCoordinator =
    !!account && protocolService.isCoordinator(account.personId);

  if (preview.rows.length === 0) return null;
  const relaxed = preview.tuesdayRelaxed;
  const tuesdayShort = preview.shortRows.filter((r) => r.kind === 'TUESDAY');
  const relaxHelps = tuesdayShort.some(
    (r) => r.projectedIfTuesdayRelaxed > r.projected,
  );
  if (preview.shortRows.length === 0 && preview.notes.length === 0 && !relaxed) {
    return null;
  }

  function act(r: { ok: boolean; reason?: string }, ok: string) {
    setMessage(r.ok ? ok : (r.reason ?? 'Failed'));
    onChange();
  }

  return (
    <div className="panel" style={{ borderLeft: '4px solid #d97706' }}>
      <h3 style={{ marginTop: 0 }}>
        {preview.shortRows.length > 0
          ? `${preview.shortRows.length} service${preview.shortRows.length === 1 ? '' : 's'} can’t be fully staffed`
          : 'Coverage'}
      </h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Based on a dry run of the generator for {monthKey}. Nothing is saved.
      </p>

      {preview.notes.map((n) => (
        <p key={n} style={{ margin: '0.25rem 0' }}>
          {n}
        </p>
      ))}

      {preview.shortRows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Team</th>
              <th>Why</th>
              {isCoordinator && !relaxed ? <th>If Tuesday rule relaxed</th> : null}
            </tr>
          </thead>
          <tbody>
            {preview.shortRows.map((r) => (
              <tr key={r.serviceId}>
                <td>
                  {r.kind} {r.date}
                </td>
                <td>
                  <span className="badge planned">
                    {r.projected}/{r.target}
                  </span>
                </td>
                <td>{r.limitedBy ? WHY[r.limitedBy] : '—'}</td>
                {isCoordinator && !relaxed ? (
                  <td>
                    {r.kind === 'TUESDAY'
                      ? `${r.projectedIfTuesdayRelaxed}/${r.target}`
                      : '—'}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {relaxed && (
        <div style={{ marginTop: '0.6rem' }}>
          <span className="badge planned">Tuesday choir rule relaxed</span>
          <p className="muted" style={{ margin: '0.3rem 0' }}>
            “{plan?.relaxReason}”
            {plan?.relaxedByPersonId
              ? ` — ${protocolService.personLabel(plan.relaxedByPersonId)}`
              : ''}
          </p>
          {isCoordinator && editable && (
            <button
              type="button"
              className="btn secondary sm"
              onClick={() =>
                account &&
                act(
                  protocolService.setTuesdayChoirRelaxed(
                    monthKey,
                    false,
                    '',
                    account.personId,
                  ),
                  'Rule restored — rebuild the teams to apply it',
                )
              }
            >
              Restore the rule
            </button>
          )}
        </div>
      )}

      {!relaxed && isCoordinator && editable && relaxHelps && (
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ margin: '0 0 0.35rem' }}>
            Tuesday teams are short mainly because members are only placed when
            their choir is on that service. You can relax that rule for Tuesdays
            this month.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Reason (shown at review and kept in history)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ flex: '1 1 18rem' }}
              aria-label="Reason to relax the Tuesday choir rule"
            />
            <button
              type="button"
              className="btn"
              disabled={reason.trim().length < 5}
              onClick={() =>
                account &&
                act(
                  protocolService.setTuesdayChoirRelaxed(
                    monthKey,
                    true,
                    reason,
                    account.personId,
                  ),
                  'Tuesday rule relaxed — rebuild the teams to apply it',
                )
              }
            >
              Relax for Tuesdays
            </button>
          </div>
        </div>
      )}

      {message && <p className="muted">{message}</p>}
    </div>
  );
}
