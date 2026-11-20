import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'search'
  | 'inbox'
  | 'close'
  | 'check'
  | 'plus'
  | 'chevron-right'
  | 'chevron-down'
  | 'alert'
  | 'info'
  | 'empty'
  | 'lock'
  | 'user'
  | 'calendar'
  | 'external'
  | 'folder'
  | 'task'
  | 'progress'
  | 'users'
  | 'event'
  | 'pulse'
  | 'systems'
  | 'chart'
  | 'program'
  | 'moon'
  | 'sun'
  | 'home'
  | 'board'
  | 'pastoral'
  | 'settings'
  | 'building'
  | 'wallet'
  | 'layers'
  | 'hand'
  | 'menu'
  | 'megaphone'
  | 'clock'
  | 'document'
  | 'org'
  | 'exclaim';

const PATHS: Record<IconName, ReactNode> = {
  megaphone: (
    <>
      <path d="M4 10v4a1 1 0 0 0 1 1h2.5l6 4V5l-6 4H5a1 1 0 0 0-1 1Z" />
      <path d="M17 9.5a4 4 0 0 1 0 5M19.5 7a7.5 7.5 0 0 1 0 10" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  document: (
    <>
      <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5Z" />
      <path d="M14 3.5v4h4M9.5 12h5M9.5 15.5h5" />
    </>
  ),
  org: (
    <>
      <rect x="9" y="3.5" width="6" height="4.5" rx="1" />
      <rect x="3.5" y="15.5" width="6" height="4.5" rx="1" />
      <rect x="14.5" y="15.5" width="6" height="4.5" rx="1" />
      <path d="M12 8v3.5M6.5 15.5v-4h11v4" />
    </>
  ),
  exclaim: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.2v.3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 8h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <path d="M4 8 9.5 13h5L20 8" />
    </>
  ),
  close: (
    <>
      <path d="M7 7l10 10M17 7 7 17" />
    </>
  ),
  check: <path d="M5.5 12.5 10 17l8.5-9" />,
  plus: (
    <>
      <path d="M12 6v12M6 12h12" />
    </>
  ),
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  alert: (
    <>
      <path d="M12 4 3.5 19h17L12 4Z" />
      <path d="M12 10v4M12 16.5v.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  empty: (
    <>
      <rect x="4" y="6" width="16" height="13" rx="2" />
      <path d="M8 11h8M8 15h5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M8 4v4M16 4v4M4 11h16" />
    </>
  ),
  external: (
    <>
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />
    </>
  ),
  folder: (
    <>
      <path d="M4 8h5l2 2h9v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Z" />
      <path d="M4 8V7a1 1 0 0 1 1-1h3.5" />
    </>
  ),
  task: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h4" />
    </>
  ),
  progress: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 8 8" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3.5 19c1.2-3 3.2-4.5 5.5-4.5S13.3 16 14.5 19" />
      <path d="M14 14.2c1.4-.4 2.8 0 4.2 1.8" />
    </>
  ),
  event: (
    <>
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M8 4v4M16 4v4M4 11h16M10 15h4" />
    </>
  ),
  pulse: (
    <>
      <path d="M3 12h4l2.5-6 3 12 2.5-6H21" />
    </>
  ),
  systems: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19h16" />
      <path d="M7 16V10M12 16V7M17 16v-4" />
    </>
  ),
  program: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  moon: (
    <>
      <path d="M19 13.5A7.5 7.5 0 1 1 10.5 5 6 6 0 0 0 19 13.5Z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  home: (
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M7 10.5V19h10v-8.5" />
    </>
  ),
  board: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 5v14M13 5v14M4 10h16" />
    </>
  ),
  pastoral: (
    <>
      <path d="M12 19s-6.5-4.2-6.5-9A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 6.5 2c0 4.8-6.5 9-6.5 9Z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6" />
    </>
  ),
  building: (
    <>
      <path d="M5 20V6.5L12 4l7 2.5V20" />
      <path d="M9 20v-5h6v5M9 10h.01M12 10h.01M15 10h.01M9 13h.01M12 13h.01M15 13h.01" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 8.5h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-10Z" />
      <path d="M4 8.5 7 5h10l3 3.5M15.5 13.5h3" />
    </>
  ),
  layers: (
    <>
      <path d="m4 9 8-4 8 4-8 4-8-4Z" />
      <path d="m4 13 8 4 8-4" />
      <path d="m4 17 8 4 8-4" />
    </>
  ),
  hand: (
    <>
      <path d="M8 11V7.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 10.5V6.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 10V7.8a1.5 1.5 0 0 1 3 0V13c0 3.5-2.2 6-5.5 6H12a5 5 0 0 1-5-5v-3.5a1.5 1.5 0 0 1 3 0V11" />
    </>
  ),
  menu: (
    <>
      <path d="M5 7h14M5 12h14M5 17h14" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  className,
  label,
  ...rest
}: {
  name: IconName;
  size?: number;
  /** Accessible name — omit when decorative beside visible text. */
  label?: string;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
