import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { initialsOf } from './initials';

/**
 * One row of any list: avatar or icon, a title, a detail line, a status and one row action.
 * The whole row is a link when `to` is given, so the click target is large.
 */
export function ListRow({
  title,
  detail,
  avatarName,
  lead,
  status,
  action,
  to,
  from,
}: {
  title: ReactNode;
  detail?: ReactNode;
  /** A person's or group's name: shows its initials in a round avatar. */
  avatarName?: string;
  /** Instead of an avatar: an icon or any small element. */
  lead?: ReactNode;
  status?: ReactNode;
  /** The one thing you can do to this row (a button). */
  action?: ReactNode;
  to?: string;
  from?: string;
}) {
  const body = (
    <>
      {avatarName !== undefined ? (
        <span className="list-row-avatar" aria-hidden>
          {initialsOf(avatarName)}
        </span>
      ) : lead ? (
        <span className="list-row-lead" aria-hidden>
          {lead}
        </span>
      ) : null}
      <span className="list-row-text">
        <span className="list-row-title">{title}</span>
        {detail ? <span className="list-row-detail">{detail}</span> : null}
      </span>
      {status ? <span className="list-row-status">{status}</span> : null}
    </>
  );
  return (
    <li className="list-row">
      {to ? (
        <Link className="list-row-main" to={to} state={from ? { from } : undefined}>
          {body}
        </Link>
      ) : (
        <div className="list-row-main">{body}</div>
      )}
      {action ? <div className="list-row-action">{action}</div> : null}
    </li>
  );
}

/** The list that holds ListRows. */
export function RowList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="row-list" aria-label={label}>
      {children}
    </ul>
  );
}
