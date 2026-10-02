import type { Person } from '../../domain/types';
import { PEOPLE_TABLE_KEYS } from '../../services/peopleTables';
import { PeopleGrid } from './PeopleGrid';

/**
 * The three People tables — Personal info, Church info, Other info — each a
 * paged, sortable, filterable grid with row selection and bulk actions, and a
 * link to its full-page version.
 */
export function PeopleTables({
  people,
  fullPageQuery = '',
}: {
  people: Person[];
  /** Search/filter state of the People page, carried into the full page. */
  fullPageQuery?: string;
}) {
  return (
    <div className="people-tables">
      {PEOPLE_TABLE_KEYS.map((key) => (
        <PeopleGrid
          key={key}
          table={key}
          people={people}
          fullPageHref={`/people/tables/${key}${fullPageQuery}`}
        />
      ))}
    </div>
  );
}
