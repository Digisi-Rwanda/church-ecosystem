import { useEffect, useMemo } from 'react';
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PeopleGrid } from '../components/people/PeopleGrid';
import { ForbiddenState } from '../components/ui/StatusPill';
import type { PeopleSearchFacet, PeopleSearchScope } from '../services';
import { peopleService } from '../services';
import { pastoralOpsService } from '../services/pastoralOpsService';
import {
  PEOPLE_TABLE_KEYS,
  PEOPLE_TABLE_META,
  isPeopleTableKey,
} from '../services/peopleTables';

/**
 * Full-screen version of one People table. It covers the whole window (no
 * sidebar or top bar) so the table gets all the room; Esc or "Back to People"
 * returns. Opens with the same search and status filter as the People page.
 */
export function PeopleTablePage() {
  const { table } = useParams();
  const { canViewPeople, account } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const q = params.get('q') ?? '';
  const scope = (params.get('scope') ?? 'all') as PeopleSearchScope;
  const facet = (params.get('facet') ?? 'any') as PeopleSearchFacet;
  const category = params.get('category') ?? undefined;
  const status = params.get('status') ?? 'all';
  const qs = params.toString() ? `?${params.toString()}` : '';

  const people = useMemo(() => {
    const found = peopleService.search(q, {
      scope,
      facet: scope === 'all' ? 'any' : facet,
      category,
    });
    if (status === 'pathway') {
      const ids = new Set(
        pastoralOpsService.listPathways({ openOnly: true }).map((p) => p.personId),
      );
      return found.filter((p) => ids.has(p.id));
    }
    if (status === 'all') return found;
    return found.filter((p) => p.status === status);
  }, [q, scope, facet, category, status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
      if (e.key === 'Escape' && !typing) navigate('/people');
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [navigate]);

  if (!canViewPeople) {
    if (account?.personId) {
      return <Navigate to={`/people/${account.personId}`} replace />;
    }
    return (
      <ForbiddenState
        resource="PERSON"
        action="VIEW"
        detail="The directory is for church and ministry leaders."
        recovery={
          <Link to="/" className="btn secondary">
            Back home
          </Link>
        }
      />
    );
  }
  if (!isPeopleTableKey(table)) {
    return <Navigate to="/people" replace />;
  }

  return (
    <div className="fs-overlay" role="dialog" aria-label="People table, full page">
      <header className="fs-bar">
        <Link to="/people" className="btn secondary sm">
          ← Back to People
        </Link>
        <nav className="fs-tabs" aria-label="People tables">
          {PEOPLE_TABLE_KEYS.map((k) => (
            <Link
              key={k}
              to={`/people/tables/${k}${qs}`}
              className={`pw-tab${k === table ? ' active' : ''}`}
              aria-current={k === table ? 'page' : undefined}
            >
              {PEOPLE_TABLE_META[k].title}
            </Link>
          ))}
        </nav>
        <span className="muted fs-hint">
          {people.length} {people.length === 1 ? 'person' : 'people'} · Esc to
          go back
        </span>
      </header>
      <div className="fs-body">
        <PeopleGrid
          key={table}
          table={table}
          people={people}
          fill
          defaultPageSize={25}
          pageSizeOptions={[10, 25, 50, 100]}
        />
      </div>
    </div>
  );
}
