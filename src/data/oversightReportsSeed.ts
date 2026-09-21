import type {
  ChurchAssistanceReport,
  SharedReportPack,
  SystemId,
} from '../domain/types';

/** Seed: packs published to Itorero leaders + church assistance accountability. */
export let SHARED_REPORT_PACKS: SharedReportPack[] = [];

export let CHURCH_ASSISTANCE_REPORTS: ChurchAssistanceReport[] = [];

export function sharedPacksFor(systemId: SystemId): SharedReportPack[] {
  return SHARED_REPORT_PACKS.filter(
    (p) => p.systemId === systemId && p.status === 'PUBLISHED',
  );
}

export function assistanceReportsFor(
  systemId: SystemId,
): ChurchAssistanceReport[] {
  return CHURCH_ASSISTANCE_REPORTS.filter(
    (r) =>
      r.systemId === systemId &&
      (r.status === 'SUBMITTED' || r.status === 'ACCEPTED'),
  );
}

export function hasOversightFinanceArtifacts(systemId: SystemId): boolean {
  return (
    sharedPacksFor(systemId).length > 0 ||
    assistanceReportsFor(systemId).length > 0
  );
}
