import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  attentionService,
  type AttentionViewItem,
} from '../services/attentionService';
import { INBOX_REFRESH_EVENT } from '../services/inboxNotify';

export function useAttention() {
  const { account, roles, positions, tasks, can, authSource } = useAuth();
  const [items, setItems] = useState<AttentionViewItem[]>([]);
  const [source, setSource] = useState<'api' | 'seed'>('seed');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!account) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const r = await attentionService.list({
        personId: account.personId,
        roles,
        positions,
        tasks,
        can: (resource, action, systemId) =>
          can(
            resource as Parameters<typeof can>[0],
            action as Parameters<typeof can>[1],
            systemId as Parameters<typeof can>[2],
          ),
      });
      if (cancelled) return;
      setItems(r.items);
      setSource(r.source);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [account, roles, positions, tasks, can, authSource, tick]);

  useEffect(() => {
    const onRefresh = () => reload();
    window.addEventListener(INBOX_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(INBOX_REFRESH_EVENT, onRefresh);
  }, [reload]);

  const markRead = useCallback(
    (id: string) => {
      attentionService.markRead(id);
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, unread: false } : i)),
      );
    },
    [],
  );

  const markUnread = useCallback((id: string) => {
    attentionService.markUnread(id);
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, unread: true } : i)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    attentionService.markAllRead(items.map((i) => i.id));
    setItems((prev) => prev.map((i) => ({ ...i, unread: false })));
  }, [items]);

  return {
    items,
    source,
    loading,
    reload,
    markRead,
    markUnread,
    markAllRead,
    unreadCount: attentionService.unreadCount(items),
  };
}
