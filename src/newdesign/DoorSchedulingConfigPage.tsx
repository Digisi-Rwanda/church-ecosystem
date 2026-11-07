import { Link, UNSAFE_DataRouterContext, useBlocker, useParams, useSearchParams } from "react-router-dom";
import { useContext, useEffect, useRef, useState } from "react";
import { SchedulingSetupContext } from './SchedulingSetupContext';
import {
  acquireConfigLock, fetchConfigValidation, refreshConfigLock, releaseConfigLock,
  type ConfigLockHolder,
} from "../api/frontDoorApi";
import { ApiError } from "../api/client";
import { useT } from "../i18n/I18nContext";
import { useFrontDoor } from "./FrontDoorContext";
import { LoadState } from "./LoadState";
import { useLoad } from "./useLoad";
import { ConfirmDialog, PageHeader, StatusChip } from "./kit";
import {
  CategoriesEditor,
  ChoirsEditor,
  ProtocolDutyEditor,
  ProtocolRulesEditor,
  RulesEditor,
  ServicesEditor,
} from "./SchedulingConfigEditors";
import {
  configTabsForSystem,
  configTabKey,
  normalizeConfigTab,
} from "./config";

/**
 * Music setup is four tabs (Services, Choir categories, Choirs, Rules); Protocol shows Services, Team rules, Duty.
 * Configuration is LIVE: every save applies at once and is picked up by the next generate call.
 * There are no drafts, versions or activation. Because nothing isolates an edit, the server lets one
 * person edit at a time (see server/src/scheduling/editLock.ts). This page takes that lock on mount,
 * keeps it alive while open, and gives it back on leave.
 */
const HEARTBEAT_MS = 60_000; // lock TTL is 15 minutes; refresh well inside it

type LockState = 'pending' | 'held' | 'blocked' | 'lost' | 'readonly';

// Serializes release -> acquire so React StrictMode's mount/unmount/mount cannot let a late release
// delete the lock that the second mount just took.
let lastRelease: Promise<unknown> = Promise.resolve();

/** Only mounted under a data router (useBlocker throws under <BrowserRouter>). */
function LeaveGuard({ when }: { when: boolean }) {
  const t = useT();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname);
  return <ConfirmDialog open={blocker.state === 'blocked'} title={t('door.config.leave.title')} body={t('door.config.setup.unsaved')}
    confirmLabel={t('door.config.leave.confirm')} onConfirm={() => blocker.proceed?.()} onCancel={() => blocker.reset?.()} />;
}

export function DoorSchedulingConfigPage() {
  const t = useT();
  const { capabilities } = useFrontDoor();
  const { systemId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasDataRouter = !!useContext(UNSAFE_DataRouterContext);
  const tabs = configTabsForSystem(systemId);
  const [unsaved, setUnsaved] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const [lock, setLock] = useState<LockState>('pending');
  const [holder, setHolder] = useState<ConfigLockHolder | null>(null);
  const configAccess = capabilities?.systems.find((system) => system.id === systemId)
    ?.own?.find((block) => block.key === "config")?.letters ?? [];
  const mayEdit = configAccess.includes("W");
  // Editors only get canWrite when the person may edit AND holds the lock.
  const canWrite = mayEdit && lock === 'held';
  const validation = useLoad(() => fetchConfigValidation(systemId), `sched-config-validation|${systemId}`);
  const tab = normalizeConfigTab(searchParams.get("tab"), tabs);

  // Lock lifecycle: acquire on mount, heartbeat while open, release on unmount or pagehide.
  const holding = useRef(false);
  useEffect(() => {
    if (!systemId || !mayEdit) { setLock('readonly'); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tryAcquire = async () => {
      try {
        await acquireConfigLock(systemId);
        holding.current = true;
        if (!cancelled) { setLock('held'); setHolder(null); }
        return true;
      } catch (reason) {
        holding.current = false;
        if (cancelled) return false;
        const body = reason instanceof ApiError ? reason.body as { holder?: ConfigLockHolder } | undefined : undefined;
        setHolder(body?.holder ?? null);
        setLock('blocked');
        return false;
      }
    };
    setLock('pending');
    void lastRelease.then(async () => {
      if (cancelled || !(await tryAcquire()) || cancelled) return;
      timer = setInterval(() => {
        void refreshConfigLock(systemId).catch(async () => {
          // Expired or taken over while idle: try to take it back; otherwise show who has it.
          if (!(await tryAcquire()) && !cancelled) setLock((s) => s === 'blocked' ? s : 'lost');
        });
      }, HEARTBEAT_MS);
    });
    const onHide = () => { if (holding.current) { holding.current = false; void releaseConfigLock(systemId).catch(() => {}); } };
    window.addEventListener('pagehide', onHide);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener('pagehide', onHide);
      if (holding.current) { holding.current = false; lastRelease = releaseConfigLock(systemId).catch(() => {}); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemId, mayEdit]);

  // Unsaved edits in a form: warn on tab close / reload. In-app navigation is guarded by <LeaveGuard/>.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const selectTab = (nextTab: string) => {
    if (unsaved) { setNavigationError(t('door.config.setup.unsaved')); return; }
    setNavigationError('');
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("tab", nextTab);
      return next;
    });
  };
  const goTo = (next: string) => selectTab(next);
  const systemName = systemId === "sys-music" ? t("door.config.system.music")
    : systemId === "sys-protocol" ? t("door.config.system.protocol")
      : t("door.config.system.unknown");
  const tabCopyKey = `door.config.intro.${systemId === "sys-protocol" ? "protocol" : "music"}.${tab}` as Parameters<typeof t>[0];
  const holderName = holder?.name ?? t('door.config.lock.someone');

  return (
    <section className="door-block scheduling-config" aria-labelledby="door-config-title">
      <PageHeader id="door-config-title" title={t("door.config.title")}
        meta={<StatusChip tone="info">{systemName}</StatusChip>} />
      <div className="scheduling-config-bar">
        <Link className="btn ghost sm" to={systemId === "sys-music" ? "/s/sys-music/monthplan" : "/s/sys-protocol/teams"}>{t("door.scheduling.workspace")}</Link>
        {lock === 'blocked' && <p className="scheduling-config-lock is-blocked" role="alert">{t('door.config.lock.heldBy', { name: holderName })}</p>}
        {lock === 'lost' && <p className="scheduling-config-lock is-lost" role="alert">{t('door.config.lock.lost')}</p>}
        {mayEdit && lock === 'held' && <p className="scheduling-config-lock is-mine" role="status">{t('door.config.lock.mine')}</p>}
        {!mayEdit && <p className="scheduling-config-lock" role="status">{t('door.config.readOnly')}</p>}
      </div>
      <div className="scheduling-config-lead">
        <p className="scheduling-config-intro">{t("door.config.intro")}</p>
        <p className="scheduling-config-note" role="note">{t('door.config.live')}</p>
      </div>
      {validation.data && !validation.data.ok && <div className="panel scheduling-config-validation" role="status">
        <strong>{t('door.config.validation.heading')}</strong>
        <ul className="door-list">{validation.data.errors.map((message) => <li key={message}>{message}</li>)}</ul>
      </div>}
      <nav className="door-menu" aria-label={t("door.config.tabs")}>
        {tabs.map((key) => (
          <button key={key} type="button" className={"door-menu-link" + (tab === key ? " active" : "")}
            aria-current={tab === key ? "page" : undefined} onClick={() => selectTab(key)}>
            {t(configTabKey(key))}
          </button>
        ))}
      </nav>
      {navigationError && <p className="door-error" role="alert">{navigationError}</p>}
      <header className="scheduling-config-section">
        <h3>{t(configTabKey(tab))}</h3>
        <p className="muted">{t(tabCopyKey)}</p>
      </header>
      <LoadState loading={lock === 'pending' && mayEdit} failed={false} retry={() => {}}>
        <SchedulingSetupContext.Provider value={{ saved: () => { setUnsaved(false); setNavigationError(''); validation.reload(); }, changed: () => setUnsaved(true) }}>
          <div onChangeCapture={() => setUnsaved(true)}>
            {tab === "services" && <ServicesEditor systemId={systemId} canWrite={canWrite} />}
            {tab === "categories" && <CategoriesEditor systemId={systemId} canWrite={canWrite} />}
            {tab === "choirs" && <ChoirsEditor systemId={systemId} canWrite={canWrite} />}
            {tab === "rules" && <RulesEditor systemId={systemId} canWrite={canWrite} goTo={goTo} />}
            {tab === "protocol" && <ProtocolRulesEditor systemId={systemId} canWrite={canWrite} />}
            {tab === "duty" && <ProtocolDutyEditor systemId={systemId} canWrite={canWrite} />}
          </div>
        </SchedulingSetupContext.Provider>
      </LoadState>
      {hasDataRouter && <LeaveGuard when={unsaved} />}
    </section>
  );
}
