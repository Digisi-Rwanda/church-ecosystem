import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  SCHEDULE_SYNCED_EVENT,
  getSyncStatus,
  type ScheduleSyncDetail,
  type SyncStatus,
} from '../data/scheduleServerSync';
import { appEnv } from '../lib/appEnv';
import { useToast } from './ui/Toast';

/** True while the person is in the middle of something a re-render would wipe. */
function userIsBusy(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.querySelector('.drawer-panel, [role="dialog"][aria-modal="true"]')) {
    return true;
  }
  const a = document.activeElement;
  if (!a || a === document.body) return false;
  const tag = a.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (a as HTMLElement).isContentEditable === true
  );
}

/** Top ribbon on the rehearsal site so nobody mistakes it for the real one. */
function StagingRibbon() {
  return (
    <div
      role="note"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 70,
        textAlign: 'center',
        fontSize: '0.72rem',
        padding: '0.1rem 0.5rem',
        background: '#fff4cc',
        color: '#6b4e00',
        borderBottom: '1px solid #e6cf7a',
        pointerEvents: 'none',
      }}
    >
      TEST SITE — practice data only. Nothing here is real, and it may be reset.
    </div>
  );
}

/** Small corner badge: is Music/Protocol data being shared through the server? */
function SyncBadge() {
  const [st, setSt] = useState<SyncStatus>(() => getSyncStatus());
  useEffect(() => {
    const t = window.setInterval(() => setSt(getSyncStatus()), 2000);
    return () => window.clearInterval(t);
  }, []);
  const text =
    st.state === 'ok'
      ? `Shared with the server · Music v${st.music} · Protocol v${st.protocol}`
      : st.state === 'no-token'
        ? `This device only — signed in without the server, so Music and Protocol data is NOT shared${st.note ? `. Why: ${st.note}` : ''}`
        : st.state === 'no-api'
          ? 'This device only — this site has no server address (VITE_API_URL)'
          : `Not syncing — ${st.error ?? 'server problem'}`;
  const bad = st.state !== 'ok';
  return (
    <div
      role="status"
      title={text}
      style={{
        position: 'fixed',
        left: '0.6rem',
        bottom: '0.6rem',
        zIndex: 60,
        maxWidth: 'min(28rem, calc(100vw - 1.2rem))',
        padding: '0.25rem 0.6rem',
        borderRadius: '999px',
        fontSize: '0.72rem',
        lineHeight: 1.3,
        background: bad ? '#fde8e8' : '#e6f4ea',
        color: bad ? '#8a1c1c' : '#1e5631',
        border: `1px solid ${bad ? '#e9a3a3' : '#a7d7b5'}`,
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  );
}

const MODULE = (k: string) => (k === 'music' ? 'Music' : 'Protocol');

/**
 * When newer shared Music/Protocol data arrives from the server, re-render the
 * app so every screen shows it — but never while the person has a form or
 * drawer open: then the new data waits, and a "Refresh view" button appears
 * (it also applies on its own as soon as they are done).
 * Merged saves and true conflicts are reported.
 */
export function ScheduleSyncGate({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const { push } = useToast();
  const pending = useRef(false);
  const toastShown = useRef(false);

  const apply = useCallback(() => {
    pending.current = false;
    toastShown.current = false;
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const onSynced = (e: Event) => {
      const d = (e as CustomEvent<ScheduleSyncDetail>).detail;
      if (d?.reason === 'conflict') {
        push({
          title: 'Someone else changed the same thing',
          detail: `${d.conflicts && d.conflicts > 1 ? `${d.conflicts} of your ${MODULE(d.key)} edits were` : `One of your ${MODULE(d.key)} edits was`} replaced by the newer shared version. Everything else you changed was kept. Please check it.`,
          tone: 'warn',
          durationMs: 9000,
        });
      } else if (d?.reason === 'merged') {
        push({
          title: 'Combined with a colleague’s changes',
          detail: `Your ${MODULE(d.key)} change was saved together with changes someone else made at the same time.`,
          tone: 'info',
          durationMs: 5000,
        });
      }
      if (userIsBusy()) {
        pending.current = true;
        if (!toastShown.current) {
          toastShown.current = true;
          push({
            title: 'Newer shared data is available',
            detail: 'It will show once you close this form, or refresh now.',
            tone: 'info',
            durationMs: 12000,
            action: { label: 'Refresh view', onClick: apply },
          });
        }
        return;
      }
      apply();
    };
    window.addEventListener(SCHEDULE_SYNCED_EVENT, onSynced);
    // Apply waiting data as soon as the person is no longer busy.
    const idle = window.setInterval(() => {
      if (pending.current && !userIsBusy()) apply();
    }, 1500);
    return () => {
      window.removeEventListener(SCHEDULE_SYNCED_EVENT, onSynced);
      window.clearInterval(idle);
    };
  }, [push, apply]);

  return (
    <>
      <Fragment key={version}>{children}</Fragment>
      {appEnv() === 'staging' && <StagingRibbon />}
      {appEnv() !== 'production' && <SyncBadge />}
    </>
  );
}
