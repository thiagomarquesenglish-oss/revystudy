/**
 * IndexedDB wrapper for offline-first data persistence.
 * Stores local copies of decks, cards, review_history,
 * plus a mutation queue for syncing when back online.
 */

const DB_NAME = 'revystudy-offline';
const DB_VERSION = 4;

export interface DeckSyncState {
  deckId: string;
  contentUpdatedAt: string;
  syncedAt: string;
  cardCount?: number;
  audioCount?: number;
}

export interface QueuedMutation {
  id: string;
  table: 'decks' | 'cards' | 'review_history';
  action: 'insert' | 'update' | 'delete';
  payload: Record<string, any>;
  timestamp: number;
}

export type NewQueuedMutation = Omit<QueuedMutation, 'id' | 'timestamp'>;

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
      if (!db.objectStoreNames.contains('skill_schedules')) db.createObjectStore('skill_schedules', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('card_display_preferences')) db.createObjectStore('card_display_preferences', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('deck_sync_state')) db.createObjectStore('deck_sync_state', { keyPath: 'deckId' });
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => { req.result.close(); dbPromise = null; };
      resolve(req.result);
    };
    req.onblocked = () => { dbPromise = null; reject(new Error('Feche outras abas do RevyStudy e tente novamente para atualizar o armazenamento.')); };
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

async function getFromStore<T>(storeName: string, id: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(id);
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
  async commitDeckDeletion(deckId: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['decks', 'cards', 'deck_audios', 'deck_sync_state', 'queue'], 'readwrite');
      tx.objectStore('decks').delete(deckId);
      tx.objectStore('deck_sync_state').delete(deckId);
      for (const name of ['cards', 'deck_audios']) {
        const store = tx.objectStore(name);
        const request = store.index('deck_id').openKeyCursor(IDBKeyRange.only(deckId));
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { store.delete(cursor.primaryKey); cursor.continue(); }
        };
      }
      tx.objectStore('queue').put({ id: crypto.randomUUID(), table: 'decks', action: 'delete', payload: { id: deckId }, timestamp: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Não foi possível excluir o baralho neste aparelho'));
    });
  },
  async commitLearningBatch(rows: Record<string, unknown>[]): Promise<void> {
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['cards','queue'],'readwrite');
      try { rows.forEach((row,index)=>{
        tx.objectStore('cards').put(row);
        tx.objectStore('queue').put({id:crypto.randomUUID(),table:'cards',action:'insert',payload:row,timestamp:Date.now()+index});
      }); } catch(error) { tx.abort();reject(error);return; }
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Lote não salvo.'));
    });
  },
  async commitLearningReview(card: Record<string, unknown>, review: Record<string, unknown>, schedule?: Record<string, unknown>, expectedRevision?: string): Promise<void> {
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['cards','review_history','skill_schedules'],'readwrite');
      const write = () => {
        try {
          tx.objectStore('cards').put(card);tx.objectStore('review_history').put(review);
          if (schedule) tx.objectStore('skill_schedules').put(schedule);
        } catch(error) { tx.abort();reject(error); }
      };
      if (schedule && expectedRevision) {
        const request = tx.objectStore('skill_schedules').get(schedule.id as string);
        request.onsuccess = () => {
          if (request.result?.updated_at !== expectedRevision) {
            tx.abort(); reject(new Error('Este exercício já foi atualizado. Reabra o estudo.')); return;
          }
          write();
        };
      } else write();
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Revisão não salva.'));
    });
  },
  // Commit the visible change and its retry record together, without waiting for network.
  async commitCardMutation(mutation: NewQueuedMutation): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['cards', 'queue'], 'readwrite');
      if (mutation.action === 'delete') tx.objectStore('cards').delete(mutation.payload.id);
      else tx.objectStore('cards').put(mutation.payload);
      tx.objectStore('queue').put({ ...mutation, id: crypto.randomUUID(), timestamp: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Não foi possível salvar no aparelho'));
    });
  },
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
  getCard: (id: string) => getFromStore<any>('cards', id),
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
  getSkillSchedules: () => getAllFromStore<any>('skill_schedules'),
  getCardDisplayPreference: (id: string) => getFromStore<{id:string; hidden:boolean}>('card_display_preferences', id),
  saveCardDisplayPreference: (id: string, hidden: boolean) => putInStore('card_display_preferences', {id, hidden}),
  saveSkillSchedules: (rows: any[]) => bulkPut('skill_schedules', rows),
  async initializeSkillSchedules(rows: any[]): Promise<any[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('skill_schedules', 'readwrite');
      const store = tx.objectStore('skill_schedules');
      const result: any[] = [];
      for (const row of rows) {
        const request = store.get(row.id);
        request.onsuccess = () => {
          if (!request.result) store.add(row);
          result.push(request.result || row);
        };
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Agendamento não salvo.'));
    });
  },
  getReviewHistory: () => getAllFromStore<any>('review_history'),
  saveReview: (review: any) => putInStore('review_history', review),
  replaceReviewHistory: async (reviews: any[]) => {
    await clearStore('review_history');
    await bulkPut('review_history', reviews);
  },

  // A full restore must not keep an older downloaded package beside the
  // restored cloud snapshot. The next screen load rebuilds these stores from
  // the restored data.
  clearForFullRestore: async () => {
    for (const store of ['decks', 'cards', 'deck_audios', 'review_history', 'queue', 'deck_sync_state', 'skill_schedules']) {
      await clearStore(store);
    }
  },
};

// ── Mutation queue ──

export const offlineQueue = {
  async add(mutation: NewQueuedMutation): Promise<QueuedMutation> {
    const item: QueuedMutation = {
      ...mutation,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    await putInStore('queue', item);
    return item;
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
