/**
 * Thin adapter used by peopleService / participationService.
 * System-wide persistence lives in localDomainStore + registerLocalDomain.
 */
import {
  markLocalOverride,
  scheduleLocalDomainPersist,
} from './localDomainStore';

export function hydratePeopleLocalStore() {
  // Handled by bootLocalDomainPersistence() in main.tsx.
}

export function markSeedPersonOverride(personId: string) {
  markLocalOverride('people', personId);
}

export function persistPeopleLocalStore() {
  scheduleLocalDomainPersist();
}
