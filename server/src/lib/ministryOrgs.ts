/** Ministry systems and the organisation units seeded for them. */
export const MINISTRY_KIT_ORGS = [
  { systemId: 'sys-youth', orgId: 'ou-youth', orgName: 'Youth Ministry' },
  { systemId: 'sys-music', orgId: 'ou-music', orgName: 'Music Ministry' },
  { systemId: 'sys-media', orgId: 'ou-media', orgName: 'Media Ministry' },
  { systemId: 'sys-men', orgId: 'ou-men', orgName: 'Men Ministry' },
  { systemId: 'sys-women', orgId: 'ou-women', orgName: 'Women Ministry' },
  { systemId: 'sys-couples', orgId: 'ou-couples', orgName: 'Couples Ministry' },
  { systemId: 'sys-children', orgId: 'ou-children', orgName: 'Children Ministry' },
  { systemId: 'sys-elderly', orgId: 'ou-elderly', orgName: 'Elderly Ministry' },
  { systemId: 'sys-evangelism', orgId: 'ou-evangelism', orgName: 'Evangelism Ministry' },
  { systemId: 'sys-intercessors', orgId: 'ou-intercessors', orgName: 'Intercessors Ministry' },
] as const;

/** Dedicated ministry systems seeded with their own organisation unit. */
export const SPECIAL_MINISTRY_ORGS = [
  {
    systemId: 'sys-worship',
    orgId: 'ou-worship',
    orgName: 'Worship Team',
  },
  {
    systemId: 'sys-deacon',
    orgId: 'ou-deacon-team',
    orgName: 'Deacon Team',
  },
  {
    systemId: 'sys-protocol',
    orgId: 'ou-protocol',
    orgName: 'Protocol Team',
  },
] as const;

/** Seven named choirs under one Choir System. */
export const CHOIR_PARENT_ORG = {
  id: 'ou-choir',
  name: 'Choir Ministry',
  systemId: 'sys-choir',
} as const;

export const CHOIR_ORGS = [
  { orgId: 'ou-choir-ijwi', name: "Ijwi ry' umwami Yesu", code: 'CHOIR-IJWI' },
  { orgId: 'ou-choir-elbethel', name: 'El bethel', code: 'CHOIR-ELB' },
  { orgId: 'ou-choir-integuza', name: 'Integuza', code: 'CHOIR-INT' },
  { orgId: 'ou-choir-elim', name: 'Elim', code: 'CHOIR-ELIM' },
  { orgId: 'ou-choir-beulah', name: 'Beulah', code: 'CHOIR-BEU' },
  { orgId: 'ou-choir-yerusalemu', name: 'Yerusalemu', code: 'CHOIR-YER' },
  { orgId: 'ou-choir-hope', name: 'Hope', code: 'CHOIR-HOPE' },
] as const;

export type MinistryKitSystemId = (typeof MINISTRY_KIT_ORGS)[number]['systemId'];
