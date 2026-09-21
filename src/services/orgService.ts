import { ORG_UNITS, SYSTEMS } from '../data/seed';
import { scheduleLocalDomainPersist } from '../data/localDomainStore';
import type { ChurchSystem, OrgUnit, SystemId } from '../domain/types';

export const systemsService = {
  list(): ChurchSystem[] {
    return [...SYSTEMS];
  },

  listActive(): ChurchSystem[] {
    return SYSTEMS.filter((s) => s.status === 'ACTIVE');
  },

  getById(id: SystemId): ChurchSystem | null {
    return SYSTEMS.find((s) => s.id === id) ?? null;
  },

  getByCode(code: ChurchSystem['code']): ChurchSystem | null {
    return SYSTEMS.find((s) => s.code === code) ?? null;
  },

  getByOrgUnitId(orgUnitId: string): ChurchSystem | null {
    return SYSTEMS.find((s) => s.orgUnitId === orgUnitId) ?? null;
  },
};

export const orgService = {
  list(): OrgUnit[] {
    return [...ORG_UNITS];
  },

  getById(id: string): OrgUnit | null {
    return ORG_UNITS.find((u) => u.id === id) ?? null;
  },

  listByType(type: OrgUnit['type']): OrgUnit[] {
    return ORG_UNITS.filter((u) => u.type === type);
  },

  /** Ministries / teams that map to a peer System. */
  listWithSystems(): Array<OrgUnit & { system: ChurchSystem }> {
    return ORG_UNITS.flatMap((unit) => {
      if (!unit.systemId) return [];
      const system = systemsService.getById(unit.systemId);
      if (!system) return [];
      return [{ ...unit, system }];
    });
  },

  create(input: {
    name: string;
    type: OrgUnit['type'];
    parentId?: string;
    description?: string;
    systemId?: SystemId;
    leaderPersonId?: string;
  }): OrgUnit {
    const unit: OrgUnit = {
      id: `ou-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      type: input.type,
      parentId: input.parentId || undefined,
      description: input.description,
      systemId: input.systemId,
      leaderPersonId: input.leaderPersonId,
    };
    ORG_UNITS.push(unit);
    scheduleLocalDomainPersist();
    return unit;
  },

  update(id: string, patch: Partial<Omit<OrgUnit, 'id'>>): OrgUnit | null {
    const i = ORG_UNITS.findIndex((u) => u.id === id);
    if (i < 0) return null;
    ORG_UNITS[i] = { ...ORG_UNITS[i], ...patch, id };
    scheduleLocalDomainPersist();
    return ORG_UNITS[i];
  },
};
