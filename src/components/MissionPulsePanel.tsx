import { Link } from 'react-router-dom';
import type { ApiPulse } from '../api/missionApi';
import { blockerUrgency } from '../domain/deliveryRisk';
import { peopleService } from '../services';
import { StatusPill } from './ui/StatusPill';

export function MissionPulsePanel({
  pulse,
  sessionHref,
}: {
  pulse: ApiPulse;
  sessionHref?: string;
}) {
  const tone =
    pulse.health.tone === 'green'
      ? 'success'
      : pulse.health.tone === 'amber'
        ? 'warn'
        : pulse.health.tone === 'red'
          ? 'danger'
          : 'neutral';

  return (
    <div className="pulse-panel stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
            Pulse
          </p>
          <h3 style={{ margin: '0.15rem 0 0' }}>
            Health {pulse.health.score}
            <StatusPill tone={tone}> {pulse.health.label}</StatusPill>
          </h3>
        </div>
        <StatusPill status={pulse.status} />
      </div>

      {pulse.nextSession && (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>Next session</strong>
            <div className="muted">
              {pulse.nextSession.title} ·{' '}
              {new Date(pulse.nextSession.startsAt).toLocaleString()}
              {pulse.nextSession.sessionClosedAt ? ' · closed' : ''}
            </div>
          </div>
          {sessionHref && !pulse.nextSession.sessionClosedAt && (
            <Link to={sessionHref} className="btn">
              Session Mode
            </Link>
          )}
        </div>
      )}

      {pulse.openRequiredDelivery.length > 0 && (
        <div>
          <strong>Open required delivery</strong>
          <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
            {pulse.openRequiredDelivery.map((d, i) => (
              <li key={d.id ?? i}>{d.title ?? 'Required item'}</li>
            ))}
          </ul>
        </div>
      )}

      {pulse.needsMeHints.length > 0 && (
        <div>
          <strong>Needs attention</strong>
          <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
            {pulse.needsMeHints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
        Schedule {pulse.health.parts.schedule} · Delivery{' '}
        {pulse.health.parts.delivery} · People {pulse.health.parts.people}
      </p>

      {pulse.healthSnapshots && pulse.healthSnapshots.length > 0 && (
        <div>
          <strong>Health trend</strong>
          <div className="pulse-spark" aria-label="Recent health scores">
            {pulse.healthSnapshots.map((s) => (
              <div
                key={s.date}
                className={`pulse-spark-bar tone-${s.tone}`}
                title={`${s.date}: ${s.score} ${s.label}`}
                style={{ height: `${Math.max(12, s.score * 0.4)}px` }}
              />
            ))}
          </div>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>
            Last {pulse.healthSnapshots.length} day
            {pulse.healthSnapshots.length === 1 ? '' : 's'}
          </p>
        </div>
      )}

      {pulse.blockers && pulse.blockers.length > 0 && (
        <div>
          <strong>Blockers & risks</strong>
          <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
            {pulse.blockers.map((b) => {
              const urg = blockerUrgency({
                id: b.id,
                title: b.title,
                severity: b.severity as 'BLOCKER' | 'RISK',
                status: b.status as 'OPEN' | 'MITIGATING' | 'RESOLVED',
                ownerPersonId: b.ownerPersonId,
                createdAt: b.createdAt,
              });
              const owner =
                peopleService.getById(b.ownerPersonId)?.preferredName ??
                peopleService.getById(b.ownerPersonId)?.fullName ??
                b.ownerPersonId;
              return (
                <li key={b.id}>
                  <StatusPill
                    tone={
                      urg === 'critical'
                        ? 'danger'
                        : urg === 'warn'
                          ? 'warn'
                          : 'info'
                    }
                  >
                    {b.severity}
                  </StatusPill>{' '}
                  {b.title}
                  <span className="muted">
                    {' '}
                    · owner {owner} · {b.ageDays ?? 0}d
                    {b.taskId ? ` · task ${b.taskId.slice(0, 8)}` : ''}
                    {b.deliveryItemId
                      ? ` · delivery ${b.deliveryItemId.slice(0, 8)}`
                      : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {pulse.impact && (
        <div className="overview-strip">
          <div className="overview-tile">
            <div className="label">People served</div>
            <div className="value" style={{ fontSize: '1rem' }}>
              {pulse.impact.participantsServed}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
