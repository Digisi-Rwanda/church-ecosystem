/**
 * Load the active scheduling configuration for a system from the database.
 * The engines call this to get their rules instead of hard-coding them.
 * If no configuration exists yet, the seed's initial config is returned.
 */
import { prisma } from '../lib/prisma.js';
import {
  toConfigVersionView,
  toServiceView,
  toCategoryView,
  toPolicyView,
  toLinkView,
  toRuleView,
  toDutyPolicyView,
} from './store.js';
import type {
  CategoryServicePolicyView,
  ChoirCategoryLinkView,
  ChoirCategoryView,
  ConfigVersionView,
  ProtocolDutyPolicyView,
  ProtocolServiceRuleView,
  SchedulingServiceView,
} from './types.js';

export const SYSTEM_MUSIC = 'sys-music';
export const SYSTEM_PROTOCOL = 'sys-protocol';

export type LoadedMusicConfig = {
  version: ConfigVersionView | null;
  services: SchedulingServiceView[];
  categories: ChoirCategoryView[];
  policies: CategoryServicePolicyView[];
  /** choirId -> categoryIds the choir belongs to */
  choirLinks: Map<string, string[]>;
};

export type LoadedProtocolConfig = {
  version: ConfigVersionView | null;
  services: SchedulingServiceView[];
  rules: ProtocolServiceRuleView[];
  dutyPolicy: ProtocolDutyPolicyView | null;
};

async function activeVersion(systemId: string, versionId?: string): Promise<ConfigVersionView | null> {
  const v = versionId
    ? await prisma.configVersion.findFirst({ where: { id: versionId, systemId } })
    : await prisma.configVersion.findFirst({
      where: { systemId, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
  return v ? toConfigVersionView(v) : null;
}

/** Load everything the Music engine needs. */
export async function loadMusicConfig(versionId?: string): Promise<LoadedMusicConfig> {
  const version = await activeVersion(SYSTEM_MUSIC, versionId);
  if (versionId && !version) throw new Error(`Music configuration version ${versionId} was not found`);
  if (!version) return { version: null, services: [], categories: [], policies: [], choirLinks: new Map() };
  const versionFilter = { systemId: SYSTEM_MUSIC, configVersionId: version.id, active: true };
  const [services, categories, policies, links] = await Promise.all([
    prisma.schedulingService.findMany({ where: versionFilter }),
    prisma.choirCategory.findMany({ where: versionFilter }),
    prisma.categoryServicePolicy.findMany({ where: versionFilter }),
    prisma.choirCategoryLink.findMany({ where: versionFilter }),
  ]);
  const choirLinks = new Map<string, string[]>();
  for (const l of links) {
    const arr = choirLinks.get(l.choirId) ?? [];
    arr.push(l.categoryId);
    choirLinks.set(l.choirId, arr);
  }
  return {
    version,
    services: services.map(toServiceView),
    categories: categories.map(toCategoryView),
    policies: policies.map(toPolicyView),
    choirLinks,
  };
}

/** Load everything the Protocol engine needs. */
export async function loadProtocolConfig(versionId?: string, calendarVersionId?: string): Promise<LoadedProtocolConfig> {
  const [version, calendarVersion] = await Promise.all([
    activeVersion(SYSTEM_PROTOCOL, versionId),
    activeVersion(SYSTEM_MUSIC, calendarVersionId),
  ]);
  if (versionId && !version) throw new Error(`Protocol configuration version ${versionId} was not found`);
  if (calendarVersionId && !calendarVersion) throw new Error(`Shared calendar version ${calendarVersionId} was not found`);
  if (!version) return { version: null, services: [], rules: [], dutyPolicy: null };
  const [services, allServices, ruleRows, dutyPolicy] = await Promise.all([
    calendarVersion
      ? prisma.schedulingService.findMany({ where: { systemId: SYSTEM_MUSIC, configVersionId: calendarVersion.id, active: true } })
      : prisma.schedulingService.findMany({ where: { systemId: SYSTEM_MUSIC, active: true } }),
    prisma.schedulingService.findMany({ where: { systemId: SYSTEM_MUSIC } }),
    prisma.protocolServiceRule.findMany({ where: { systemId: SYSTEM_PROTOCOL, configVersionId: version.id, active: true } }),
    prisma.protocolDutyPolicy.findFirst({ where: { systemId: SYSTEM_PROTOCOL, configVersionId: version.id } }),
  ]);
  const codeById = new Map(allServices.map((s) => [s.id, s.code]));
  const currentIdByCode = new Map(services.map((s) => [s.code, s.id]));
  const rules = ruleRows.map((r) => {
    const code = codeById.get(r.serviceId);
    return toRuleView({ ...r, serviceId: (code && currentIdByCode.get(code)) || r.serviceId });
  });
  return {
    version,
    services: services.map(toServiceView),
    rules,
    dutyPolicy: dutyPolicy ? toDutyPolicyView(dutyPolicy) : null,
  };
}