import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { roleLabel } from '../domain/access';
import { useAuth } from '../auth/AuthContext';
import { FilterBar, PageHead } from '../components/ui/FilterBar';
import { SelectField, TextField } from '../components/ui/Field';
import { Icon } from '../components/ui/Icon';
import { MasterDetail } from '../components/ui/MasterDetail';
import {
  EmptyState,
  ForbiddenState,
  StatusPill,
} from '../components/ui/StatusPill';
import { useListSelection } from '../hooks/useListSelection';
import type { Person } from '../domain/types';
import type { PeopleSearchFacet, PeopleSearchScope } from '../services';
import {
  buildPersonParticipationPlaces,
  participationService,
  peopleService,
} from '../services';
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

  const { selectedId, selected, setSelectedId } = useListSelection(people);

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

  const memberships = selected
    ? participationService.activeMemberships(selected.id)
    : [];
  const positions = selected
    ? participationService.activePositions(selected.id)
    : [];
  const assignments = selected
    ? participationService.activeAssignments(selected.id)
    : [];
  const roles = selected ? participationService.rolesFor(selected.id) : [];
  const places = selected
    ? buildPersonParticipationPlaces({
        memberships,
        positions,
        assignments,
      })
    : [];

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
        <div className="list-surface">
          <MasterDetail
            listWidth="minmax(18rem, 1.1fr)"
            list={
              <ul
                className="people-master-list"
                role="listbox"
                aria-label="People"
              >
                {people.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={p}
                    selected={selectedId === p.id}
                    onSelect={() => setSelectedId(p.id)}
                    subtitle={
                      searchScope === 'all'
                        ? p.phone || p.email || 'No contact on file'
                        : peopleService.searchMatchSummary(p.id, searchScope)
                    }
                  />
                ))}
              </ul>
            }
            detail={
              selected ? (
                <PersonDetail
                  person={selected}
                  memberships={memberships}
                  positions={positions}
                  roles={roles}
                  places={places}
                  canManagePeople={canManagePeople}
                />
              ) : null
            }
            emptyDetail={
              <EmptyState
                variant="no-results"
                title="Select someone"
                detail="Choose a person from the list to preview their profile."
              />
            }
          />
        </div>
      )}
    </div>
  );
}

function PersonRow({
  person: p,
  selected,
  onSelect,
  subtitle,
}: {
  person: Person;
  selected: boolean;
  onSelect: () => void;
  subtitle: string;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        className={`people-master-item${selected ? ' selected' : ''}`}
        onClick={onSelect}
      >
        <span className="people-avatar" aria-hidden>
          {(p.preferredName || p.fullName).slice(0, 1).toUpperCase()}
        </span>
        <span className="people-master-body">
          <strong>{p.preferredName || p.fullName}</strong>
          <span className="muted">{subtitle}</span>
        </span>
        <StatusPill status={p.status} />
      </button>
    </li>
  );
}

function PersonDetail({
  person: selected,
  memberships,
  positions,
  roles,
  places,
  canManagePeople,
}: {
  person: Person;
  memberships: ReturnType<typeof participationService.activeMemberships>;
  positions: ReturnType<typeof participationService.activePositions>;
  roles: ReturnType<typeof participationService.rolesFor>;
  places: ReturnType<typeof buildPersonParticipationPlaces>;
  canManagePeople: boolean;
}) {
  return (
    <div className="people-detail">
      <p className="hero-kicker" style={{ marginTop: 0 }}>
        Preview
      </p>
      <h3 className="people-detail-name">{selected.fullName}</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        {selected.preferredName &&
        selected.preferredName !== selected.fullName
          ? `${selected.preferredName} · `
          : ''}
        {selected.email ?? selected.phone ?? 'No contact on file'}
      </p>
      <div className="row" style={{ marginBottom: '0.85rem', flexWrap: 'wrap' }}>
        <StatusPill status={selected.status} />
        {roles.map((r) => (
          <span key={r} className="badge">
            {roleLabel(r)}
          </span>
        ))}
      </div>

      <h4 className="people-detail-section">Where they participate</h4>
      {places.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No memberships, positions, or assignments on file
        </p>
      ) : (
        <ul className="rail-list people-place-list">
          {places.map((place) => (
            <li key={place.key}>
              <strong>{place.placeName}</strong>
              {place.roles.length > 0 && (
                <div className="muted">
                  Role · {place.roles.join(' · ')}
                </div>
              )}
              {place.lines.slice(0, 3).map((line) => (
                <div key={line} className="muted" style={{ fontSize: '0.85rem' }}>
                  {line}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      {(memberships.length > 0 || positions.length > 0) && (
        <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.85rem' }}>
          Full membership and position lists are on the profile.
        </p>
      )}

      <div className="row" style={{ marginTop: '1.1rem' }}>
        <Link to={`/people/${selected.id}`} className="btn">
          Open full profile
        </Link>
        {canManagePeople && (
          <Link to={`/people/${selected.id}/edit`} className="btn ghost">
            Edit
          </Link>
        )}
      </div>
    </div>
  );
}
