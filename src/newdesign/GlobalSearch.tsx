import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { fetchAnnouncements, fetchDecisions, fetchMeetings, fetchNotices, fetchPeople, fetchPlans, fetchReports, fetchStructure, fetchWork } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import type { NavModule } from './menu';
import { matchesText } from './kit';

type Hit = { key: string; group: 'pages' | 'people' | 'units' | 'work' | 'tasks' | 'meetings' | 'decisions' | 'reports' | 'notices' | 'announcements'; label: string; detail?: string; to: string };
const GROUPS: Hit['group'][] = ['pages', 'people', 'units', 'work', 'tasks', 'meetings', 'decisions', 'reports', 'notices', 'announcements'];

/** One box on the top bar that finds everything the person may open in this system: pages, people, units, activities, tasks, meetings, decisions, reports, notifications and announcements. Each source is asked with the person's own access, so nothing else can come back. */
export function GlobalSearch({ modules }: { modules: NavModule[] }) {
  const t = useT();
  const nav = useNavigate();
  const location = useLocation();
  const systemId = /^\/s\/([^/]+)/.exec(location.pathname)?.[1];
  const base = systemId ? `/s/${systemId}` : '';
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<Hit[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const pages = useMemo<Hit[]>(
    () =>
      modules.flatMap((m) =>
        m.places
          .filter((p) => !p.external)
          .map((p) => ({ key: `p-${m.id}-${p.key}`, group: 'pages' as const, label: p.label ?? t(p.labelKey as 'door.block.home'), detail: t(m.labelKey as 'door.block.home'), to: p.to })),
      ),
    [modules, t],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, []);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) {
      setFound([]);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const out: Hit[] = [];
      const settled = await Promise.allSettled([
        systemId ? fetchPeople({ q, systemId }) : Promise.resolve([]),
        systemId ? fetchPlans({ systemId, view: 'all', status: 'all', q }) : Promise.resolve([]),
        fetchNotices({ tab: 'waiting' }),
        fetchNotices({ tab: 'info' }),
        fetchAnnouncements(),
        systemId ? fetchStructure(systemId) : Promise.resolve(null),
        systemId ? fetchWork({ systemId, view: 'all', status: 'all', q }) : Promise.resolve([]),
        systemId ? fetchMeetings({ systemId }) : Promise.resolve([]),
        systemId ? fetchDecisions({ systemId, q }) : Promise.resolve([]),
        systemId ? fetchReports({ systemId }) : Promise.resolve({ reports: [], canCompose: false }),
      ]);
      if (!live) return;
      const [people, plans, waiting, info, ann, structure, tasks, meetings, decisions, reports] = settled;
      if (people.status === 'fulfilled') for (const p of people.value.slice(0, 5)) out.push({ key: `u-${p.id}`, group: 'people', label: p.fullName, detail: p.memberCode ?? undefined, to: `${base}/people/${p.id}` });
      if (plans.status === 'fulfilled') for (const p of plans.value.slice(0, 5)) out.push({ key: `w-${p.id}`, group: 'work', label: p.title, detail: p.unitName, to: `${base}/work/plans/${p.id}` });
      const notices = [...(waiting.status === 'fulfilled' ? waiting.value.items : []), ...(info.status === 'fulfilled' ? info.value.items : [])];
      for (const n of notices.filter((i) => matchesText(q, i.title, i.body)).slice(0, 4)) out.push({ key: `n-${n.key}`, group: 'notices', label: n.title, to: n.href ?? `${base}/notifications` });
      if (ann.status === 'fulfilled') for (const a of ann.value.items.filter((i) => matchesText(q, i.title, i.body, i.authorName)).slice(0, 4)) out.push({ key: `a-${a.id}`, group: 'announcements', label: a.title, detail: a.authorName, to: `${base}/announcements` });
      if (structure.status === 'fulfilled' && structure.value) for (const u of structure.value.units.filter((x) => matchesText(q, x.name, x.code ?? '')).slice(0, 4)) out.push({ key: `o-${u.id}`, group: 'units', label: u.name, detail: u.code ?? undefined, to: `${base}/people/units/${u.id}` });
      if (tasks.status === 'fulfilled') for (const w of tasks.value.slice(0, 4)) out.push({ key: `k-${w.id}`, group: 'tasks', label: w.title, detail: w.ownerName, to: `${base}/work` });
      if (meetings.status === 'fulfilled') for (const m of meetings.value.filter((x) => matchesText(q, x.title, x.unitName, x.typeName)).slice(0, 4)) out.push({ key: `m-${m.id}`, group: 'meetings', label: m.title, detail: m.unitName, to: `${base}/governance/meetings/${m.id}` });
      if (decisions.status === 'fulfilled') for (const d of decisions.value.slice(0, 4)) out.push({ key: `d-${d.id}`, group: 'decisions', label: d.title, detail: d.unitName, to: `${base}/governance/decisions` });
      if (reports.status === 'fulfilled') for (const r of reports.value.reports.filter((x) => matchesText(q, x.title, x.unitName)).slice(0, 4)) out.push({ key: `r-${r.id}`, group: 'reports', label: r.title, detail: r.unitName, to: `${base}/reports/${r.id}` });
      setFound(out);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, systemId, base]);

  const hits = useMemo(() => {
    const q = text.trim();
    if (!q) return [];
    return [...pages.filter((p) => matchesText(q, p.label, p.detail)).slice(0, 5), ...found];
  }, [text, pages, found]);

  const go = (h: Hit) => {
    setOpen(false);
    setText('');
    nav(h.to);
  };

  return (
    <div className="gsearch" ref={box}>
      <label htmlFor="gsearch-input" className="sr-only">{t('door.search.global')}</label>
      <Icon name="search" size={16} className="gsearch-icon" />
      <input
        id="gsearch-input"
        ref={input}
        type="search"
        className="gsearch-input"
        value={text}
        placeholder={t('door.search.global')}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            input.current?.blur();
          }
          if (e.key === 'Enter' && hits[0]) go(hits[0]);
        }}
      />
      {open && (
        <div className="gsearch-panel" role="listbox" aria-label={t('door.search.open')}>
          {!text.trim() && <p className="gsearch-hint">{t('door.search.global.hint')}</p>}
          {text.trim() && hits.length === 0 && <p className="gsearch-hint">{t('door.search.noMatch')}</p>}
          {GROUPS.map((g) => {
            const items = hits.filter((h) => h.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g} className="gsearch-group">
                <p className="gsearch-title">{t(`door.search.group.${g}` as 'door.search.group.pages')}</p>
                {items.map((h) => (
                  <button key={h.key} type="button" role="option" aria-selected={false} className="gsearch-item" onClick={() => go(h)}>
                    <span>{h.label}</span>
                    {h.detail && <small>{h.detail}</small>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
