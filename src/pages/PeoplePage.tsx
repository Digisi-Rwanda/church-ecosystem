import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { FilterBar, PageHead } from '../components/ui/FilterBar';
import { SelectField, TextField } from '../components/ui/Field';
import { PeopleTables } from '../components/people/PeopleTables';
import { Icon } from '../components/ui/Icon';
import { EmptyState, ForbiddenState } from '../components/ui/StatusPill';
import type { PeopleSearchFacet, PeopleSearchScope } from '../services';
import { peopleService } from '../services';
import { pastoralOpsService } from '../services/pastoralOpsService';

type StatusFilter = 'all' | 'ACTIVE' | 'INACTIVE' | 'VISITOR' | 'pathway';

const SEARCH_SCOPE_OPTIONS: { value: PeopleSearchScope; label: string }[] = [
  { value: 'all', label: 'All fields' },
  { value: 'address', label: 'Address' },
  { value: 'membership', label: 'Membership' },
  { value: 'baptism', label: 'Baptism' },
  { value: 'employment', label: 'Employment' },
  { value: 'education', label: 'Education' },
  { value: 'service', label: 'Service' },
  { value: 'talents', label: 'Talents & skills' },
  { value: 'gifts', label: 'Spiritual gifts' },
];

function defaultFacetFor(scope: PeopleSearchScope): PeopleSearchFacet {
  if (scope === 'employment') return 'current';
  if (scope === 'baptism' || scope === 'address') return 'yes';
  if (scope === 'all') return 'any';
  return 'any';
}

function searchPlaceholder(scope: PeopleSearchScope): string {
  switch (scope) {
    case 'employment':
      return 'Search job title, employer…';
    case 'education':
      return 'Search school, field, level…';
    case 'baptism':
      return 'Search place, minister…';
    case 'address':
      return 'Search street, area…';
    case 'membership':
      return 'Search membership type…';
    case 'service':
      return 'Search position, team…';
    case 'talents':
      return 'Search talent or skill…';
    case 'gifts':
      return 'Search spiritual gift…';
    default:
      return 'Name, job, school, gift, phone…';
  }
}

export function PeoplePage() {
  const { canManagePeople, canViewPeople, account } = useAuth();
  const [q, setQ] = useState('');
  const [searchScope, setSearchScope] = useState<PeopleSearchScope>('all');
  const [searchFacet, setSearchFacet] = useState<PeopleSearchFacet>('any');
  const [searchCategory, setSearchCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const facetOptions = useMemo(
    () =>
      searchScope === 'all'
        ? []
        : peopleService.searchFacetOptions(searchScope),
    [searchScope],
  );
  const categoryOptions = useMemo(
    () =>
      searchScope === 'all'
        ? []
        : peopleService.searchCategoryOptions(searchScope),
    [searchScope],
  );

  const searched = useMemo(
    () =>
      peopleService.search(q, {
        scope: searchScope,
        facet: searchScope === 'all' ? 'any' : searchFacet,
        category: searchCategory || undefined,
      }),
    [q, searchScope, searchFacet, searchCategory],
  );
  const pathwayPersonIds = useMemo(
    () =>
      new Set(
        pastoralOpsService
          .listPathways({ openOnly: true })
          .map((p) => p.personId),
      ),
    [],
  );

  const people = useMemo(() => {
    if (statusFilter === 'pathway') {
      return searched.filter((p) => pathwayPersonIds.has(p.id));
    }
    if (statusFilter === 'all') return searched;
    return searched.filter((p) => p.status === statusFilter);
  }, [searched, statusFilter, pathwayPersonIds]);

  const counts = useMemo(() => {
    const all = searched;
    return {
      all: all.length,
      ACTIVE: all.filter((p) => p.status === 'ACTIVE').length,
      INACTIVE: all.filter((p) => p.status === 'INACTIVE').length,
      VISITOR: all.filter((p) => p.status === 'VISITOR').length,
      pathway: all.filter((p) => pathwayPersonIds.has(p.id)).length,
    };
  }, [searched, pathwayPersonIds]);

  // Carry this page's search and status filter into the full-page tables.
  const fullPageQuery = (() => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (searchScope !== 'all') {
      sp.set('scope', searchScope);
      sp.set('facet', searchFacet);
      if (searchCategory) sp.set('category', searchCategory);
    }
    if (statusFilter !== 'all') sp.set('status', statusFilter);
    const text = sp.toString();
    return text ? `?${text}` : '';
  })();

  if (!canViewPeople) {
    if (account?.personId) {
      return <Navigate to={`/people/${account.personId}`} replace />;
    }
    return (
      <ForbiddenState
        resource="PERSON"
        action="VIEW"
        detail="The directory is for church and ministry leaders. Ask a leader if you need access, or open your own profile when linked to your account."
        recovery={
          <Link to="/" className="btn secondary">
            Back home
          </Link>
        }
      />
    );
  }

  return (
    <div className="list-page people-page">
      <div className="list-chrome">
        <PageHead
          actions={
            canManagePeople ? (
              <Link to="/people/new" className="btn">
                <Icon name="plus" size={15} />
                Add person
              </Link>
            ) : undefined
          }
        />
        <div className="list-toolbar people-toolbar">
          <div className="people-search-row">
            <div className="people-search">
              <TextField
                label="Search"
                name="search"
                id="people-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder(searchScope)}
              />
            </div>
            <div className="people-search-scope">
              <SelectField
                label="Look in"
                name="people-search-scope"
                id="people-search-scope"
                value={searchScope}
                onChange={(e) => {
                  const next = e.target.value as PeopleSearchScope;
                  setSearchScope(next);
                  setSearchFacet(defaultFacetFor(next));
                  setSearchCategory('');
                }}
              >
                {SEARCH_SCOPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </SelectField>
            </div>
            {facetOptions.length > 0 ? (
              <div className="people-search-scope">
                <SelectField
                  label="Show"
                  name="people-search-facet"
                  id="people-search-facet"
                  value={searchFacet}
                  onChange={(e) =>
                    setSearchFacet(e.target.value as PeopleSearchFacet)
                  }
                >
                  {facetOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </SelectField>
              </div>
            ) : null}
            {categoryOptions.length > 0 &&
            searchFacet !== 'none' &&
            searchFacet !== 'no' ? (
              <div className="people-search-scope">
                <SelectField
                  label={
                    searchScope === 'employment'
                      ? 'Sector'
                      : searchScope === 'education'
                        ? 'Level / field'
                        : searchScope === 'membership'
                          ? 'Membership type'
                          : 'Category'
                  }
                  name="people-search-category"
                  id="people-search-category"
                  value={searchCategory}
                  onChange={(e) => setSearchCategory(e.target.value)}
                >
                  <option value="">All</option>
                  {categoryOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </SelectField>
              </div>
            ) : null}
          </div>
          {searchScope !== 'all' ? (
            <p className="muted people-search-hint" style={{ margin: 0 }}>
              {searchScope === 'employment'
                ? 'Employment: pick who to show (employed, former, or none), optionally by sector, then search a job title.'
                : 'Use Show to choose who appears; Search narrows within that group.'}
            </p>
          ) : null}
          <FilterBar
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'ACTIVE', label: 'Active', count: counts.ACTIVE },
              {
                value: 'pathway',
                label: 'In process',
                count: counts.pathway,
              },
              { value: 'VISITOR', label: 'Visitors', count: counts.VISITOR },
              { value: 'INACTIVE', label: 'Inactive', count: counts.INACTIVE },
            ]}
            onClearAll={() => {
              setStatusFilter('all');
              setSearchScope('all');
              setSearchFacet('any');
              setSearchCategory('');
              setQ('');
            }}
          />
        </div>
      </div>

      {people.length === 0 ? (
        <div className="list-surface" style={{ padding: '1rem' }}>
          <EmptyState
            variant={
              q ||
              statusFilter !== 'all' ||
              searchScope !== 'all' ||
              searchCategory
                ? 'no-results'
                : 'first-use'
            }
            title={
              q ||
              statusFilter !== 'all' ||
              searchScope !== 'all' ||
              searchCategory
                ? 'No people match'
                : 'Directory is empty'
            }
            detail={
              q ||
              statusFilter !== 'all' ||
              searchScope !== 'all' ||
              searchCategory
                ? 'Try another term, change Show / Sector, or clear search.'
                : 'Add the first person so ministries know who they serve.'
            }
            action={
              q ||
              statusFilter !== 'all' ||
              searchScope !== 'all' ||
              searchCategory ? (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setQ('');
                    setSearchScope('all');
                    setSearchFacet('any');
                    setSearchCategory('');
                    setStatusFilter('all');
                  }}
                >
                  Clear search
                </button>
              ) : canManagePeople ? (
                <Link to="/people/new" className="btn">
                  Add person
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <PeopleTables people={people} fullPageQuery={fullPageQuery} />
      )}
    </div>
  );
}
