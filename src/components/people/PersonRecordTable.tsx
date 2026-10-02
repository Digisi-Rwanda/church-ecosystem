import { Link } from 'react-router-dom';
import type { Person } from '../../domain/types';
import type { PersonRecordRow } from '../../services/personRecordSummary';

/**
 * Table of every profile section for one member (Overview → Account).
 * `rows` already carry the viewer's access (see usePersonRecord), so a viewer
 * only ever sees what the profile page would show them.
 */
export function PersonRecordTable({
  person,
  rows,
  onOpenSection,
}: {
  person: Person;
  rows: PersonRecordRow[];
  /** Switch to that tab in place; without it the Open link goes to the profile. */
  onOpenSection?: (key: string) => void;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table people-record-table">
        <thead>
          <tr>
            <th scope="col" style={{ width: '12rem' }}>
              Section
            </th>
            <th scope="col">Details</th>
            <th scope="col" style={{ width: '5rem' }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th
                scope="row"
                style={{
                  verticalAlign: 'top',
                  textTransform: 'none',
                  letterSpacing: 'normal',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'inherit',
                }}
              >
                {row.label}
              </th>
              <td style={{ verticalAlign: 'top' }}>
                {row.restricted ? (
                  <span className="muted">
                    Restricted — {row.restrictedReason}
                  </span>
                ) : row.empty ? (
                  <span className="muted">Nothing on file</span>
                ) : (
                  row.lines.map((line, i) => (
                    <div key={`${i}-${line}`}>{line}</div>
                  ))
                )}
              </td>
              <td style={{ verticalAlign: 'top', textAlign: 'right' }}>
                {row.restricted ? null : onOpenSection ? (
                  <button
                    type="button"
                    className="pw-link"
                    onClick={() => onOpenSection(row.key)}
                  >
                    Open
                  </button>
                ) : (
                  <Link
                    to={`/people/${person.id}?section=${row.key}`}
                    className="muted"
                  >
                    Open
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
