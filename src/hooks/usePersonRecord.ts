import { useMemo } from 'react';
import { allowedOwnProfileSections } from '../domain/access';
import { useAuth } from '../auth/AuthContext';
import type { Person } from '../domain/types';
import {
  summarizePersonRecord,
  type PersonRecordRow,
} from '../services/personRecordSummary';

/**
 * Record rows for one person plus the viewer's access flags. Same rules as
 * the full profile page, so every People-page view agrees with it.
 */
export function usePersonRecord(person: Person): {
  rows: PersonRecordRow[];
  seeFullFields: boolean;
} {
  const { account, canViewFullRecord, allowedSections } = useAuth();
  const isSelf = account?.personId === person.id;
  const seeFullFields = canViewFullRecord || isSelf;

  const rows = useMemo(
    () =>
      summarizePersonRecord(person.id, {
        seeFullFields,
        canViewFullRecord,
        allowedSections:
          isSelf && !canViewFullRecord
            ? allowedOwnProfileSections()
            : allowedSections,
      }),
    [person.id, seeFullFields, canViewFullRecord, isSelf, allowedSections],
  );

  return { rows, seeFullFields };
}
