/**
 * Sync engine: replays queued offline mutations against Supabase.
 */
import { supabase } from '@/integrations/supabase/client';
import { offlineQueue, QueuedMutation } from './offline-db';
import { invalidateCache } from './storage';

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

export async function syncOfflineQueue(): Promise<void> {
  const mutations = await offlineQueue.getAll();
  if (mutations.length === 0) return;

  console.log(`[Sync] Replaying ${mutations.length} queued mutations…`);

  for (const m of mutations) {
    try {
      await replayMutation(m);
      await offlineQueue.remove(m.id);
    } catch (err) {
      console.error(`[Sync] Failed to replay mutation ${m.id}:`, err);
      // Stop on first failure to preserve order
      break;
    }
  }

  // Invalidate in-memory cache so next reads fetch fresh data
  invalidateCache();
}
