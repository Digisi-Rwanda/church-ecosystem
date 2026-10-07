/**
 * Music ministry — choir & worship service scheduling.
 * Units map to choir org units + worship team.
 */

export type MusicServiceKind =
  | 'SS1'
  | 'SS2'
  | 'TUESDAY'
  | 'FRIDAY'
  | 'IGABURO';

export type MusicUnitKind =
  | 'PRIMARY'
  | 'SECONDARY'
  | 'CHILDREN'
  | 'WORSHIP';

export type MusicHorizon = 'MONTH' | 'QUARTER' | 'HALF' | 'YEAR';

export type MusicDraftStatus = 'DRAFT';
export type MusicPublishedStatus = 'PUBLISHED';

export interface MusicScheduleUnit {
  id: string;
  kind: MusicUnitKind;
  name: string;
  /** Choir org unit when applicable. */
  orgUnitId?: string;
  systemId?: 'sys-choir' | 'sys-worship';
  /** false = retired: kept for history, never scheduled. Missing = active. */
  active?: boolean;
}

export interface MusicServiceSlot {
  id: string;
  /** Period key: YYYY-MM for month plans, or period start. */
  periodKey: string;
  date: string;
  kind: MusicServiceKind;
  label: string;
}

export interface MusicAssignment {
  id: string;
  serviceId: string;
  unitId: string;
  source: 'ENGINE' | 'MANUAL';
}

export interface MusicScheduleDraft {
  id: string;
  periodKey: string;
  horizon: MusicHorizon;
  label: string;
  status: MusicDraftStatus;
  createdAt: string;
  createdByPersonId: string;
  services: MusicServiceSlot[];
  assignments: MusicAssignment[];
  warnings: string[];
}

/** Live published choir schedule for a period (editable). */
export interface MusicChoirSchedule {
  id: string;
  periodKey: string;
  horizon: MusicHorizon;
  status: MusicPublishedStatus;
  batchId?: string;
  batchHorizon?: MusicHorizon;
  publishedAt: string;
  publishedByPersonId: string;
  updatedAt: string;
  updatedByPersonId?: string;
  version: number;
  services: MusicServiceSlot[];
  assignments: MusicAssignment[];
  warnings: string[];
}

/**
 * A month the Music team has approved and locked for planning but not yet
 * released to the choirs. Protocol can plan against it; choirs cannot see it.
 */
export interface MusicConfirmedMonth {
  id: string;
  /** Always a single month (YYYY-MM). */
  periodKey: string;
  status: 'CONFIRMED';
  /** The confirmed draft this month came from (its months are released one by one). */
  batchId?: string;
  /** Span that draft covered: month, quarter, half year or year. */
  batchHorizon?: MusicHorizon;
  confirmedAt: string;
  confirmedByPersonId: string;
  updatedAt: string;
  updatedByPersonId?: string;
  version: number;
  services: MusicServiceSlot[];
  assignments: MusicAssignment[];
  warnings: string[];
}

/** Where a month stands on the Music side. */
export type MusicMonthState = 'NONE' | 'CONFIRMED' | 'PUBLISHED';

/** A month's schedule as Protocol sees it (published, or confirmed ahead of release). */
export type MusicMonthView = MusicChoirSchedule & {
  musicState: 'CONFIRMED' | 'PUBLISHED';
};

export type MusicScheduleNotifKind =
  | 'PUBLISHED'
  | 'UPDATED'
  | 'DRAFT_SAVED';

export interface MusicScheduleNotification {
  id: string;
  personId: string;
  kind: MusicScheduleNotifKind;
  periodKey: string;
  scheduleId: string;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
}

export const MUSIC_SERVICE_LABELS: Record<MusicServiceKind, string> = {
  SS1: 'Sunday Service 1',
  SS2: 'Sunday Service 2',
  TUESDAY: 'Tuesday Service',
  FRIDAY: 'Friday Service',
  IGABURO: 'Igaburo (Holy Communion)',
};

/** A confirmed draft being released month by month. */
export interface MusicConfirmedBatch {
  batchId: string;
  horizon: MusicHorizon;
  months: { month: string; state: 'CONFIRMED' | 'PUBLISHED'; version: number }[];
  publishedCount: number;
  total: number;
}

/** What happened to a month's schedule, kept as a permanent trail. */
export type MusicLogAction = 'CONFIRMED' | 'RECONFIRMED' | 'PUBLISHED' | 'EDITED';
export type MusicLogChangeKind =
  | 'ADDED'
  | 'REMOVED'
  | 'SERVICE_ADDED'
  | 'SERVICE_REMOVED'
  | 'RESCHEDULED';

export interface MusicLogChange {
  kind: MusicLogChangeKind;
  serviceId: string;
  /** Written when it happened, so the trail reads the same later. */
  text: string;
}

export interface MusicLogEntry {
  id: string;
  at: string;
  periodKey: string;
  /** Which copy changed: the confirmed month (not yet released) or the published one. */
  stage: 'CONFIRMED' | 'PUBLISHED';
  action: MusicLogAction;
  version: number;
  byPersonId: string;
  changes: MusicLogChange[];
  summary: string;
}
