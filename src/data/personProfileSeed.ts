import type {
  PersonBaptismRecord,
  PersonDocumentMeta,
  PersonEducationRecord,
  PersonEmploymentRecord,
  PersonFamilyLink,
  PersonMarriageRecord,
  PersonSpiritualGift,
  PersonTalentSkill,
  PersonTimelineEvent,
} from '../domain/types';

/** Pastoral 360 data — visible only under FULL profile scope. */
export let PERSON_FAMILY_LINKS: PersonFamilyLink[] = [];

export let PERSON_BAPTISMS: PersonBaptismRecord[] = [];

export let PERSON_MARRIAGES: PersonMarriageRecord[] = [];

export let PERSON_TIMELINE: PersonTimelineEvent[] = [];

export let PERSON_DOCUMENTS: PersonDocumentMeta[] = [];

export let PERSON_EMPLOYMENT: PersonEmploymentRecord[] = [];

export let PERSON_EDUCATION: PersonEducationRecord[] = [];

export let PERSON_TALENTS: PersonTalentSkill[] = [];

export let PERSON_SPIRITUAL_GIFTS: PersonSpiritualGift[] = [];

export function upsertBaptism(record: PersonBaptismRecord) {
  const i = PERSON_BAPTISMS.findIndex((b) => b.personId === record.personId);
  if (i >= 0) PERSON_BAPTISMS[i] = record;
  else PERSON_BAPTISMS = [...PERSON_BAPTISMS, record];
}

export function upsertMarriage(record: PersonMarriageRecord) {
  const i = PERSON_MARRIAGES.findIndex((m) => m.personId === record.personId);
  if (i >= 0) PERSON_MARRIAGES[i] = record;
  else PERSON_MARRIAGES = [...PERSON_MARRIAGES, record];
}

export function pushFamilyLink(link: PersonFamilyLink) {
  PERSON_FAMILY_LINKS = [link, ...PERSON_FAMILY_LINKS];
}

export function removeFamilyLink(id: string) {
  PERSON_FAMILY_LINKS = PERSON_FAMILY_LINKS.filter((l) => l.id !== id);
}

export function pushTimelineEvent(event: PersonTimelineEvent) {
  PERSON_TIMELINE = [event, ...PERSON_TIMELINE];
}

export function updateTimelineEvent(
  id: string,
  patch: Partial<Omit<PersonTimelineEvent, 'id' | 'personId'>>,
): PersonTimelineEvent | null {
  const i = PERSON_TIMELINE.findIndex((e) => e.id === id);
  if (i < 0) return null;
  PERSON_TIMELINE[i] = { ...PERSON_TIMELINE[i], ...patch };
  return PERSON_TIMELINE[i];
}

export function removeTimelineEvent(id: string) {
  PERSON_TIMELINE = PERSON_TIMELINE.filter((e) => e.id !== id);
}

export function pushDocument(doc: PersonDocumentMeta) {
  PERSON_DOCUMENTS = [doc, ...PERSON_DOCUMENTS];
}

export function updateDocument(
  id: string,
  patch: Partial<Omit<PersonDocumentMeta, 'id' | 'personId'>>,
): PersonDocumentMeta | null {
  const i = PERSON_DOCUMENTS.findIndex((d) => d.id === id);
  if (i < 0) return null;
  PERSON_DOCUMENTS[i] = { ...PERSON_DOCUMENTS[i], ...patch };
  return PERSON_DOCUMENTS[i];
}

/** Baptism at this church — used to grant church membership. */
export function isAdeprKacyiruBaptismPlace(place?: string): boolean {
  if (!place?.trim()) return false;
  const n = place.toLowerCase().replace(/\s+/g, ' ');
  return n.includes('adepr') && n.includes('kacyiru');
}

export function pushEmployment(record: PersonEmploymentRecord) {
  PERSON_EMPLOYMENT = [record, ...PERSON_EMPLOYMENT];
}

export function updateEmployment(
  id: string,
  patch: Partial<Omit<PersonEmploymentRecord, 'id' | 'personId'>>,
): PersonEmploymentRecord | null {
  const i = PERSON_EMPLOYMENT.findIndex((r) => r.id === id);
  if (i < 0) return null;
  PERSON_EMPLOYMENT[i] = { ...PERSON_EMPLOYMENT[i], ...patch };
  return PERSON_EMPLOYMENT[i];
}

export function removeEmployment(id: string) {
  PERSON_EMPLOYMENT = PERSON_EMPLOYMENT.filter((r) => r.id !== id);
}

export function pushEducation(record: PersonEducationRecord) {
  PERSON_EDUCATION = [record, ...PERSON_EDUCATION];
}

export function updateEducation(
  id: string,
  patch: Partial<Omit<PersonEducationRecord, 'id' | 'personId'>>,
): PersonEducationRecord | null {
  const i = PERSON_EDUCATION.findIndex((r) => r.id === id);
  if (i < 0) return null;
  PERSON_EDUCATION[i] = { ...PERSON_EDUCATION[i], ...patch };
  return PERSON_EDUCATION[i];
}

export function removeEducation(id: string) {
  PERSON_EDUCATION = PERSON_EDUCATION.filter((r) => r.id !== id);
}

export function pushTalentSkill(record: PersonTalentSkill) {
  PERSON_TALENTS = [record, ...PERSON_TALENTS];
}

export function updateTalentSkill(
  id: string,
  patch: Partial<Omit<PersonTalentSkill, 'id' | 'personId'>>,
): PersonTalentSkill | null {
  const i = PERSON_TALENTS.findIndex((r) => r.id === id);
  if (i < 0) return null;
  PERSON_TALENTS[i] = { ...PERSON_TALENTS[i], ...patch };
  return PERSON_TALENTS[i];
}

export function removeTalentSkill(id: string) {
  PERSON_TALENTS = PERSON_TALENTS.filter((r) => r.id !== id);
}

export function pushSpiritualGift(record: PersonSpiritualGift) {
  PERSON_SPIRITUAL_GIFTS = [record, ...PERSON_SPIRITUAL_GIFTS];
}

export function updateSpiritualGift(
  id: string,
  patch: Partial<Omit<PersonSpiritualGift, 'id' | 'personId'>>,
): PersonSpiritualGift | null {
  const i = PERSON_SPIRITUAL_GIFTS.findIndex((r) => r.id === id);
  if (i < 0) return null;
  PERSON_SPIRITUAL_GIFTS[i] = { ...PERSON_SPIRITUAL_GIFTS[i], ...patch };
  return PERSON_SPIRITUAL_GIFTS[i];
}

export function removeSpiritualGift(id: string) {
  PERSON_SPIRITUAL_GIFTS = PERSON_SPIRITUAL_GIFTS.filter((r) => r.id !== id);
}

/** Restore pastoral 360 collections from local persistence (browser refresh). */
export function replaceProfileCollections(input: {
  familyLinks?: PersonFamilyLink[];
  baptisms?: PersonBaptismRecord[];
  marriages?: PersonMarriageRecord[];
  timeline?: PersonTimelineEvent[];
  documents?: PersonDocumentMeta[];
  employment?: PersonEmploymentRecord[];
  education?: PersonEducationRecord[];
  talents?: PersonTalentSkill[];
  spiritualGifts?: PersonSpiritualGift[];
}) {
  if (input.familyLinks) PERSON_FAMILY_LINKS = [...input.familyLinks];
  if (input.baptisms) PERSON_BAPTISMS = [...input.baptisms];
  if (input.marriages) PERSON_MARRIAGES = [...input.marriages];
  if (input.timeline) PERSON_TIMELINE = [...input.timeline];
  if (input.documents) PERSON_DOCUMENTS = [...input.documents];
  if (input.employment) PERSON_EMPLOYMENT = [...input.employment];
  if (input.education) PERSON_EDUCATION = [...input.education];
  if (input.talents) PERSON_TALENTS = [...input.talents];
  if (input.spiritualGifts) PERSON_SPIRITUAL_GIFTS = [...input.spiritualGifts];
}
