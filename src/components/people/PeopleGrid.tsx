import { useMemo } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { Person } from '../../domain/types';
import {
  NONE,
  PEOPLE_TABLE_META,
  buildPeopleTableRows,
  churchColumns,
  otherColumns,
  personalColumns,
  type ChurchInfoRow,
  type OtherInfoRow,
  type PeopleTableKey,
  type PersonalInfoRow,
} from '../../services/peopleTables';
import { DataGrid, type BulkAction } from '../ui/DataGrid';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function copyAction<T>(
  id: string,
  label: string,
  noun: string,
  pick: (row: T) => string | null | undefined,
): BulkAction<T> {
  return {
    id,
    label,
    run: async (rows) => {
      const values = [
        ...new Set(
          rows
            .map(pick)
            .filter((v): v is string => !!v && v !== NONE),
        ),
      ];
      if (values.length === 0) return `No ${noun} on file for the selection`;
      const ok = await copyText(values.join(id === 'names' ? '\n' : ', '));
      return ok
        ? `Copied ${values.length} ${noun}`
        : 'Could not copy — your browser blocked clipboard access';
    },
  };
}

const profileHref = (r: { personId: string }) => `/people/${r.personId}`;
const keyOf = (r: { personId: string }) => r.personId;

/**
 * One People table (Personal / Church / Other info) as a DataGrid.
 * Sensitive columns are masked for viewers without the pastoral record.
 */
export function PeopleGrid({
  table,
  people,
  fullPageHref,
  defaultPageSize = 5,
  pageSizeOptions,
  fill,
}: {
  table: PeopleTableKey;
  people: Person[];
  fullPageHref?: string;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  fill?: boolean;
}) {
  const { canViewFullRecord } = useAuth();
  const meta = PEOPLE_TABLE_META[table];

  const rows = useMemo(
    () => people.map((p) => buildPeopleTableRows(p, canViewFullRecord)),
    [people, canViewFullRecord],
  );

  const common = {
    title: meta.title,
    hint: meta.hint,
    exportName: meta.exportName,
    rowHref: profileHref,
    rowKey: keyOf,
    fullPageHref,
    defaultPageSize,
    pageSizeOptions,
    fill,
  };

  if (table === 'personal') {
    return (
      <DataGrid<PersonalInfoRow>
        {...common}
        rows={rows.map((r) => r.personal)}
        columns={personalColumns}
        bulkActions={[
          copyAction<PersonalInfoRow>('emails', 'Copy emails', 'emails', (r) => r.email),
          copyAction<PersonalInfoRow>('phones', 'Copy phone numbers', 'phone numbers', (r) => r.phone),
          copyAction<PersonalInfoRow>('names', 'Copy names', 'names', (r) => r.fullName),
        ]}
      />
    );
  }
  if (table === 'church') {
    return (
      <DataGrid<ChurchInfoRow>
        {...common}
        rows={rows.map((r) => r.church)}
        columns={churchColumns}
        bulkActions={[
          copyAction<ChurchInfoRow>('names', 'Copy names', 'names', (r) => r.fullName),
        ]}
      />
    );
  }
  return (
    <DataGrid<OtherInfoRow>
      {...common}
      rows={rows.map((r) => r.other)}
      columns={otherColumns}
      bulkActions={[
        copyAction<OtherInfoRow>('names', 'Copy names', 'names', (r) => r.fullName),
      ]}
    />
  );
}
