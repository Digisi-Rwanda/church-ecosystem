import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { protocolService } from '../../services';

/**
 * Music ↔ Protocol health for one month:
 *  - "Music changed since these teams were built" banner with the exact changes;
 *  - blocking rule violations (choir / Worship conflicts can be overridden by
 *    the Coordinator with a written reason; hard rules cannot);
 *  - overrides already granted.
 * Submit and publish stay blocked until the banner is cleared and no blocking
 * issue is left.
 */
export function ProtocolMusicSyncPanel({
  monthKey,
  tick,
  onChange,
  canManage,
}: {
  monthKey: string;
  tick: number;
  onChange: () => void;
  canManage: boolean;
}) {
  const { account } = useAuth();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');

  const sync = useMemo(
    () => protocolService.musicSync(monthKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKey, tick],
  );
  const detail = useMemo(
    () => protocolService.validateMonthDetailed(monthKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKey, tick],
  );
  const plan = protocolService.getMonthPlan(monthKey);
  const isCoordinator =
    !!account && protocolService.officeFor(account.personId) === 'COORDINATOR';
  const editable = plan?.status !== 'PUBLISHED';

  const nothing =
    sync.state !== 'STALE' &&
    detail.blocking.length === 0 &&
    detail.overridden.length === 0;
  if (nothing) return null;

  /** Messages carry raw person ids; show names instead. */
  function readable(i: { message: string; personId?: string }): string {
    return i.personId
      ? i.message.replace(i.personId, protocolService.personLabel(i.personId))
      : i.message;
  }

  function act(r: { ok: boolean; reason?: string }, okMsg: string) {
    setMessage(r.ok ? okMsg : (r.reason ?? 'Failed'));
    onChange();
  }

  return (
    <div className="stack">
      {sync.state === 'STALE' && (
        <div
          className="panel"
          role="alert"
          style={{ borderLeft: '4px solid #d97706' }}
        >
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>
              Music schedule changed since these teams were built
            </h3>
            <span className="badge planned">
              Music v{sync.builtOn ?? '?'} → v{sync.current ?? '?'}
            </span>
          </div>
          <p className="muted" style={{ margin: '0.4rem 0' }}>
            {plan?.status === 'PUBLISHED'
              ? 'The published schedule may no longer match Music. Reopen to draft to fix it, or confirm the changes are fine.'
              : 'Submit and publish are paused until you review these changes.'}
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {sync.changes.slice(0, 12).map((c) => (
              <li key={c.key}>{c.summary}</li>
            ))}
          </ul>
          {sync.changes.length > 12 && (
            <p className="muted">+{sync.changes.length - 12} more</p>
          )}
          {canManage && (
            <div className="row" style={{ marginTop: '0.6rem' }}>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  account &&
                  act(
                    protocolService.acknowledgeMusicChange(
                      monthKey,
                      account.personId,
                    ),
                    'Changes reviewed — checking the teams against the new Music schedule',
                  )
                }
              >
                I’ve reviewed these changes
              </button>
              {isCoordinator && editable && plan?.status !== 'REVIEW' && (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    if (!account) return;
                    const g = protocolService.generateTeams(
                      monthKey,
                      account.personId,
                    );
                    act(
                      { ok: g.ok, reason: g.reason },
                      'Teams rebuilt from the new Music schedule',
                    );
                  }}
                >
                  Rebuild teams
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {detail.blocking.length > 0 && (
        <div
          className="panel"
          style={{ borderLeft: '4px solid #dc2626' }}
        >
          <h3 style={{ marginTop: 0 }}>
            Blocking issues ({detail.blocking.length})
          </h3>
          <p className="muted" style={{ marginTop: 0 }}>
            These stop submit and publish.{' '}
            {isCoordinator
              ? 'Choir and Worship conflicts can be overridden with a reason.'
              : 'Only the Coordinator can override a choir or Worship conflict.'}
          </p>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {detail.blocking.map((i) => {
              const overridable = protocolService.isOverridable(i);
              return (
                <li
                  key={i.key}
                  style={{ padding: '0.4rem 0', borderTop: '1px solid var(--border, #e5e7eb)' }}
                >
                  <div>{readable(i)}</div>
                  {!overridable ? (
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      Hard rule — fix the team; it can’t be overridden.
                    </div>
                  ) : isCoordinator && editable ? (
                    <div className="row" style={{ marginTop: '0.3rem', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="Reason for the exception"
                        value={reasons[i.key] ?? ''}
                        onChange={(e) =>
                          setReasons((r) => ({ ...r, [i.key]: e.target.value }))
                        }
                        style={{ flex: '1 1 16rem' }}
                        aria-label={`Reason to override: ${i.message}`}
                      />
                      <button
                        type="button"
                        className="btn secondary sm"
                        onClick={() =>
                          account &&
                          act(
                            protocolService.overrideIssue(
                              monthKey,
                              i.key,
                              reasons[i.key] ?? '',
                              account.personId,
                            ),
                            'Override recorded',
                          )
                        }
                      >
                        Override
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {detail.overridden.length > 0 && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>
            Approved exceptions ({detail.overridden.length})
          </h3>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {detail.overridden.map(({ issue, override }) => (
              <li key={issue.key} style={{ padding: '0.35rem 0' }}>
                <div>{readable(issue)}</div>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  “{override.reason}” — {protocolService.personLabel(override.byPersonId)}
                </div>
                {isCoordinator && editable && (
                  <button
                    type="button"
                    className="btn secondary sm"
                    onClick={() =>
                      account &&
                      act(
                        protocolService.clearOverride(
                          monthKey,
                          issue.key,
                          account.personId,
                        ),
                        'Override removed',
                      )
                    }
                  >
                    Remove override
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && <p className="muted">{message}</p>}
    </div>
  );
}
