import { syncDictation } from '@/lib/dictation-sync';
import { useState, useEffect, useCallback } from 'react';
import { getPendingMutationCount, syncOfflineQueue, SYNC_STATE_EVENT } from '@/lib/sync';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await getPendingMutationCount());
  }, []);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncOfflineQueue();
      await syncDictation();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      await refreshPendingCount();
      setIsSyncing(false);
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      handleSync();
    };
    const onOffline = () => {
      setIsOnline(false);
      void refreshPendingCount();
    };
    const onSyncState = () => void refreshPendingCount();

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(SYNC_STATE_EVENT, onSyncState);
    void refreshPendingCount();
    if (navigator.onLine) void handleSync();
    const retryTimer = window.setInterval(() => {
      if (navigator.onLine) void handleSync();
    }, 30_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(SYNC_STATE_EVENT, onSyncState);
      window.clearInterval(retryTimer);
    };
  }, [handleSync, refreshPendingCount]);

  return { isOnline, isSyncing, pendingCount, syncNow: handleSync };
}
