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

async function activeVersion(systemId: string): Promise<ConfigVersionView | null> {
  const v = await prisma.configVersion.findFirst({
    where: { systemId, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  return v ? toConfigVersionView(v) : null;
}

/** Load everything the Music engine needs. */
export async function loadMusicConfig(): Promise<LoadedMusicConfig> {
  const [version, services, categories, policies, links] = await Promise.all([
    activeVersion(SYSTEM_MUSIC),
    prisma.schedulingService.findMany({ where: { systemId: SYSTEM_MUSIC, active: true } }),
    prisma.choirCategory.findMany({ where: { systemId: SYSTEM_MUSIC, active: true } }),
    prisma.categoryServicePolicy.findMany({ where: { systemId: SYSTEM_MUSIC, active: true } }),
    prisma.choirCategoryLink.findMany({ where: { systemId: SYSTEM_MUSIC, active: true } }),
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
export async function loadProtocolConfig(): Promise<LoadedProtocolConfig> {
  const [version, services, rules, dutyPolicy] = await Promise.all([
    activeVersion(SYSTEM_PROTOCOL),
    prisma.schedulingService.findMany({ where: { systemId: SYSTEM_PROTOCOL, active: true } }),
    prisma.protocolServiceRule.findMany({ where: { systemId: SYSTEM_PROTOCOL, active: true } }),
    prisma.protocolDutyPolicy.findFirst({ where: { systemId: SYSTEM_PROTOCOL } }),
  ]);
  return {
    version,
    services: services.map(toServiceView),
    rules: rules.map(toRuleView),
    dutyPolicy: dutyPolicy ? toDutyPolicyView(dutyPolicy) : null,
  };
}