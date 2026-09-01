/**
 * IndexedDB wrapper for offline-first data persistence.
 * Stores local copies of decks, cards, review_history,
 * plus a mutation queue for syncing when back online.
 */

const DB_NAME = 'revystudy-offline';
const DB_VERSION = 2;

export interface DeckSyncState {
  deckId: string;
  contentUpdatedAt: string;
  syncedAt: string;
}

export interface QueuedMutation {
  id: string;
  table: 'decks' | 'cards' | 'review_history';
  action: 'insert' | 'update' | 'delete';
  payload: Record<string, any>;
  timestamp: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'id' });
      const cardsStore = db.objectStoreNames.contains('cards')
        ? req.transaction?.objectStore('cards')
        : db.createObjectStore('cards', { keyPath: 'id' });
      if (cardsStore && !cardsStore.indexNames.contains('deck_id')) cardsStore.createIndex('deck_id', 'deck_id');
      const audiosStore = db.objectStoreNames.contains('deck_audios')
        ? req.transaction?.objectStore('deck_audios')
        : db.createObjectStore('deck_audios', { keyPath: 'id' });
      if (audiosStore && !audiosStore.indexNames.contains('deck_id')) audiosStore.createIndex('deck_id', 'deck_id');
      if (!db.objectStoreNames.contains('review_history')) db.createObjectStore('review_history', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('deck_sync_state')) db.createObjectStore('deck_sync_state', { keyPath: 'deckId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// ── Generic helpers ──

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putInStore(storeName: string, item: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFromStore(storeName: string, id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function bulkPut(storeName: string, items: any[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllByDeck(storeName: string, deckId: string): Promise<any[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).index('deck_id').getAll(deckId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function removeEmbeddedMediaPayload(html: unknown): string {
  if (typeof html !== 'string') return '';
  return html
    .replace(/\s(?:src|data-src)=(['"])data:[\s\S]*?\1/gi, ' src=""')
    .replace(/\s(?:src|data-src)=data:[^\s>]+/gi, ' src=""');
}

async function getCardSummaries(): Promise<any[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const summaries: any[] = [];
    const tx = db.transaction('cards', 'readonly');
    const request = tx.objectStore('cards').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(summaries);
        return;
      }
      const row = cursor.value;
      summaries.push({
        ...row,
        front: removeEmbeddedMediaPayload(row.front),
        back: removeEmbeddedMediaPayload(row.back),
      });
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

async function replaceAllByDeck(storeName: string, deckId: string, items: any[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const cursorRequest = store.index('deck_id').openKeyCursor(IDBKeyRange.only(deckId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
        return;
      }
      items.forEach((item) => store.put(item));
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Local cache (mirrors Supabase data locally) ──

export const localDB = {
  // Decks
  getDecks: () => getAllFromStore<any>('decks'),
  saveDeck: (deck: any) => putInStore('decks', deck),
  deleteDeck: (id: string) => deleteFromStore('decks', id),
  replaceDecks: async (decks: any[]) => {
    await clearStore('decks');
    await bulkPut('decks', decks);
  },

  // Cards
  getCards: () => getAllFromStore<any>('cards'),
  getCardSummaries,
  saveCard: (card: any) => putInStore('cards', card),
  deleteCard: (id: string) => deleteFromStore('cards', id),
  replaceCards: async (cards: any[]) => {
    await clearStore('cards');
    await bulkPut('cards', cards);
  },
  getCardsByDeck: (deckId: string) => getAllByDeck('cards', deckId),
  replaceCardsForDeck: (deckId: string, cards: any[]) => replaceAllByDeck('cards', deckId, cards),

  // Audio metadata (the media file itself remains streamed on demand)
  getDeckAudios: (deckId: string) => getAllByDeck('deck_audios', deckId),
  replaceDeckAudios: (deckId: string, audios: any[]) => replaceAllByDeck('deck_audios', deckId, audios),

  // Downloaded package versions
  getDeckSyncStates: () => getAllFromStore<DeckSyncState>('deck_sync_state'),
  saveDeckSyncState: (state: DeckSyncState) => putInStore('deck_sync_state', state),
  deleteDeckSyncState: (deckId: string) => deleteFromStore('deck_sync_state', deckId),

  // Review history
  getReviewHistory: () => getAllFromStore<any>('review_history'),
  saveReview: (review: any) => putInStore('review_history', review),
  replaceReviewHistory: async (reviews: any[]) => {
    await clearStore('review_history');
    await bulkPut('review_history', reviews);
  },
};

// ── Mutation queue ──

export const offlineQueue = {
  async add(mutation: Omit<QueuedMutation, 'id' | 'timestamp'>): Promise<void> {
    const item: QueuedMutation = {
      ...mutation,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    await putInStore('queue', item);
  },

  async getAll(): Promise<QueuedMutation[]> {
    const items = await getAllFromStore<QueuedMutation>('queue');
    return items.sort((a, b) => a.timestamp - b.timestamp);
  },

  async remove(id: string): Promise<void> {
    await deleteFromStore('queue', id);
  },

  async clear(): Promise<void> {
    await clearStore('queue');
  },

  async count(): Promise<number> {
    const items = await getAllFromStore<QueuedMutation>('queue');
    return items.length;
  },
};
