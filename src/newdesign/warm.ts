import { pageLoaders } from './pages';

/** The page file each first address segment of a system opens. Used only to download it a moment early. */
const BY_SEGMENT: Record<string, string> = {
  '': 'SystemBlockPage',
  people: 'PeopleDirectoryPage',
  work: 'WorkPage',
  programs: 'PlansPage',
  events: 'PlansPage',
  projects: 'PlansPage',
  money: 'MoneyPage',
  schedule: 'SchedulePage',
  reports: 'ReportsPage',
  governance: 'MeetingsPage',
  notifications: 'NotificationsPage',
  announcements: 'AnnouncementsPage',
  settings: 'SettingsPage',
  central: 'CentralHomePage',
  groups: 'GroupsPage',
  choirs: 'ChoirsPage',
  monthplan: 'MonthPlanPage',
  roster: 'ProtocolRosterPage',
  teams: 'ProtocolTeamsPage',
  collections: 'CollectionsPage',
  contacts: 'ContactsPage',
  visits: 'VisitsPage',
  couples: 'CouplesPage',
};

/** Which page file an address opens, or null when it is not one we warm. */
export function pageNameFor(pathname: string): string | null {
  const path = pathname.split('?')[0]!.replace(/\/+$/, '');
  if (path === '/portal') return 'PortalPage';
  const m = /^\/s\/[^/]+(?:\/([^/]+))?/.exec(path);
  if (!m) return null;
  return BY_SEGMENT[m[1] ?? ''] ?? null;
}

const started = new Set<string>();

/** Start downloading the page behind an address. Safe to call again and again; it never throws. */
export function warm(pathname: string): void {
  const name = pageNameFor(pathname);
  if (!name || started.has(name)) return;
  const load = pageLoaders[name];
  if (!load) return;
  started.add(name);
  load().catch(() => started.delete(name));
}

/** The pages most people open first, fetched once the browser is idle after sign-in. */
export function warmCommon(): void {
  const names = ['SystemBlockPage', 'PeopleDirectoryPage', 'WorkPage', 'MoneyPage', 'SchedulePage', 'ReportsPage'];
  const run = () =>
    names.forEach((n) => {
      if (started.has(n)) return;
      started.add(n);
      pageLoaders[n]?.().catch(() => started.delete(n));
    });
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(run);
  else window.setTimeout(run, 1500);
}
