import type { IconName } from '../components/ui/Icon';
import type { ModuleId } from './menu';

export const MODULE_ICON: Record<ModuleId, IconName> = {
  home: 'home',
  notifications: 'inbox',
  announcements: 'pulse',
  units: 'building',
  people: 'users',
  serve: 'calendar',
  money: 'wallet',
  reports: 'chart',
  admin: 'board',
};
