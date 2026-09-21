import type {
  MinistryAsset,
  MinistryBudget,
  MinistryBudgetLine,
  MinistryCampaignGift,
  MinistryContribution,
  MinistryContributionDrive,
  MinistryContributionGoal,
  MinistryContributionType,
  MinistryDonation,
  MinistryExpenseRecord,
  MinistryFollowUp,
  MinistryFundraisingCampaign,
  MinistryIncomeRecord,
  MinistryLiability,
  MinistryPaymentMethodConfig,
  MinistrySponsor,
  MinistrySponsorship,
  SystemId,
} from '../domain/types';

/** Systems that use the shared ministry finance kit UI (not Choir/Worship/Deacon/Protocol). */
export const FINANCE_KIT_SYSTEM_IDS: SystemId[] = [
  'sys-youth',
  'sys-music',
  'sys-media',
  'sys-men',
  'sys-women',
  'sys-couples',
  'sys-children',
  'sys-elderly',
  'sys-evangelism',
  'sys-intercessors',
];

export const FUND_ID_BY_SYSTEM: Partial<Record<SystemId, string>> = {
  'sys-youth': 'fund-youth',
  'sys-music': 'fund-music',
  'sys-media': 'fund-media',
  'sys-men': 'fund-men',
  'sys-women': 'fund-women',
  'sys-couples': 'fund-couples',
  'sys-children': 'fund-children',
  'sys-elderly': 'fund-elderly',
  'sys-evangelism': 'fund-evangelism',
  'sys-intercessors': 'fund-intercessors',
};

function seedTypes(systemId: SystemId): MinistryContributionType[] {
  const prefix = systemId.replace('sys-', '');
  return [
    {
      id: `${prefix}-type-tithe`,
      name: 'Ministry offering',
      category: 'Giving',
      frequency: 'MONTHLY',
      defaultAmount: 5000,
      active: true,
      memberVisible: true,
    },
    {
      id: `${prefix}-type-event`,
      name: 'Event support',
      category: 'Events',
      frequency: 'EVENT',
      defaultAmount: 2000,
      active: true,
      memberVisible: true,
    },
  ];
}

function seedMethods(systemId: SystemId): MinistryPaymentMethodConfig[] {
  const prefix = systemId.replace('sys-', '');
  return [
    {
      id: `${prefix}-pm-cash`,
      method: 'CASH',
      label: 'Cash to treasurer',
      active: true,
      memberVisible: true,
    },
    {
      id: `${prefix}-pm-momo`,
      method: 'MOMO',
      label: 'MTN MoMo',
      active: true,
      memberVisible: true,
    },
    {
      id: `${prefix}-pm-bank`,
      method: 'BANK',
      label: 'Bank transfer',
      active: true,
      memberVisible: true,
    },
  ];
}

export let MF_TYPES: Array<MinistryContributionType & { systemId: SystemId }> =
  FINANCE_KIT_SYSTEM_IDS.flatMap((systemId) =>
    seedTypes(systemId).map((t) => ({ ...t, systemId })),
  );

export let MF_METHODS: Array<
  MinistryPaymentMethodConfig & { systemId: SystemId }
> = FINANCE_KIT_SYSTEM_IDS.flatMap((systemId) =>
  seedMethods(systemId).map((m) => ({ ...m, systemId })),
);

export let MF_DRIVES: MinistryContributionDrive[] = [];

export let MF_GOALS: MinistryContributionGoal[] = [];

export let MF_CONTRIBUTIONS: Array<
  MinistryContribution & { systemId: SystemId }
> = [];

export let MF_FOLLOWUPS: Array<MinistryFollowUp & { systemId: SystemId }> = [];

export let MF_DONATIONS: Array<MinistryDonation & { systemId: SystemId }> = [];

export let MF_SPONSORS: Array<MinistrySponsor & { systemId: SystemId }> = [];

export let MF_SPONSORSHIPS: Array<
  MinistrySponsorship & { systemId: SystemId }
> = [];

export let MF_CAMPAIGNS: Array<
  MinistryFundraisingCampaign & { systemId: SystemId }
> = [];

export let MF_CAMPAIGN_GIFTS: Array<
  MinistryCampaignGift & { systemId: SystemId }
> = [];

export let MF_BUDGETS: Array<MinistryBudget & { systemId: SystemId }> = [];

export let MF_BUDGET_LINES: Array<
  MinistryBudgetLine & { systemId: SystemId }
> = [];

export let MF_INCOME: Array<MinistryIncomeRecord & { systemId: SystemId }> = [];
export let MF_EXPENSES: Array<
  MinistryExpenseRecord & { systemId: SystemId }
> = [];
export let MF_ASSETS: Array<MinistryAsset & { systemId: SystemId }> = [];
export let MF_LIABILITIES: Array<
  MinistryLiability & { systemId: SystemId }
> = [];
