import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAttention } from '../hooks/useAttention';
import { missionService, peopleService } from '../services';
import { useToast } from './ui/Toast';

type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  group: string;
  /** Non-navigation action (e.g. keyboard help toast). */
  action?: 'keyboard-help';
};

type RecentEntry = PaletteItem & { at: number };

function buildDestinations(input: {
  canViewPeople: boolean;
  canAdmin: boolean;
  profilePath: string;
  attentionHrefs: Array<{ id: string; title: string; href: string }>;
}): PaletteItem[] {
  const dest: PaletteItem[] = [
    { id: 'home', label: 'Dashboard', href: '/', group: 'Go to' },
    { id: 'inbox', label: 'Inbox', href: '/inbox', group: 'Go to' },
    { id: 'mission', label: 'Mission', href: '/mission', group: 'Go to' },
    { id: 'programs', label: 'Programs', href: '/programs', group: 'Go to' },
    { id: 'events', label: 'Events', href: '/events', group: 'Go to' },
    { id: 'tasks', label: 'Tasks', href: '/tasks', group: 'Go to' },
    { id: 'projects', label: 'Projects', href: '/projects', group: 'Go to' },
    { id: 'calendar', label: 'Calendar', href: '/calendar', group: 'Go to' },
    {
      id: 'people',
      label: input.canViewPeople ? 'People' : 'My profile',
      href: input.canViewPeople ? '/people' : input.profilePath,
      group: 'Go to',
    },
    {
      id: 'org',
      label: 'Organisation',
      href: '/organization',
      group: 'Go to',
    },
    {
      id: 'participation',
      label: 'Participation',
      href: '/participation',
      group: 'Go to',
    },
    { id: 'systems', label: 'Systems', href: '/systems', group: 'Go to' },
  ];
  if (input.canAdmin) {
    dest.push({
      id: 'access',
      label: 'Access engine',
      href: '/access',
      group: 'Go to',
    });
  }
  for (const a of input.attentionHrefs.slice(0, 8)) {
    dest.push({
      id: `att-${a.id}`,
      label: a.title,
      hint: 'Needs me',
      href: a.href,
      group: 'Needs me',
    });
  }
  return dest;
}

function matchQuery(label: string, query: string) {
  if (!query) return true;
  return label.toLowerCase().includes(query);
}

function buildPeopleItems(input: {
  canViewPeople: boolean;
  personId: string;
  query: string;
}): PaletteItem[] {
  const needle = input.query.trim().toLowerCase();
  const people = input.canViewPeople
    ? needle
      ? peopleService.search(needle)
      : peopleService.list()
    : (() => {
        const self = peopleService.getById(input.personId);
        return self ? [self] : [];
      })();
  return people.slice(0, 8).map((p) => ({
    id: `person-${p.id}`,
    label: p.preferredName || p.fullName,
    hint: p.email,
    href: `/people/${p.id}`,
    group: 'People',
  }));
}

function buildWorkItems(query: string): PaletteItem[] {
  const needle = query.trim().toLowerCase();
  const out: PaletteItem[] = [];
  const programs = missionService
    .listPrograms({ viewerSystemId: 'sys-main' })
    .filter((p) => matchQuery(p.name, needle))
    .slice(0, 8);
  for (const p of programs) {
    out.push({
      id: `prog-${p.id}`,
      label: p.name,
      hint: 'Program',
      href: `/programs/${p.id}`,
      group: 'Work',
    });
  }
  const events = missionService
    .listEvents({ viewerSystemId: 'sys-main' })
    .filter((e) => matchQuery(e.name, needle))
    .slice(0, 8);
  for (const e of events) {
    out.push({
      id: `evt-${e.id}`,
      label: e.name,
      hint: 'Event',
      href: `/events/${e.id}`,
      group: 'Work',
    });
  }
  const tasks = missionService
    .listTasks({ viewerSystemId: 'sys-main' })
    .filter((t) => matchQuery(t.title, needle))
    .slice(0, 8);
  for (const t of tasks) {
    out.push({
      id: `task-${t.id}`,
      label: t.title,
      hint: 'Task',
      href: `/tasks/${t.id}`,
      group: 'Work',
    });
  }
  const projects = missionService
    .listProjects({ viewerSystemId: 'sys-main' })
    .filter((p) => matchQuery(p.name, needle))
    .slice(0, 8);
  for (const p of projects) {
    out.push({
      id: `proj-${p.id}`,
      label: p.name,
      hint: 'Project',
      href: `/projects/${p.id}`,
      group: 'Work',
    });
  }
  return out;
}

function buildActionItems(input: {
  canManageTask: boolean;
  canManageEvent: boolean;
  canManageProgram: boolean;
}): PaletteItem[] {
  const out: PaletteItem[] = [];
  if (input.canManageTask) {
    out.push({
      id: 'action-create-task',
      label: 'Create task',
      hint: 'Actions',
      href: '/tasks',
      group: 'Actions',
    });
  }
  if (input.canManageEvent) {
    out.push({
      id: 'action-create-event',
      label: 'Create event',
      hint: 'Actions',
      href: '/events',
      group: 'Actions',
    });
  }
  if (input.canManageProgram) {
    out.push({
      id: 'action-create-program',
      label: 'Create program',
      hint: 'Actions',
      href: '/programs',
      group: 'Actions',
    });
  }
  return out;
}

function buildHelpItems(): PaletteItem[] {
  return [
    {
      id: 'help-keys',
      label: 'Keyboard shortcuts',
      hint: 'Help',
      href: '#keyboard-help',
      group: 'Help',
      action: 'keyboard-help',
    },
    {
      id: 'help-inbox',
      label: 'Go to Inbox',
      hint: 'Needs me',
      href: '/inbox',
      group: 'Help',
    },
    {
      id: 'help-mission',
      label: 'Go to Mission board',
      hint: 'Work',
      href: '/mission',
      group: 'Help',
    },
  ];
}

const RECENTS_KEY = 'adepr.cmdk.recents';
const MAX_RECENTS = 10;

function isRecentEntry(x: unknown): x is RecentEntry {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.label === 'string' &&
    typeof o.href === 'string' &&
    typeof o.group === 'string'
  );
}

/** Migrate legacy id-only arrays into empty list (snapshots required). */
function loadRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    if (parsed.length === 0) return [];
    if (typeof parsed[0] === 'string') {
      localStorage.removeItem(RECENTS_KEY);
      return [];
    }
    return parsed.filter(isRecentEntry).map((e) => ({
      ...e,
      at: typeof e.at === 'number' ? e.at : Date.now(),
    }));
  } catch {
    return [];
  }
}

function saveRecents(entries: RecentEntry[]) {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(entries.slice(0, MAX_RECENTS)));
}

function pushRecent(item: PaletteItem): RecentEntry[] {
  const entry: RecentEntry = {
    id: item.id,
    label: item.label,
    hint: item.hint,
    href: item.href,
    group: item.group,
    action: item.action,
    at: Date.now(),
  };
  const next = [entry, ...loadRecents().filter((x) => x.id !== item.id)].slice(
    0,
    MAX_RECENTS,
  );
  saveRecents(next);
  return next;
}

function removeRecent(id: string): RecentEntry[] {
  const next = loadRecents().filter((x) => x.id !== id);
  saveRecents(next);
  return next;
}

function clearRecents(): RecentEntry[] {
  localStorage.removeItem(RECENTS_KEY);
  return [];
}

/**
 * Ctrl/Cmd+K: empty = recent searches; typing = people/work/actions search.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const { account, canViewPeople, can } = useAuth();
  const { items: attention } = useAttention();
  const { push: toast } = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [recents, setRecents] = useState<RecentEntry[]>([]);

  const canAdmin = can('AUDIT', 'VIEW', 'sys-main');
  const canManageTask = can('TASK', 'MANAGE');
  const canManageEvent = can('EVENT', 'MANAGE');
  const canManageProgram = can('PROGRAM', 'MANAGE');

  const catalog = useMemo(() => {
    if (!account) return [];
    const dest = buildDestinations({
      canViewPeople,
      canAdmin,
      profilePath: `/people/${account.personId}`,
      attentionHrefs: attention.map((a) => ({
        id: a.id,
        title: a.title,
        href: a.href,
      })),
    });
    const people = buildPeopleItems({
      canViewPeople,
      personId: account.personId,
      query: q,
    });
    const work = buildWorkItems(q);
    const actions = buildActionItems({
      canManageTask,
      canManageEvent,
      canManageProgram,
    });
    const help = buildHelpItems();
    return [...dest, ...people, ...work, ...actions, ...help];
  }, [
    account,
    canViewPeople,
    canAdmin,
    attention,
    q,
    canManageTask,
    canManageEvent,
    canManageProgram,
  ]);

  useEffect(() => {
    function openPalette() {
      setRecents(loadRecents());
      setOpen(true);
      setQ('');
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) setOpen(false);
        else openPalette();
      }
      if (e.key === 'Escape') setOpen(false);
    }
    function onCustom() {
      openPalette();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('adepr:cmdk', onCustom);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('adepr:cmdk', onCustom);
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const searching = needle.length > 0;

  const filtered = useMemo(() => {
    if (!searching) return [];
    return catalog
      .filter(
        (i) =>
          i.label.toLowerCase().includes(needle) ||
          i.hint?.toLowerCase().includes(needle) ||
          i.href.toLowerCase().includes(needle) ||
          i.group.toLowerCase().includes(needle),
      )
      .slice(0, 28);
  }, [catalog, needle, searching]);

  function go(item: PaletteItem) {
    setRecents(pushRecent(item));
    setOpen(false);
    setQ('');
    if (item.action === 'keyboard-help') {
      toast({
        title: 'Keyboard shortcuts',
        detail:
          '⌘/Ctrl+K search · Esc close · Tab cycle · Enter confirm · Skip link to content',
        tone: 'info',
        durationMs: 8000,
      });
      return;
    }
    navigate(item.href);
  }

  function onRemoveRecent(e: MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setRecents(removeRecent(id));
  }

  function onClearRecents(e: MouseEvent) {
    e.preventDefault();
    setRecents(clearRecents());
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (searching && filtered[0]) go(filtered[0]);
    else if (!searching && recents[0]) go(recents[0]);
  }

  if (!open || !account) return null;

  return (
    <div className="cmdk-root" role="dialog" aria-label="Command palette">
      <button
        type="button"
        className="cmdk-backdrop"
        aria-label="Close"
        onClick={() => setOpen(false)}
      />
      <div className="cmdk-panel">
        <form onSubmit={onSubmit}>
          <input
            autoFocus
            className="cmdk-input"
            placeholder="Search people, work, actions…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <ul className="cmdk-list">
          {!searching ? (
            recents.length === 0 ? (
              <li className="cmdk-empty muted">
                No recent searches yet — type to search.
              </li>
            ) : (
              <>
                <li className="cmdk-section-head">
                  <span>Recent</span>
                  <button
                    type="button"
                    className="cmdk-clear"
                    onClick={onClearRecents}
                  >
                    Clear all
                  </button>
                </li>
                {recents.map((item) => (
                  <li key={item.id} className="cmdk-row">
                    <button
                      type="button"
                      className="cmdk-item"
                      onClick={() => go(item)}
                    >
                      <span>
                        <strong>{item.label}</strong>
                        {item.hint && (
                          <span className="muted"> · {item.hint}</span>
                        )}
                      </span>
                      <span className="muted cmdk-group">{item.group}</span>
                    </button>
                    <button
                      type="button"
                      className="cmdk-remove"
                      aria-label={`Remove ${item.label} from recent`}
                      title="Remove"
                      onClick={(e) => onRemoveRecent(e, item.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </>
            )
          ) : filtered.length === 0 ? (
            <li className="cmdk-empty muted">No matches</li>
          ) : (
            filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="cmdk-item"
                  onClick={() => go(item)}
                >
                  <span>
                    <strong>{item.label}</strong>
                    {item.hint && (
                      <span className="muted"> · {item.hint}</span>
                    )}
                  </span>
                  <span className="muted cmdk-group">{item.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="cmdk-foot muted">
          <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> · <kbd>↑</kbd>
          <kbd>↓</kbd> · <kbd>Enter</kbd> · <kbd>Esc</kbd> · type “shortcuts”
          for help
        </p>
      </div>
    </div>
  );
}
