import type {
  CalendarConflictCase,
  DisciplineCase,
  PersonPathway,
  PulpitSlot,
  TransferLetterOut,
} from '../domain/types';

/** Pastoral ops — start empty; create through Pastoral desk flows. */
export let PERSON_PATHWAYS: PersonPathway[] = [];
export let DISCIPLINE_CASES: DisciplineCase[] = [];
export let TRANSFER_LETTERS_OUT: TransferLetterOut[] = [];
export let PULPIT_SLOTS: PulpitSlot[] = [];
export let CALENDAR_CONFLICTS: CalendarConflictCase[] = [];

export function pushPathway(p: PersonPathway) {
  PERSON_PATHWAYS = [p, ...PERSON_PATHWAYS];
}

export function updatePathway(id: string, patch: Partial<PersonPathway>) {
  PERSON_PATHWAYS = PERSON_PATHWAYS.map((p) =>
    p.id === id ? { ...p, ...patch } : p,
  );
}

export function pushDiscipline(c: DisciplineCase) {
  DISCIPLINE_CASES = [c, ...DISCIPLINE_CASES];
}

export function updateDiscipline(id: string, patch: Partial<DisciplineCase>) {
  DISCIPLINE_CASES = DISCIPLINE_CASES.map((c) =>
    c.id === id ? { ...c, ...patch } : c,
  );
}

export function pushTransferLetter(l: TransferLetterOut) {
  TRANSFER_LETTERS_OUT = [l, ...TRANSFER_LETTERS_OUT];
}

export function updateTransferLetter(
  id: string,
  patch: Partial<TransferLetterOut>,
) {
  TRANSFER_LETTERS_OUT = TRANSFER_LETTERS_OUT.map((l) =>
    l.id === id ? { ...l, ...patch } : l,
  );
}

export function pushPulpit(s: PulpitSlot) {
  PULPIT_SLOTS = [s, ...PULPIT_SLOTS];
}

export function updatePulpit(id: string, patch: Partial<PulpitSlot>) {
  PULPIT_SLOTS = PULPIT_SLOTS.map((s) =>
    s.id === id ? { ...s, ...patch } : s,
  );
}

export function pushCalendarConflict(c: CalendarConflictCase) {
  CALENDAR_CONFLICTS = [c, ...CALENDAR_CONFLICTS];
}

export function updateCalendarConflict(
  id: string,
  patch: Partial<CalendarConflictCase>,
) {
  CALENDAR_CONFLICTS = CALENDAR_CONFLICTS.map((c) =>
    c.id === id ? { ...c, ...patch } : c,
  );
}
