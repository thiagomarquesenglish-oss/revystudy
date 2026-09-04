import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ commit: vi.fn().mockResolvedValue(undefined), sync: vi.fn(() => new Promise(() => {})), queue: vi.fn().mockResolvedValue([]) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { onAuthStateChange: vi.fn() } } }));
vi.mock('@/lib/offline-db', () => ({ localDB: { commitCardMutation: mocks.commit, getCardSummaries: async () => [{ id: 'deleted' }, { id: 'retained' }] }, offlineQueue: { getAll: mocks.queue } }));
vi.mock('@/lib/sync', () => ({ persistMutations: vi.fn(), syncOfflineQueue: mocks.sync, announceSyncState: vi.fn() }));
import { deleteCard, getLocalCardSummaries } from '@/lib/storage';

it('removes locally without waiting for the cloud and hides stale copies', async () => {
  await deleteCard('deleted');
  expect(mocks.commit).toHaveBeenCalledWith({ table: 'cards', action: 'delete', payload: { id: 'deleted' } });
  expect((await getLocalCardSummaries()).map(card => card.id)).toEqual(['retained']);
});
it('hides deletions still queued after a reload', async () => {
  mocks.queue.mockResolvedValue([{ table: 'cards', action: 'delete', payload: { id: 'retained' } }]);
  expect(await getLocalCardSummaries()).toEqual([]);
});
