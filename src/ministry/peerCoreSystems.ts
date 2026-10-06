import type { SystemId } from '../domain/types';

/** Core peer systems activated at Youth-level (Home + Mission kit). */
export type PeerCoreConfig = {
  systemId: SystemId;
  /** URL segment under /systems/:slug */
  slug: string;
  title: string;
  blurb: string;
  missionTitle: string;
};

export const PEER_CORE_SYSTEMS: PeerCoreConfig[] = [
  {
    systemId: 'sys-media',
    slug: 'media',
    title: 'Media System',
    blurb:
      'Sound, livestream, and service media plans. Peer team under church operations.',
    missionTitle: 'Media mission board',
  },
  {
    systemId: 'sys-men',
    slug: 'men',
    title: 'Men System',
    blurb: 'Men fellowship, discipleship programs, and events.',
    missionTitle: 'Men mission board',
  },
  {
    systemId: 'sys-women',
    slug: 'women',
    title: 'Women System',
    blurb: 'Women fellowship, discipleship programs, and events.',
    missionTitle: 'Women mission board',
  },
  {
    systemId: 'sys-couples',
    slug: 'couples',
    title: 'Couples System',
    blurb: 'Couples fellowship and marriage-support programs.',
    missionTitle: 'Couples mission board',
  },
  {
    systemId: 'sys-children',
    slug: 'children',
    title: 'Children System',
    blurb:
      'Children discipleship including Sunday School. Distinct from Youth.',
    missionTitle: 'Children mission board',
  },
  {
    systemId: 'sys-elderly',
    slug: 'elderly',
    title: 'Elderly System',
    blurb: 'Elderly care, fellowship, and visitation programs.',
    missionTitle: 'Elderly mission board',
  },
  {
    systemId: 'sys-evangelism',
    slug: 'evangelism',
    title: 'Evangelism System',
    blurb: 'Outreach campaigns, crusades, and evangelism projects.',
    missionTitle: 'Evangelism mission board',
  },
  {
    systemId: 'sys-intercessors',
    slug: 'intercessors',
    title: 'Intercessors System',
    blurb: 'Prayer roster, intercession watches, and prayer campaigns.',
    missionTitle: 'Intercessors mission board',
  },
];

export function peerCoreNav(slug: string) {
  const base = `/systems/${slug}`;
  return [
    { to: base, label: 'Home', end: true as const },
    { to: `${base}/mission`, label: 'Mission' },
    { to: `${base}/programs`, label: 'Programs' },
    { to: `${base}/events`, label: 'Events' },
    { to: `${base}/tasks`, label: 'Tasks' },
    { to: `${base}/projects`, label: 'Projects' },
    { to: `${base}/calendar`, label: 'Calendar' },
  ];
}

export function getPeerCore(systemId: SystemId): PeerCoreConfig | undefined {
  return PEER_CORE_SYSTEMS.find((s) => s.systemId === systemId);
}
