/**
 * Sync engine: replays queued offline mutations against Supabase.
 */
import { supabase } from '@/integrations/supabase/client';
import { offlineQueue, QueuedMutation, NewQueuedMutation } from './offline-db';

export const SYNC_STATE_EVENT = 'revystudy:sync-state';

let syncPromise: Promise<void> | null = null;

function announceSyncState() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_STATE_EVENT));
}

async function replayMutation(m: QueuedMutation): Promise<void> {
  const { table, action, payload } = m;

  if (action === 'insert') {
    const { error } = await supabase.from(table).upsert(payload as any);
    if (error) throw error;
  } else if (action === 'update') {
    const { id, ...rest } = payload;
    const { error } = await supabase.from(table).update(rest as any).eq('id', id);
    if (error) throw error;
  } else if (action === 'delete') {
    const { error } = await supabase.from(table).delete().eq('id', payload.id);
    if (error) throw error;
  }
}

async function runSync(): Promise<void> {
  while (navigator.onLine) {
    const mutations = await offlineQueue.getAll();
    if (mutations.length === 0) return;
    announceSyncState();

    for (let index = 0; index < mutations.length;) {
      const mutation = mutations[index];
      try {
        const batch = [mutation];
        if (mutation.action === 'insert') {
          for (let next = index + 1; next < Math.min(mutations.length, index + 100); next += 1) {
            const candidate = mutations[next];
            if (candidate.action !== 'insert' || candidate.table !== mutation.table) break;
            batch.push(candidate);
          }
        }

        if (batch.length > 1) {
          const { error } = await supabase.from(mutation.table).upsert(batch.map((item) => item.payload) as any);
          if (error) throw error;
        } else {
          await replayMutation(mutation);
        }
        await Promise.all(batch.map((item) => offlineQueue.remove(item.id)));
        index += batch.length;
        announceSyncState();
      } catch (err) {
        console.error(`[Sync] Failed to replay mutation ${mutation.id}:`, err);
        // Stop on first failure to preserve order. The durable row remains queued.
        return;
      }
    }
  }
}

export async function syncOfflineQueue(): Promise<void> {
  if (syncPromise) return syncPromise;

  syncPromise = runSync().finally(() => {
    syncPromise = null;
    announceSyncState();
  });
  return syncPromise;
}

/**
 * Durable outbox: write locally to the queue first, then try the cloud.
 * A failed online request remains queued and is retried automatically.
 */
export async function persistMutations(mutations: NewQueuedMutation[]): Promise<void> {
  for (const mutation of mutations) await offlineQueue.add(mutation);
  announceSyncState();
  if (navigator.onLine) await syncOfflineQueue();
}

export function getPendingMutationCount(): Promise<number> {
  return offlineQueue.count();
}
