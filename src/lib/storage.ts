import { supabase } from '@/integrations/supabase/client';
import { Deck, Flashcard, CardStatus } from './types';
import { localDB, offlineQueue } from './offline-db';
import { persistMutations, syncOfflineQueue, announceSyncState } from './sync';
import { processReview } from './srs';
import { exerciseInfo, type ExerciseMode } from './adaptive-study';
import type { Rating } from './types';
import { localStudyDate } from './streak';
import { cacheDeckMedia, offlineMediaEnabled } from './offline-media';

export async function getStreakHistory(): Promise<{date: string; count: number}[]> {
  const userId = await getCachedUserId();
  if (!userId) return [];
  const counts = new Map<string, number>();
  const rows = await localDB.getReviewHistory();
  for (const row of rows) {
    if (row.user_id !== userId || !row.reviewed_at) continue;
    const at = new Date(row.reviewed_at);
    if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now()) continue;
    const day = localStudyDate(at);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  return [...counts].map(([date,count]) => ({date,count}));
}
const deletedThisSession = new Set<string>();

async function withoutDeletedCards(rows: any[]): Promise<any[]> {
  const pending = await offlineQueue.getAll();
  const deleted = new Set([...deletedThisSession, ...pending.filter(m => m.table === 'cards' && m.action === 'delete').map(m => m.payload.id)]);
  return rows.filter(row => !deleted.has(row.id));
}
import { assertCompletePackage, cardIdsToFetch, changedContent, contentDelta, CARD_CONTENT_FIELDS, AUDIO_CONTENT_FIELDS, DeckManifestSnapshot, mergeDownloadedCardRows } from './deck-sync';

export interface DeckAudio {
  id: string;
  name: string;
  file_path: string;
  created_at: string;
  deck_id: string;
}

export interface DeckUpdate {
  deckId: string;
  name: string;
  description: string;
  createdAt: string;
  contentUpdatedAt: string;
  cardCount: number;
  audioCount: number;
  localCardCount: number;
  localAudioCount: number;
  cardChanges?: { added: number; edited: number; removed: number };
  audioChanges?: { added: number; edited: number; removed: number };
}

export interface PackageSyncProgress {
  completed: number;
  total: number;
  label: string;
}

// ── Cached user ID to avoid network calls ──
let _cachedUserId: string | null = null;

async function getCachedUserId(): Promise<string> {
  if (_cachedUserId) return _cachedUserId;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  _cachedUserId = user.id;
  return user.id;
}

// Listen for auth changes to keep cache in sync
supabase.auth.onAuthStateChange((_event, session) => {
  _cachedUserId = session?.user?.id ?? null;
});

// ── In-memory cache ──

interface Cache {
  decks: Deck[] | null;
  cards: Flashcard[] | null;
  reviewHistory: { date: string; count: number }[] | null;
  deckAudios: Record<string, DeckAudio[]>;
  _timestamps: Record<string, number>;
}

const cache: Cache = {
  decks: null,
  cards: null,
  reviewHistory: null,
  deckAudios: {},
  _timestamps: {},
};

const CACHE_TTL = 30_000;
const loadedDeckCardIds = new Set<string>();
const deckCardTimestamps: Record<string, number> = {};
let allCardsRequest: Promise<Flashcard[]> | null = null;
const deckCardsRequests = new Map<string, Promise<Flashcard[]>>();

function isFresh(key: string): boolean {
  const ts = cache._timestamps[key];
  return !!ts && Date.now() - ts < CACHE_TTL;
}

function touch(key: string) {
  cache._timestamps[key] = Date.now();
}

function sortCards(cards: Flashcard[]): Flashcard[] {
  return [...cards].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function resetDeckCardTracking() {
  loadedDeckCardIds.clear();
  Object.keys(deckCardTimestamps).forEach((deckId) => delete deckCardTimestamps[deckId]);
}

function touchDeckCards(deckId: string) {
  loadedDeckCardIds.add(deckId);
  deckCardTimestamps[deckId] = Date.now();
}

function isDeckCardsFresh(deckId: string): boolean {
  const ts = deckCardTimestamps[deckId];
  return !!ts && Date.now() - ts < CACHE_TTL;
}

function mergeDeckCardsIntoCache(deckId: string, cards: Flashcard[]) {
  const otherDeckCards = (cache.cards ?? []).filter(card => card.deckId !== deckId);
  cache.cards = sortCards([...otherDeckCards, ...cards]);
  touch('cards');
  touchDeckCards(deckId);
}

export function invalidateCache(key?: 'decks' | 'cards' | 'reviewHistory' | 'deckAudios') {
  if (key) {
    if (key === 'deckAudios') {
      cache.deckAudios = {};
    } else {
      cache[key] = null;
    }
    cache._timestamps[key] = 0;
    if (key === 'cards') {
      allCardsRequest = null;
      deckCardsRequests.clear();
      resetDeckCardTracking();
    }
  } else {
    cache.decks = null;
    cache.cards = null;
    cache.reviewHistory = null;
    cache.deckAudios = {};
    cache._timestamps = {};
    allCardsRequest = null;
    deckCardsRequests.clear();
    resetDeckCardTracking();
  }
}

function isOnline(): boolean {
  return navigator.onLine;
}

// ── Local-first mode ──
// Once a deck package has been downloaded to this device, it is served purely
// from IndexedDB. The cloud copy stays intact and is only consulted again when
// the user explicitly checks for updates (lightweight manifest) and downloads.

const installedDecks = new Set<string>();
let installedDecksPromise: Promise<void> | null = null;

async function ensureInstalledDecks(): Promise<void> {
  if (!installedDecksPromise) {
    installedDecksPromise = (async () => {
      try {
        const states = await localDB.getDeckSyncStates();
        states.forEach((state) => installedDecks.add(state.deckId));
      } catch (error) {
        console.error('Failed to read deck sync states:', error);
      }
    })();
  }
  return installedDecksPromise;
}

async function isDeckInstalled(deckId: string): Promise<boolean> {
  await ensureInstalledDecks();
  return installedDecks.has(deckId);
}

async function hasInstalledDecks(): Promise<boolean> {
  await ensureInstalledDecks();
  return installedDecks.size > 0;
}

/** Wrap a promise with a timeout so mobile fetches don't hang forever */
function withTimeout<T>(promise: Promise<T>, ms = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timeout')), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Fetch all rows from a table, paginating in chunks of 1000 to bypass default limit */
async function fetchAllCards(): Promise<any[]> {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase.from('cards').select('*').range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data || [];
    allData = allData.concat(rows);
    hasMore = rows.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allData;
}

async function fetchCardsPage(from: number, to: number, deckId?: string): Promise<any[]> {
  let query: any = supabase
    .from('cards')
    .select('*')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (deckId) query = query.eq('deck_id', deckId);

  const result = await withTimeout(Promise.resolve(query.range(from, to)), deckId ? 20_000 : 30_000);
  if (result.error) throw result.error;
  return result.data || [];
}

// ── Helpers to convert between DB rows and app types ──

function rowToDeck(row: any): Deck {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    createdAt: row.created_at,
    contentUpdatedAt: row.content_updated_at || row.created_at,
    cardCount: row.card_count || 0,
    audioCount: row.audio_count || 0,
  };
}

function rowToCard(row: any): Flashcard {
  return {
    id: row.id, front: row.front, back: row.back, deckId: row.deck_id,
    audioId: row.audio_id || null,
    dictationAnswer: row.dictation_answer || null,
    status: row.status as CardStatus, interval: row.interval, easeFactor: row.ease_factor,
    stepsIndex: row.steps_index, repetition: row.repetition, reviewCount: row.review_count,
    lapseCount: row.lapse_count, dueDate: row.due_date, createdAt: row.created_at, updatedAt: row.updated_at,
    progressUpdatedAt: row.progress_updated_at || row.updated_at || row.created_at,
    flagged: !!row.flagged,
    cardType: (row.card_type === 'typing' ? 'typing' : 'standard'),
  };
}

function deckToRow(d: Deck, userId: string): any {
  return { id: d.id, name: d.name, description: d.description, created_at: d.createdAt, user_id: userId };
}

function cardToRow(c: Flashcard, userId: string): any {
  return {
    id: c.id, front: c.front, back: c.back, deck_id: c.deckId, status: c.status,
    audio_id: c.audioId || null,
    dictation_answer: c.dictationAnswer?.trim() || null,
    interval: c.interval, ease_factor: c.easeFactor, steps_index: c.stepsIndex,
    repetition: c.repetition, review_count: c.reviewCount, lapse_count: c.lapseCount,
    due_date: c.dueDate, created_at: c.createdAt, updated_at: c.updatedAt, user_id: userId,
    progress_updated_at: c.progressUpdatedAt,
    flagged: !!c.flagged,
    card_type: c.cardType || 'standard',
  };
}

async function syncLocalDeckCards(deckId: string, rows: any[]): Promise<void> {
  await localDB.replaceCardsForDeck(deckId, rows);
}

// ── Decks ──

async function fetchDecksFromDB(): Promise<Deck[]> {
  const result = await withTimeout(
    Promise.resolve(supabase.from('decks').select('*').order('created_at', { ascending: true })),
    15_000
  );
  if (result.error) throw result.error;
  const data = result.data || [];
  const decks = data.map(rowToDeck);
  cache.decks = decks;
  touch('decks');
  localDB.replaceDecks(data).catch(console.error);
  return decks;
}

export async function getDecks(): Promise<Deck[]> {
  if (cache.decks !== null) {
    if (!isFresh('decks') && isOnline() && !(await hasInstalledDecks())) fetchDecksFromDB().catch(console.error);
    return cache.decks;
  }
  let localDecks: any[] = [];
  try {
    localDecks = await localDB.getDecks();
  } catch (e) {
    console.error('Failed to read local decks:', e);
  }

  if (localDecks.length > 0) {
    const decks = localDecks.map(rowToDeck);
    cache.decks = decks;
    touch('decks');
    if (isOnline() && !(await hasInstalledDecks())) fetchDecksFromDB().catch(console.error);
    return decks;
  }

  if (!isOnline()) return [];
  try {
    return await fetchDecksFromDB();
  } catch (e) {
    console.error('Failed to fetch decks from network:', e);
    return [];
  }
}

export async function addDeck(name: string, description: string): Promise<Deck> {
  const userId = await getCachedUserId();
  const now = new Date().toISOString();
  const deck: Deck = {
    id: crypto.randomUUID(), name, description, createdAt: now,
    contentUpdatedAt: now, cardCount: 0, audioCount: 0,
  };

  // Update cache immediately
  if (cache.decks) cache.decks.push(deck);
  touch('decks');

  // Persist locally and through the durable cloud outbox.
  const row = deckToRow(deck, userId);
  await localDB.saveDeck(row);
  await persistMutations([{ table: 'decks', action: 'insert', payload: row }]);

  return deck;
}

export async function saveDecks(id: string, updates: { name?: string; description?: string }): Promise<void> {
  // Update cache immediately
  if (cache.decks) {
    const idx = cache.decks.findIndex(d => d.id === id);
    if (idx >= 0) {
      if (updates.name !== undefined) cache.decks[idx].name = updates.name;
      if (updates.description !== undefined) cache.decks[idx].description = updates.description;
    }
  }

  const localDecks = await localDB.getDecks();
  const localDeck = localDecks.find((d: any) => d.id === id);
  if (localDeck) {
    Object.assign(localDeck, updates);
    await localDB.saveDeck(localDeck);
  }
  await persistMutations([{ table: 'decks', action: 'update', payload: { id, ...updates } }]);
}

export async function deleteDeck(deckId: string): Promise<void> {
  // Update cache immediately
  if (cache.decks) cache.decks = cache.decks.filter(d => d.id !== deckId);
  if (cache.cards) cache.cards = cache.cards.filter(c => c.deckId !== deckId);

  await persistMutations([{ table: 'decks', action: 'delete', payload: { id: deckId } }]);
  await localDB.replaceCardsForDeck(deckId, []);
  await localDB.replaceDeckAudios(deckId, []);
  await localDB.deleteDeck(deckId);
  await localDB.deleteDeckSyncState(deckId);
  installedDecks.delete(deckId);
}


// ── Cards ──

async function fetchCardsFromDB(): Promise<Flashcard[]> {
  if (allCardsRequest) return allCardsRequest;

  allCardsRequest = (async () => {
    const decks = await getDecks();

    if (decks.length > 0) {
      const allCards: Flashcard[] = [];

      for (const deck of decks) {
        if (await isDeckInstalled(deck.id)) {
          // Installed packages live on the device; never re-download them.
          const localRows = await localDB.getCardsByDeck(deck.id).catch(() => []);
          allCards.push(...localRows.map(rowToCard));
          touchDeckCards(deck.id);
          continue;
        }
        const deckCards = await fetchCardsByDeckFromDB(deck.id);
        allCards.push(...deckCards);
      }

      const cards = sortCards(allCards);
      cache.cards = cards;
      touch('cards');
      return cards;
    }

    const data = await withoutDeletedCards(await withTimeout(fetchAllCards(), 30_000));
    const cards = sortCards(data.map(rowToCard));
    cache.cards = cards;
    touch('cards');
    localDB.replaceCards(data).catch(console.error);
    resetDeckCardTracking();
    Array.from(new Set(cards.map((card) => card.deckId))).forEach(touchDeckCards);
    return cards;
  })();

  try {
    return await allCardsRequest;
  } finally {
    allCardsRequest = null;
  }
}

async function fetchCardsByDeckFromDB(deckId: string): Promise<Flashcard[]> {
  const existingRequest = deckCardsRequests.get(deckId);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const PAGE_SIZE = 1000;
    let from = 0;
    let allRows: any[] = [];

    while (true) {
      const rows = await fetchCardsPage(from, from + PAGE_SIZE - 1, deckId);
      allRows = allRows.concat(rows);
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const visibleRows = await withoutDeletedCards(allRows);
    const cards = sortCards(visibleRows.map(rowToCard));
    mergeDeckCardsIntoCache(deckId, cards);
    syncLocalDeckCards(deckId, visibleRows).catch(console.error);
    return cards;
  })();

  deckCardsRequests.set(deckId, request);

  try {
    return await request;
  } finally {
    deckCardsRequests.delete(deckId);
  }
}

/** Force-sync a deck's cards from the server, bypassing cache */
export async function forceSyncDeckCards(deckId: string): Promise<Flashcard[]> {
  // Clear cache for this deck
  loadedDeckCardIds.delete(deckId);
  delete deckCardTimestamps[deckId];
  if (cache.cards) {
    cache.cards = cache.cards.filter(c => c.deckId !== deckId);
  }
  return fetchCardsByDeckFromDB(deckId);
}

/** Compare changed manifests against local content; unchanged card bodies and media are not fetched. */
export async function checkDeckUpdates(): Promise<DeckUpdate[]> {
  if (!isOnline()) throw new Error('Você está offline');
  const result = await withTimeout(
    Promise.resolve(
      supabase
        .from('decks')
        .select('id,name,description,created_at,content_updated_at,card_count,audio_count')
        .order('created_at', { ascending: true })
    ),
    12_000,
  );
  if (result.error) throw result.error;

  const states = await localDB.getDeckSyncStates();
  const syncedStates = new Map(states.map((state) => [state.deckId, state]));
  const changed = (result.data || [])
    .filter((row) => {
      const state = syncedStates.get(row.id);
      return !state ||
        state.contentUpdatedAt !== row.content_updated_at ||
        state.cardCount !== row.card_count ||
        state.audioCount !== row.audio_count;
    });

  const updates = await Promise.all(changed.map(async (row) => {
    const snapshot = await fetchVerifiedDeckPackage(row.id);
    const { cardChanges, audioChanges, manifest } = snapshot;
    const count = (delta: typeof cardChanges) => delta.added + delta.edited + delta.removed;
    if (count(cardChanges) + count(audioChanges) === 0) return null;
    return {
      deckId: row.id, name: manifest.name, description: manifest.description || '',
      createdAt: manifest.created_at, contentUpdatedAt: manifest.content_updated_at,
      cardCount: manifest.card_count, audioCount: manifest.audio_count,
      localCardCount: snapshot.localRows.length, localAudioCount: snapshot.localAudios.length,
      cardChanges, audioChanges,
    };
  }));
  return updates.filter((update) => update !== null) as DeckUpdate[];

}

async function fetchDeckManifest(deckId: string): Promise<DeckManifestSnapshot> {
  const result = await withTimeout(
    Promise.resolve(
      supabase
        .from('decks')
        .select('id,name,description,created_at,content_updated_at,card_count,audio_count')
        .eq('id', deckId)
        .single(),
    ),
    15_000,
  );
  if (result.error) throw result.error;
  return result.data as DeckManifestSnapshot;
}

async function fetchVerifiedDeckPackage(
  deckId: string,
  onProgress?: (progress: PackageSyncProgress) => void,
) {
  const PAGE_SIZE = 20;
  let lastError: unknown = null;

  for (let packageAttempt = 0; packageAttempt < 3; packageAttempt += 1) {
    try {
      const manifestBefore = await fetchDeckManifest(deckId);
      const localRows = await localDB.getCardsByDeck(deckId);
      const localAudios = await localDB.getDeckAudios(deckId);
      const metadata: any[] = [];
      for (let from = 0; ; from += 1000) {
        const page = await withTimeout(Promise.resolve(supabase.from('cards')
          .select('id,updated_at').eq('deck_id', deckId).order('id').range(from, from + 999)), 20_000);
        if (page.error) throw page.error;
        metadata.push(...(page.data || []));
        if ((page.data || []).length < 1000) break;
      }
      const neededIds = cardIdsToFetch(metadata, localRows);
      const fetched = new Map<string, any>();
      const localById = new Map(localRows.map((row: any) => [row.id, row]));
      const totalSteps = Math.ceil(neededIds.length / PAGE_SIZE) + 2;
      for (let from = 0; from < neededIds.length; from += PAGE_SIZE) {
        onProgress?.({ completed: from / PAGE_SIZE, total: totalSteps, label: 'Buscando cartões novos ou alterados' });
        const page = await withTimeout(Promise.resolve(supabase.from('cards').select('*')
          .eq('deck_id', deckId).in('id', neededIds.slice(from, from + PAGE_SIZE))), 20_000);
        if (page.error) throw page.error;
        for (const row of page.data || []) fetched.set(row.id, row);
      }
      const rows = metadata.map(meta => fetched.get(meta.id) || localById.get(meta.id));
      if (rows.some(row => !row)) throw new Error('Cartões mudaram durante a verificação');

      onProgress?.({ completed: totalSteps - 2, total: totalSteps, label: 'Baixando lista de áudios' });
      const audios = await withTimeout(
        Promise.resolve(
          supabase
            .from('deck_audios')
            .select('*')
            .eq('deck_id', deckId)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true }),
        ),
        20_000,
      );
      if (audios.error) throw audios.error;

      onProgress?.({ completed: totalSteps - 1, total: totalSteps, label: 'Verificando integridade' });
      const manifestAfter = await fetchDeckManifest(deckId);
      assertCompletePackage(manifestBefore, manifestAfter, rows, (audios.data || []) as any[]);
      return { manifest: manifestAfter, rows, audios: (audios.data || []) as any[], totalSteps,
        localRows, localAudios,
        cardChanges: contentDelta(rows, localRows, CARD_CONTENT_FIELDS),
        audioChanges: contentDelta((audios.data || []) as any[], localAudios, AUDIO_CONTENT_FIELDS),
      };
    } catch (error) {
      lastError = error;
      if (packageAttempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 900 * (packageAttempt + 1)));
    }
  }

  throw lastError instanceof Error
    ? new Error(`Não foi possível baixar o baralho completo. Nada foi substituído no celular. ${lastError.message}`)
    : new Error('Não foi possível baixar o baralho completo. Nada foi substituído no celular.');
}

/** Fetches only changed card bodies and installs the verified content difference. */
export async function downloadDeckPackage(
  update: DeckUpdate,
  onProgress?: (progress: PackageSyncProgress) => void,
): Promise<Flashcard[]> {
  if (!isOnline()) throw new Error('Você está offline');
  // Best-effort upload first, but never hold a cloud download hostage to a
  // stale outbox entry. The package merge below preserves newer local study
  // progress, while the durable queue remains available for a later retry.
  await syncOfflineQueue();

  const { manifest, rows: remoteRows, audios, totalSteps, localRows, cardChanges } = await fetchVerifiedDeckPackage(update.deckId, onProgress);
  const localById = new Map(localRows.map((row: any) => [row.id, row]));
  const contentRows = remoteRows.map((remote: any) => {
    const local = localById.get(remote.id);
    return local && !changedContent(remote, local, CARD_CONTENT_FIELDS) ? local : remote;
  });
  const { rows } = mergeDownloadedCardRows(contentRows, localRows);
  const hasCardChanges = cardChanges.added + cardChanges.edited + cardChanges.removed > 0;

  await Promise.all([
    hasCardChanges ? syncLocalDeckCards(update.deckId, rows) : Promise.resolve(),
    localDB.replaceDeckAudios(update.deckId, audios),
    localDB.saveDeck({
      id: update.deckId,
      name: manifest.name,
      description: manifest.description || '',
      created_at: manifest.created_at,
      content_updated_at: manifest.content_updated_at,
      card_count: manifest.card_count,
      audio_count: manifest.audio_count,
    }),
  ]);
  const downloadedDeck: Deck = {
    id: update.deckId,
    name: manifest.name,
    description: manifest.description || '',
    createdAt: manifest.created_at,
    contentUpdatedAt: manifest.content_updated_at,
    cardCount: manifest.card_count,
    audioCount: manifest.audio_count,
  };
  cache.decks = cache.decks
    ? [...cache.decks.filter((deck) => deck.id !== update.deckId), downloadedDeck]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [downloadedDeck];
  touch('decks');
  cache.deckAudios[update.deckId] = audios as DeckAudio[];
  touch(`deckAudios:${update.deckId}`);

  const cards = sortCards(rows.map(rowToCard));
  mergeDeckCardsIntoCache(update.deckId, cards);
  await localDB.saveDeckSyncState({
    deckId: update.deckId,
    contentUpdatedAt: manifest.content_updated_at,
    syncedAt: new Date().toISOString(),
    cardCount: manifest.card_count,
    audioCount: manifest.audio_count,
  });
  await ensureInstalledDecks();
  installedDecks.add(update.deckId);
  if (offlineMediaEnabled()) {
    try {
      await cacheDeckMedia(rows, audios, onProgress);
    } catch (error) {
      // The verified cards stay installed even if a flaky connection prevents
      // one media file from being cached. Settings can resume the download.
      console.error('Could not cache all deck media:', error);
    }
  }
  onProgress?.({ completed: totalSteps, total: totalSteps, label: 'Novidades instaladas; cartões existentes preservados' });
  return cards;
}

export async function getLocalDeckCounts(): Promise<Record<string, { new: number; learning: number; review: number }>> {
  const rows = await localDB.getCards();
  const now = new Date().toISOString();
  const counts: Record<string, { new: number; learning: number; review: number }> = {};
  rows.forEach((row: any) => {
    const deckId = row.deck_id;
    const current = counts[deckId] || { new: 0, learning: 0, review: 0 };
    if (row.status === 'new') current.new += 1;
    else if ((row.status === 'learning' || row.status === 'relearning') && row.due_date <= now) current.learning += 1;
    else if (row.status === 'review' && row.due_date <= now) current.review += 1;
    counts[deckId] = current;
  });
  return counts;
}

export async function getCards(): Promise<Flashcard[]> {
  const localOnly = await hasInstalledDecks();
  if (cache.cards !== null) {
    if (!localOnly && !isFresh('cards') && isOnline()) fetchCardsFromDB().catch(console.error);
    return cache.cards;
  }
  // Always try local first for instant rendering
  let localCards: any[] = [];
  try {
    localCards = await localDB.getCards();
    const localDecks = await localDB.getDecks();
    const validDeckIds = new Set(localDecks.map((deck: any) => deck.id));
    const orphanedCards = localCards.filter((card: any) => !validDeckIds.has(card.deck_id));
    if (orphanedCards.length > 0) {
      await Promise.allSettled(orphanedCards.map((card: any) => localDB.deleteCard(card.id)));
      localCards = localCards.filter((card: any) => validDeckIds.has(card.deck_id));
    }
  } catch (e) {
    console.error('Failed to read local cards:', e);
  }

  if (localCards.length > 0) {
    const cards = localCards.map(rowToCard);
    cache.cards = cards;
    touch('cards');
    // Refresh from network in background
    if (!localOnly && isOnline()) fetchCardsFromDB().catch(console.error);
    return cards;
  }

  if (localOnly || !isOnline()) return [];

  // Network fetch with fallback to empty on timeout
  try {
    return await fetchCardsFromDB();
  } catch (e) {
    console.error('Failed to fetch cards from network:', e);
    return [];
  }
}

/** Local lightweight copies for the card panel; embedded media bytes are omitted. */
export async function getLocalCardSummaries(): Promise<Flashcard[]> {
  try {
    const rows = await withoutDeletedCards(await localDB.getCardSummaries());
    return rows.map(rowToCard);
  } catch (error) {
    console.error('Failed to read local card summaries:', error);
    return [];
  }
}

export async function getLocalCardThumbnail(cardId: string): Promise<string | null> {
  const row = await localDB.getCard(cardId);
  const html = `${row?.front || ''}${row?.back || ''}`;
  const match = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return match && /^(?:data:image\/|blob:|https?:\/\/)/i.test(match[1]) ? match[1] : null;
}

export async function getCardsByDeck(deckId: string): Promise<Flashcard[]> {
  const localOnly = await isDeckInstalled(deckId);

  if (cache.cards !== null && loadedDeckCardIds.has(deckId)) {
    const cachedDeckCards = await withoutDeletedCards(cache.cards.filter(card => card.deckId === deckId));
    if (!localOnly && !isDeckCardsFresh(deckId) && isOnline()) fetchCardsByDeckFromDB(deckId).catch(console.error);
    return cachedDeckCards as Flashcard[];
  }

  let localCards: any[] = [];
  try {
    localCards = await localDB.getCardsByDeck(deckId);
  } catch (e) {
    console.error(`Failed to read local cards for deck ${deckId}:`, e);
  }

  if (localCards.length > 0) {
    const visibleRows = await withoutDeletedCards(localCards);
    const cards = sortCards(visibleRows.map(rowToCard));
    mergeDeckCardsIntoCache(deckId, cards);
    if (!localOnly && isOnline()) fetchCardsByDeckFromDB(deckId).catch(console.error);
    return cards;
  }

  if (localOnly || !isOnline()) return [];

  try {
    return await fetchCardsByDeckFromDB(deckId);
  } catch (e) {
    console.error(`Failed to fetch cards from network for deck ${deckId}:`, e);
    return [];
  }
}

export async function getCardById(cardId: string): Promise<Flashcard | null> {
  const cards = await getCards();
  return cards.find(c => c.id === cardId) || null;
}

export async function getDueCards(deckId: string): Promise<Flashcard[]> {
  const now = new Date().toISOString();
  const cards = await getCardsByDeck(deckId);
  return cards.filter(c => c.status === 'new' || c.dueDate <= now);
}

export async function getNewCards(deckId: string): Promise<Flashcard[]> {
  const cards = await getCardsByDeck(deckId);
  return cards.filter(c => c.status === 'new');
}

export async function getLearningCards(deckId: string): Promise<Flashcard[]> {
  const now = new Date().toISOString();
  const cards = await getCardsByDeck(deckId);
  return cards.filter(c => (c.status === 'learning' || c.status === 'relearning') && c.dueDate <= now);
}

export async function getReviewCards(deckId: string): Promise<Flashcard[]> {
  const now = new Date().toISOString();
  const cards = await getCardsByDeck(deckId);
  return cards.filter(c => c.status === 'review' && c.dueDate <= now);
}

export async function getStudyQueue(deckId: string): Promise<Flashcard[]> {
  const cards = await getCardsByDeck(deckId);
  const now = new Date().toISOString();
  const learning = cards.filter(c => (c.status === 'learning' || c.status === 'relearning') && c.dueDate <= now);
  const review = cards.filter(c => c.status === 'review' && c.dueDate <= now);
  const newCards = cards.filter(c => c.status === 'new');
  return [...learning, ...review, ...newCards];
}

export async function addCard(deckId: string, front: string, back: string, audioId?: string | null, cardType: 'standard' | 'typing' = 'standard', dictationAnswer?: string): Promise<Flashcard> {
  const userId = await getCachedUserId();
  const now = new Date().toISOString();
  const card: Flashcard = {
    id: crypto.randomUUID(), front, back, deckId, audioId: audioId || null, status: 'new',
    interval: 0, easeFactor: 2.5, stepsIndex: 0, repetition: 0,
    reviewCount: 0, lapseCount: 0, dueDate: now, createdAt: now, updatedAt: now,
    progressUpdatedAt: now, flagged: false, cardType,
    dictationAnswer: dictationAnswer?.trim() || null,
  };

  // Persist locally and through the durable cloud outbox.
  const row = cardToRow(card, userId);
  await localDB.commitCardMutation({ table: 'cards', action: 'insert', payload: row });
  if (cache.cards) cache.cards.push(card);
  touch('cards');
  touchDeckCards(deckId);
  announceSyncState();
  if (isOnline()) void syncOfflineQueue().catch(console.error);

  return card;
}

export async function addCardsBulk(
  deckId: string,
  items: Array<{ front: string; back: string }>,
): Promise<Flashcard[]> {
  const userId = await getCachedUserId();
  const cards = items.map(({ front, back }, index) => {
    const timestamp = new Date(Date.now() + index).toISOString();
    return {
      id: crypto.randomUUID(), front, back, deckId, audioId: null, status: 'new' as const,
      interval: 0, easeFactor: 2.5, stepsIndex: 0, repetition: 0,
      reviewCount: 0, lapseCount: 0, dueDate: timestamp, createdAt: timestamp,
      updatedAt: timestamp, progressUpdatedAt: timestamp, flagged: false, cardType: 'standard' as const,
    };
  });
  const rows = cards.map((card) => cardToRow(card, userId));

  if (cache.cards) cache.cards.push(...cards);
  touch('cards');
  touchDeckCards(deckId);
  await Promise.all(rows.map((row) => localDB.saveCard(row)));
  await persistMutations(rows.map((row) => ({ table: 'cards' as const, action: 'insert' as const, payload: row })));
  return cards;
}

export interface ImportedCardData {
  dictationAnswer?: string | null;
  front: string;
  back: string;
  audioId?: string | null;
  status?: CardStatus;
  interval?: number;
  easeFactor?: number;
  stepsIndex?: number;
  repetition?: number;
  reviewCount?: number;
  lapseCount?: number;
  dueDate?: string;
  flagged?: boolean;
  cardType?: 'standard' | 'typing';
}

/**
 * Imports cards without resetting their spaced-repetition state. Regular bulk
 * creation intentionally starts cards as new; backup imports need the original
 * counters and scheduling fields to survive the move between installations.
 */
export async function addCardsWithProgressBulk(
  deckId: string,
  items: ImportedCardData[],
): Promise<Flashcard[]> {
  const userId = await getCachedUserId();
  const cards = items.map((item, index) => {
    const timestamp = new Date(Date.now() + index).toISOString();
    return {
      id: crypto.randomUUID(),
      front: item.front,
      back: item.back,
      deckId,
      audioId: item.audioId || null,
      dictationAnswer: item.dictationAnswer?.trim() || null,
      status: item.status || 'new',
      interval: item.interval ?? 0,
      easeFactor: item.easeFactor ?? 2.5,
      stepsIndex: item.stepsIndex ?? 0,
      repetition: item.repetition ?? 0,
      reviewCount: item.reviewCount ?? 0,
      lapseCount: item.lapseCount ?? 0,
      dueDate: item.dueDate || timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      progressUpdatedAt: timestamp,
      flagged: item.flagged ?? false,
      cardType: item.cardType || 'standard',
    } satisfies Flashcard;
  });
  const rows = cards.map((card) => cardToRow(card, userId));

  if (cache.cards) cache.cards.push(...cards);
  touch('cards');
  touchDeckCards(deckId);
  await Promise.all(rows.map((row) => localDB.saveCard(row)));
  await persistMutations(rows.map((row) => ({ table: 'cards' as const, action: 'insert' as const, payload: row })));
  return cards;
}

export async function updateCard(id: string, updates: Partial<Flashcard>): Promise<void> {
  const dbUpdates: Record<string, any> = {};
  if (updates.front !== undefined) dbUpdates.front = updates.front;
  if (updates.back !== undefined) dbUpdates.back = updates.back;
  if (updates.dictationAnswer !== undefined) dbUpdates.dictation_answer = updates.dictationAnswer?.trim() || null;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.interval !== undefined) dbUpdates.interval = updates.interval;
  if (updates.easeFactor !== undefined) dbUpdates.ease_factor = updates.easeFactor;
  if (updates.stepsIndex !== undefined) dbUpdates.steps_index = updates.stepsIndex;
  if (updates.repetition !== undefined) dbUpdates.repetition = updates.repetition;
  if (updates.reviewCount !== undefined) dbUpdates.review_count = updates.reviewCount;
  if (updates.lapseCount !== undefined) dbUpdates.lapse_count = updates.lapseCount;
  if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
  if (updates.deckId !== undefined) dbUpdates.deck_id = updates.deckId;
  if (updates.audioId !== undefined) dbUpdates.audio_id = updates.audioId;
  if (updates.flagged !== undefined) dbUpdates.flagged = updates.flagged;
  const progressChanged = [
    updates.status, updates.interval, updates.easeFactor, updates.stepsIndex,
    updates.repetition, updates.reviewCount, updates.lapseCount, updates.dueDate,
    updates.flagged,
  ].some((value) => value !== undefined);
  const now = new Date().toISOString();
  dbUpdates.updated_at = now;
  if (progressChanged) dbUpdates.progress_updated_at = now;

  // Update cache immediately
  if (cache.cards) {
    const idx = cache.cards.findIndex(c => c.id === id);
    if (idx >= 0) {
      const previousDeckId = cache.cards[idx].deckId;
      cache.cards[idx] = {
        ...cache.cards[idx],
        ...updates,
        updatedAt: now,
        ...(progressChanged ? { progressUpdatedAt: now } : {}),
      };
      touchDeckCards(previousDeckId);
      touchDeckCards(cache.cards[idx].deckId);
    }
  }

  const localCards = await localDB.getCards();
  const localCard = localCards.find((c: any) => c.id === id);
  if (localCard) {
    Object.assign(localCard, dbUpdates);
    await localDB.saveCard(localCard);
  }
  await persistMutations([{ table: 'cards', action: 'update', payload: { id, ...dbUpdates } }]);
}

export async function deleteCard(cardId: string): Promise<void> {
  await localDB.commitCardMutation({ table: 'cards', action: 'delete', payload: { id: cardId } });
  deletedThisSession.add(cardId);
  // Update cache immediately
  const deletedCard = cache.cards?.find(c => c.id === cardId) || null;
  if (cache.cards) cache.cards = cache.cards.filter(c => c.id !== cardId);
  if (deletedCard) touchDeckCards(deletedCard.deckId);
  // Cascade: invalidate review history cache since DB cascade deletes related reviews
  invalidateCache('reviewHistory');

  announceSyncState();
  if (isOnline()) void syncOfflineQueue().catch(console.error);
}

// ── Review History ──

export async function addReviewHistory(cardId: string, rating: string, adaptive?: {skill:string;exerciseMode:string}): Promise<void> {
  const userId = await getCachedUserId();

  const row = { id: crypto.randomUUID(), card_id: cardId, rating, user_id: userId, reviewed_at: new Date().toISOString(),skill:adaptive?.skill||null,exercise_mode:adaptive?.exerciseMode||null };

  // Invalidate cache immediately
  invalidateCache('reviewHistory');

  await localDB.saveReview(row);
}

/** A reviewed AI batch and its outbox are all-or-nothing on this device. */
export async function importLearningCards(deckId:string,items:Array<{front:string;back:string;english:string}>):Promise<void>{
  const userId=await getCachedUserId();
  const cards:Flashcard[]=items.map(item=>{
    const now=new Date().toISOString();
    return {id:crypto.randomUUID(),front:item.front,back:item.back,dictationAnswer:item.english,deckId,audioId:null,status:'new',interval:0,easeFactor:2.5,stepsIndex:0,repetition:0,reviewCount:0,lapseCount:0,dueDate:now,createdAt:now,updatedAt:now,progressUpdatedAt:now,flagged:false,cardType:'standard'};
  });
  await localDB.commitLearningBatch(cards.map(c=>cardToRow(c,userId)));
  invalidateCache('cards');announceSyncState();
  if(isOnline())void syncOfflineQueue().catch(console.error);
}

/** Persist schedule and the actual modality before moving to another exercise. */
export async function saveLearningReview(card:Flashcard,rating:Rating,mode?:ExerciseMode):Promise<Flashcard>{
  const userId=await getCachedUserId(),now=new Date().toISOString();
  const updated={...card,...processReview(card,rating),updatedAt:now,progressUpdatedAt:now};
  const review={id:crypto.randomUUID(),card_id:card.id,user_id:userId,rating,reviewed_at:now,skill:mode?exerciseInfo[mode].skill:null,exercise_mode:mode||null};
  const row=cardToRow(updated,userId);
  await localDB.commitLearningReview(row,review);
  if(cache.cards)cache.cards=cache.cards.map(c=>c.id===card.id?updated:c);
  invalidateCache('reviewHistory');
  return updated;
}

export interface CardReviewRow { id:string;card_id:string;rating:string;user_id:string;reviewed_at:string;skill:string|null;exercise_mode:string|null }

export async function getCardReviewRows(cardId: string): Promise<CardReviewRow[]> {
  return (await localDB.getReviewHistory() as CardReviewRow[]).filter(row => row.card_id === cardId);
}

function aggregateReviewHistory(rows: any[]): { date: string; count: number }[] {
  const countMap: Record<string, number> = {};
  rows.forEach((r: any) => {
    const date = (r.reviewed_at || '').slice(0, 10);
    if (date) countMap[date] = (countMap[date] || 0) + 1;
  });
  return Object.entries(countMap).map(([date, count]) => ({ date, count }));
}

export async function getReviewHistory(): Promise<{ date: string; count: number }[]> {
  if (cache.reviewHistory !== null) return cache.reviewHistory;
  try {
    const local = await localDB.getReviewHistory();
    const result = aggregateReviewHistory(local);
    cache.reviewHistory = result;
    touch('reviewHistory');
    return result;
  } catch (e) {
    console.error('Failed to read local review history:', e);
    return [];
  }
}

export function getCachedReviewHistory(): { date: string; count: number }[] | null {
  return cache.reviewHistory;
}

export async function getReviewHistoryToday(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const local = await localDB.getReviewHistory();
  return local.filter((r: any) => (r.reviewed_at || '').startsWith(today)).length;
}

// ── Deck Audios (cached) ──

async function fetchDeckAudiosFromDB(deckId: string): Promise<DeckAudio[]> {
  const { data, error } = await supabase
    .from('deck_audios')
    .select('*')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const audios = (data || []) as DeckAudio[];
  cache.deckAudios[deckId] = audios;
  touch(`deckAudios:${deckId}`);
  localDB.replaceDeckAudios(deckId, audios).catch(console.error);
  return audios;
}

export async function getDeckAudios(deckId: string): Promise<DeckAudio[]> {
  const cacheKey = `deckAudios:${deckId}`;
  const localOnly = await isDeckInstalled(deckId);
  if (cache.deckAudios[deckId]) {
    if (!localOnly && !isFresh(cacheKey) && isOnline()) fetchDeckAudiosFromDB(deckId).catch(console.error);
    return cache.deckAudios[deckId];
  }
  try {
    const localAudios = await localDB.getDeckAudios(deckId) as DeckAudio[];
    if (localAudios.length > 0) {
      cache.deckAudios[deckId] = localAudios;
      touch(cacheKey);
      if (!localOnly && isOnline()) fetchDeckAudiosFromDB(deckId).catch(console.error);
      return localAudios;
    }
  } catch (error) {
    console.error('Failed to read local deck audios:', error);
  }
  if (localOnly || !isOnline()) return [];
  return fetchDeckAudiosFromDB(deckId);
}

export function invalidateDeckAudios(deckId: string) {
  delete cache.deckAudios[deckId];
  cache._timestamps[`deckAudios:${deckId}`] = 0;
}

// ── Reset Deck (keep cards, reset SRS only) ──

export async function resetDeck(deckId: string): Promise<void> {
  const now = new Date().toISOString();
  const resetFields = {
    status: 'new',
    interval: 0,
    ease_factor: 2.5,
    steps_index: 0,
    repetition: 0,
    review_count: 0,
    lapse_count: 0,
    due_date: now,
    updated_at: now,
    progress_updated_at: now,
  };

  // Update cache immediately
  if (cache.cards) {
    cache.cards = cache.cards.map(c => c.deckId === deckId ? {
      ...c, status: 'new' as CardStatus, interval: 0, easeFactor: 2.5,
      stepsIndex: 0, repetition: 0, reviewCount: 0, lapseCount: 0,
      dueDate: now, updatedAt: now, progressUpdatedAt: now,
    } : c);
  }

  const localRows = await localDB.getCardsByDeck(deckId);
  const updatedRows = localRows.map((row) => ({ ...row, ...resetFields }));
  await localDB.replaceCardsForDeck(deckId, updatedRows);
}
