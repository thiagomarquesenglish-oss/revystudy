/**
 * Sync engine: replays queued offline mutations against Supabase.
 */
import { supabase } from '@/integrations/supabase/client';
import { offlineQueue, QueuedMutation, NewQueuedMutation } from './offline-db';

export const SYNC_STATE_EVENT = 'revystudy:sync-state';

let syncPromise: Promise<void> | null = null;

const CLOUD_CARD_UPDATE_FIELDS = new Set([
  'front', 'back', 'audio_id', 'card_type', 'dictation_answer', 'deck_id', 'flagged',
]);

function belongsInCloud(mutation: NewQueuedMutation): boolean {
  if (mutation.table === 'review_history') return false;
  if (mutation.table === 'cards' && mutation.action === 'update') {
    return Object.keys(mutation.payload).some((field) => CLOUD_CARD_UPDATE_FIELDS.has(field));
  }
  return true;
}

interface CompactedMutation { mutation: QueuedMutation; sourceIds: string[] }

function compactMutations(queued: QueuedMutation[]): CompactedMutation[] {
  const compacted = new Map<string, CompactedMutation>();
  for (const next of queued) {
    if (!belongsInCloud(next)) continue;
    const key = `${next.table}:${String(next.payload.id || next.id)}`;
    const previous = compacted.get(key);
    if (!previous) {
      compacted.set(key, { mutation: next, sourceIds: [next.id] });
      continue;
    }
    const sourceIds = [...previous.sourceIds, next.id];
    if (next.action === 'delete') {
      compacted.set(key, { mutation: { ...next, payload: { id: next.payload.id } }, sourceIds });
    } else if (next.action === 'insert' || previous.mutation.action === 'delete') {
      compacted.set(key, { mutation: next, sourceIds });
    } else {
      compacted.set(key, {
        mutation: {
          ...next,
          action: previous.mutation.action === 'insert' ? 'insert' : 'update',
          payload: { ...previous.mutation.payload, ...next.payload },
        },
        sourceIds,
      });
    }
  }
  return [...compacted.values()];
}

async function discardLocalOnlyMutations(queued: QueuedMutation[]): Promise<void> {
  const localOnly = queued.filter((mutation) => !belongsInCloud(mutation));
  await Promise.all(localOnly.map((mutation) => offlineQueue.remove(mutation.id)));
  if (localOnly.length) announceSyncState();
}

export function announceSyncState() {
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
  const failures: unknown[] = [];
  const failedEntities = new Set<string>();
  while (navigator.onLine) {
    const queued = await offlineQueue.getAll();
    await discardLocalOnlyMutations(queued);
    const mutations = compactMutations(queued);
    if (mutations.length === 0) break;
    announceSyncState();
    let removedThisRound = 0;

    for (let index = 0; index < mutations.length;) {
      const item = mutations[index];
      const mutation = item.mutation;
      const entityKey = `${mutation.table}:${String(mutation.payload.id || '')}`;
      if (failedEntities.has(entityKey)) { index += 1; continue; }
      try {
        const batch = [item];
        if (mutation.action === 'insert') {
          for (let next = index + 1; next < Math.min(mutations.length, index + 100); next += 1) {
            const candidate = mutations[next];
            if (candidate.mutation.action !== 'insert' || candidate.mutation.table !== mutation.table) break;
            batch.push(candidate);
          }
        }

        if (batch.length > 1) {
          const { error } = await supabase.from(mutation.table).upsert(batch.map(({ mutation: current }) => current.payload) as any);
          if (error) {
            // Find the specific invalid row instead of allowing one old item
            // to block every newer card in the durable outbox.
            for (const current of batch) {
              const key = `${current.mutation.table}:${String(current.mutation.payload.id || '')}`;
              try {
                await replayMutation(current.mutation);
                await Promise.all(current.sourceIds.map((id) => offlineQueue.remove(id)));
                removedThisRound += current.sourceIds.length;
              } catch (itemError) {
                failedEntities.add(key);
                failures.push(itemError);
                console.error(`[Sync] Failed to replay mutation ${current.mutation.id}:`, itemError);
              }
            }
            index += batch.length;
            announceSyncState();
            continue;
          }
        } else {
          await replayMutation(mutation);
        }
        const sourceIds = batch.flatMap((current) => current.sourceIds);
        await Promise.all(sourceIds.map((id) => offlineQueue.remove(id)));
        removedThisRound += sourceIds.length;
        index += batch.length;
        announceSyncState();
      } catch (err) {
        console.error(`[Sync] Failed to replay mutation ${mutation.id}:`, err);
        failedEntities.add(entityKey);
        failures.push(err);
        index += 1;
      }
    }
    if (removedThisRound === 0) break;
  }
  if (failures.length) throw failures[0];
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
  for (const mutation of mutations.filter(belongsInCloud)) await offlineQueue.add(mutation);
  announceSyncState();
  if (navigator.onLine) await syncOfflineQueue();
}

export async function getPendingMutationCount(): Promise<number> {
  return compactMutations(await offlineQueue.getAll()).length;
}

export async function cardHasPendingSync(cardId: string): Promise<boolean> {
  return (await offlineQueue.getAll()).some(mutation => mutation.table === 'cards' && mutation.payload.id === cardId);
}
