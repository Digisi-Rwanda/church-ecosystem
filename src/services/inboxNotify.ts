const READ_KEY = 'adepr.attentionRead';
export const INBOX_REFRESH_EVENT = 'adepr-inbox-refresh';

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeSet(ids: Set<string>) {
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
}

/** Mark inbox item ids unread (e.g. after someone sends you a letter request). */
export function markInboxUnread(...ids: string[]) {
  if (ids.length === 0) return;
  const s = readSet();
  for (const id of ids) s.delete(id);
  writeSet(s);
}

export function pingInboxRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(INBOX_REFRESH_EVENT));
}

export function notifyInboxItem(id: string) {
  markInboxUnread(id);
  pingInboxRefresh();
}
