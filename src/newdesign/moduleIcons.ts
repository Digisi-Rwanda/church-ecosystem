import type { IconName } from '../components/ui/Icon';
import type { ModuleId } from './menu';

export const MODULE_ICON: Record<ModuleId, IconName> = {
  home: 'home',
  notifications: 'inbox',
  announcements: 'pulse',
  units: 'building',
  people: 'users',
  work: 'task',
  schedule: 'calendar',
  ministry: 'layers',
  money: 'wallet',
  reports: 'chart',
  governance: 'board',
  settings: 'settings',
};
