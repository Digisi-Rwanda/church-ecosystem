/**
 * English wording. Every screen text lives here under a key, so each language has its
 * own file and no wording is baked into a screen. Use {name} for values filled in later.
 *
 * Rule: a screen moves its wording here when it is built or reworked. Kinyarwanda
 * (rw.ts) and French (fr.ts) are written by speakers of those languages, not translated.
 */
export const en = {
  // App frame
  'shell.skip': 'Skip to content',
  'shell.primaryNav': 'Primary',
  'shell.mainNav': 'Main',
  'shell.menuOpen': 'Open menu',
  'shell.menuClose': 'Close menu',
  'shell.signOut': 'Sign out',
  'shell.weekOf': 'Week of {date}',
  'shell.search': 'Search',
  'shell.searchOpen': 'Open search',
  'shell.searchTitle': 'Search (Ctrl/⌘+K)',
  'shell.inbox': 'Inbox',
  'shell.unread': '{count} unread',
  'shell.loading': 'Loading…',
  'shell.memberFallback': 'Member',
  'shell.mainChurch': 'Main Church',
  'shell.language': 'Language',

  // Menu groups
  'nav.group.home': 'Home',
  'nav.group.people': 'People & org',
  'nav.group.work': 'Work',
  'nav.group.admin': 'Admin',

  // Menu items
  'nav.home': 'Home',
  'nav.inbox': 'Inbox',
  'nav.people': 'People',
  'nav.profile': 'Profile',
  'nav.organization': 'Organisation',
  'nav.participation': 'Participation',
  'nav.mission': 'Mission',
  'nav.programs': 'Programs',
  'nav.events': 'Events',
  'nav.tasks': 'Tasks',
  'nav.projects': 'Projects',
  'nav.calendar': 'Calendar',
  'nav.overview': 'Overview',
  'nav.collections': 'Collections',
  'nav.access': 'Access',
  'nav.systems': 'Systems',

  // Page titles
  'page.home.title': 'Home',
  'page.home.subtitle': 'This week at ADEPR Kacyiru — what is urgent, and what is coming.',
  'page.inbox.title': 'Inbox',
  'page.inbox.subtitle': 'Approvals, handoffs, and work that needs you.',

  // Home
  'home.goodDay': 'Good day,',
  'home.waitingInbox': '{count} waiting in Inbox',
  'home.urgent': 'Urgent',
  'home.urgentEmpty': 'Nothing urgent. When approvals or handoffs arrive, they show here.',
  'home.inboxLink': 'Inbox →',
  'home.statusNew': 'New',
  'home.statusOpen': 'Open',

  // Sign-in
  'login.welcome': 'Welcome',
  'login.subtitleMain': 'Sign in to continue to your account',
  'login.subtitleChoir': 'Direct login to this choir. Same account as Main Church.',
  'login.subtitleSystem': 'Direct login to {system}. Same account as Main Church.',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.signIn': 'Sign in',
  'login.signingIn': 'Signing in…',
  'login.signingInLabel': 'Signing in',
  'login.error': 'Invalid credentials or you are not entitled to this system.',

  // Test and demo markers
  'demo.ribbon': 'TEST SITE — demo data only. Nothing here is real, and it may be reset.',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
