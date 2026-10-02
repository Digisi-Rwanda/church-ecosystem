import { useState } from 'react';
import { Link } from 'react-router-dom';
import { roleLabel } from '../../domain/access';
import type { Person, PersonTimelineEvent } from '../../domain/types';
import { usePersonRecord } from '../../hooks/usePersonRecord';
import {
  buildPersonParticipationPlaces,
  participationService,
  peopleService,
} from '../../services';
import { Icon, type IconName } from '../ui/Icon';
import { PersonRecordTable } from './PersonRecordTable';

const STATUS_LABEL: Record<Person['status'], string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  VISITOR: 'Visitor',
};

const KIND_ICON: Record<PersonTimelineEvent['kind'], IconName> = {
  MEMBERSHIP: 'users',
  BAPTISM: 'check',
  MARRIAGE: 'users',
  MINISTRY: 'systems',
  DISCIPLINE: 'alert',
  NOTE: 'info',
  OTHER: 'info',
};

function firstName(p: Person): string {
  return (p.preferredName || p.fullName).split(' ')[0];
}

function initials(p: Person): string {
  return (p.preferredName || p.fullName).slice(0, 1).toUpperCase();
}

/**
 * People page workspace: member rail on the left, a header with quick facts,
 * the 16 record sections as tabs, and a history timeline on the right.
 */
export function PersonWorkspace({
  people,
  selected,
  onSelect,
  canManagePeople,
}: {
  people: Person[];
  selected: Person;
  onSelect: (id: string) => void;
  canManagePeople: boolean;
}) {
  return (
    <div className="pw list-surface">
      <nav className="pw-rail" aria-label="Members">
        <ul role="listbox" aria-label="People">
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={p.id === selected.id}
                className={`pw-rail-item${p.id === selected.id ? ' selected' : ''}`}
                onClick={() => onSelect(p.id)}
                title={p.fullName}
              >
                <span className="pw-rail-avatar" aria-hidden>
                  {initials(p)}
                </span>
                <span className="pw-rail-name">{firstName(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {/* key resets the tab whenever another member is picked */}
      <PersonPane
        key={selected.id}
        person={selected}
        canManagePeople={canManagePeople}
      />
    </div>
  );
}

function PersonPane({
  person,
  canManagePeople,
}: {
  person: Person;
  canManagePeople: boolean;
}) {
  const [tab, setTab] = useState('overview');
  const { rows, seeFullFields } = usePersonRecord(person);

  const memberships = participationService.activeMemberships(person.id);
  const positions = participationService.activePositions(person.id);
  const assignments = participationService.activeAssignments(person.id);
  const roles = participationService.rolesFor(person.id);
  const places = buildPersonParticipationPlaces({
    memberships,
    positions,
    assignments,
  });

  const history = seeFullFields ? peopleService.timeline(person.id) : [];
  const activeRow = rows.find((r) => r.key === tab) ?? rows[0];

  return (
    <div className="pw-main">
      <header className="pw-head">
        <div className="pw-photo" aria-hidden>
          {initials(person)}
        </div>
        <div className="pw-id">
          <h3 className="pw-name">
            {person.fullName}
            <span
              className={`pw-dot pw-dot-${person.status.toLowerCase()}`}
              title={STATUS_LABEL[person.status]}
            />
          </h3>
          <p className="muted pw-sub">
            {STATUS_LABEL[person.status]}
            {person.preferredName && person.preferredName !== person.fullName
              ? ` · “${person.preferredName}”`
              : ''}
          </p>
          <div className="pw-contact">
            {person.phone ? (
              <>
                <a href={`tel:${person.phone}`}>Call</a>
                <a href={`sms:${person.phone}`}>SMS</a>
              </>
            ) : null}
            {person.email ? <a href={`mailto:${person.email}`}>Email</a> : null}
            {!person.phone && !person.email ? (
              <span className="muted">No contact on file</span>
            ) : null}
          </div>
        </div>
        <dl className="pw-stats">
          <div className="pw-stat">
            <dt>Role</dt>
            <dd>
              {roles.length === 0
                ? 'Member'
                : roles.map((r) => roleLabel(r)).join(' · ')}
            </dd>
          </div>
          <div className="pw-stat">
            <dt>Participates in</dt>
            <dd>
              {places.length} {places.length === 1 ? 'place' : 'places'}
            </dd>
          </div>
          <div className="pw-stat">
            <dt>Joined church</dt>
            <dd>{person.joinedChurchOn ?? '—'}</dd>
          </div>
        </dl>
        <div className="pw-actions">
          <Link to={`/people/${person.id}`} className="btn sm">
            Open full profile
          </Link>
          {canManagePeople ? (
            <Link to={`/people/${person.id}/edit`} className="btn ghost sm">
              Edit
            </Link>
          ) : null}
        </div>
      </header>

      <div className="pw-tabs" role="tablist" aria-label="Record sections">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            role="tab"
            id={`pw-tab-${row.key}`}
            aria-selected={row.key === activeRow.key}
            aria-controls="pw-panel"
            className={`pw-tab${row.key === activeRow.key ? ' active' : ''}${row.restricted ? ' restricted' : ''}`}
            onClick={() => setTab(row.key)}
          >
            {row.label}
            {row.restricted ? <Icon name="lock" size={11} /> : null}
          </button>
        ))}
      </div>

      <div className="pw-body">
        <div
          className="pw-content"
          role="tabpanel"
          id="pw-panel"
          aria-labelledby={`pw-tab-${activeRow.key}`}
        >
          {activeRow.key === 'overview' ? (
            <>
              <section className="pw-card">
                <h4 className="pw-card-title">Where they participate</h4>
                {places.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    No memberships, positions, or assignments on file
                  </p>
                ) : (
                  <div className="pw-tiles">
                    {places.map((place) => (
                      <article key={place.key} className="pw-tile">
                        <strong>{place.placeName}</strong>
                        {place.roles.length > 0 ? (
                          <span className="pw-tile-line">
                            Role · {place.roles.join(' · ')}
                          </span>
                        ) : null}
                        {place.lines.slice(0, 2).map((line) => (
                          <span key={line} className="pw-tile-line muted">
                            {line}
                          </span>
                        ))}
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section className="pw-card">
                <h4 className="pw-card-title">Record summary</h4>
                <PersonRecordTable
                  person={person}
                  rows={rows}
                  onOpenSection={setTab}
                />
              </section>
            </>
          ) : (
            <section className="pw-card">
              <h4 className="pw-card-title">{activeRow.label}</h4>
              {activeRow.restricted ? (
                <p className="pw-restricted">
                  <Icon name="lock" size={14} /> Restricted —{' '}
                  {activeRow.restrictedReason}
                </p>
              ) : activeRow.empty ? (
                <p className="muted" style={{ margin: 0 }}>
                  Nothing on file
                </p>
              ) : (
                <ul className="pw-lines">
                  {activeRow.lines.map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              )}
              {activeRow.restricted ? null : (
                <Link
                  to={`/people/${person.id}?section=${activeRow.key}`}
                  className="pw-pill"
                >
                  See everything in the full profile
                </Link>
              )}
            </section>
          )}
        </div>

        <aside className="pw-history" aria-label="History">
          <h4 className="pw-history-title">History</h4>
          {!seeFullFields ? (
            <p className="muted pw-history-empty">
              <Icon name="lock" size={13} /> Pastoral / secretary access only
            </p>
          ) : history.length === 0 ? (
            <p className="muted pw-history-empty">Nothing recorded yet.</p>
          ) : (
            <ol className="pw-timeline">
              {history.slice(0, 8).map((e) => (
                <li key={e.id}>
                  <span className="pw-timeline-icon" aria-hidden>
                    <Icon name={KIND_ICON[e.kind]} size={13} />
                  </span>
                  <div>
                    <span className="pw-timeline-date muted">{e.at}</span>
                    <strong className="pw-timeline-title">{e.title}</strong>
                    {e.detail ? (
                      <span className="pw-timeline-detail">{e.detail}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {seeFullFields && history.length > 8 ? (
            <button
              type="button"
              className="pw-link"
              onClick={() => setTab('history')}
            >
              + {history.length - 8} more in History
            </button>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
