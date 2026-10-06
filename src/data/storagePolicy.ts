/**
 * Where each piece of data lives. The rule (docs/TARGET_ARCHITECTURE.md):
 * the SERVER is the only source of truth for church data. The browser may hold
 * a copy for speed, never the original.
 *
 *   SERVER        server is the source of truth today (browser copy is a cache)
 *   SERVER_DOC    shared server document with versions and merge (Music, Protocol)
 *   MOVE_S2..S5   still browser-only; scheduled to move in that slice
 *
 * Every registered collection MUST be listed here (a test enforces it), so no
 * new browser-only data can appear without a decision.
 */
export type DataHome = 'SERVER' | 'SERVER_DOC' | 'MOVE_S2' | 'MOVE_S3' | 'MOVE_S4' | 'MOVE_S5';

/** Collections that move to the server behind a module switch (see lib/serverModules). */
export const MODULE_COLLECTIONS: Record<string, string[]> = {
  people: ['people'],
  participation: ['memberships', 'positions', 'orgUnits'],
};

const S = (home: DataHome, names: string) =>
  Object.fromEntries(names.split(/\s+/).filter(Boolean).map((n) => [n, home])) as Record<string, DataHome>;

export const STORAGE_POLICY: Record<string, DataHome> = {
  // Slice 1 — people identity (server table, switch: VITE_SERVER_MODULES=people)
  ...S('SERVER', 'people'),
  // Server lifecycle today; the browser keeps a cache to verify and then drop
  ...S('SERVER', 'programs programEnrollments activities attendance events eventRegistrations projects tasks missionShares assignments'),
  // Shared documents
  ...S('SERVER_DOC', `musicSchedule protocolRoster protocolServices protocolMonthPlans protocolTeamSlots
    protocolHistory protocolAttendance protocolAbsenceRequests protocolFillInOffers protocolSwapProposals
    protocolServiceReports  protocolNotifications protocolActivity`),
  // Slice 2 — belonging and structure (server tables, switch: VITE_SERVER_MODULES=participation)
  ...S('SERVER', 'memberships positions orgUnits'),
  // Slice 3 — person records
  ...S('MOVE_S3', `personFamilyLinks personBaptisms personMarriages personTimeline personDocuments
    personEmployment personEducation personTalents personSpiritualGifts
    `),
  // Slice 5 — governance and care
  ...S('MOVE_S5', `youthGroups youthMembers youthMeetings`),
};
