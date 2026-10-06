/**
 * People-served counts for programmes. Church-wide reports are assembled from
 * each module (the Reports block); money reports belong to Money.
 */
import { missionService } from './missionService';

function participantsForProgram(programId: string): number {
  return missionService
    .listEnrollments(programId)
    .filter((e) => e.status === 'ACTIVE' || e.status === 'COMPLETED').length;
}

export const reportsService = {
  participantsServed(programId: string): number {
    return participantsForProgram(programId);
  },
};
