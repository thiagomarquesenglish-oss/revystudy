import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';

it('persists deck removal and its cloud deletion across a fresh module load', async () => {
  const { localDB, offlineQueue } = await import('@/lib/offline-db');
  await localDB.saveDeck({ id: 'remove-me', name: 'Remove' });
  await localDB.saveDeck({ id: 'keep-me', name: 'Keep' });
  await localDB.saveCard({ id: 'removed-card', deck_id: 'remove-me' });
  await localDB.saveCard({ id: 'kept-card', deck_id: 'keep-me' });
  await localDB.replaceDeckAudios('remove-me', [{ id: 'audio', deck_id: 'remove-me' }]);
  await localDB.saveDeckSyncState({ deckId: 'remove-me', contentUpdatedAt: '', syncedAt: '' });
  await localDB.commitDeckDeletion('remove-me');
  vi.resetModules();
  const restarted = (await import('@/lib/offline-db')).localDB;
  expect((await restarted.getDecks()).map(d => d.id)).toEqual(['keep-me']);
  expect((await restarted.getCards()).map(c => c.id)).toEqual(['kept-card']);
  expect(await restarted.getDeckAudios('remove-me')).toEqual([]);
  expect(await restarted.getDeckSyncStates()).toEqual([]);
  expect(await offlineQueue.getAll()).toEqual(expect.arrayContaining([
    expect.objectContaining({ table: 'decks', action: 'delete', payload: { id: 'remove-me' } }),
  ]));
});
