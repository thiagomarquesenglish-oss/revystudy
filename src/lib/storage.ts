import { supabase } from '@/integrations/supabase/client';
import { Deck, Flashcard, CardStatus } from './types';
import { localDB, offlineQueue } from './offline-db';
import { persistMutations, syncOfflineQueue } from './sync';
import { assertCompletePackage, DeckManifestSnapshot, mergeDownloadedCardRows, PROGRESS_FIELDS } from './deck-sync';

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

    const data = await withTimeout(fetchAllCards(), 30_000);
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

    const cards = sortCards(allRows.map(rowToCard));
    mergeDeckCardsIntoCache(deckId, cards);
    syncLocalDeckCards(deckId, allRows).catch(console.error);
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

/** Lightweight manifest check: no card bodies or media are downloaded. */
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

  return Promise.all(changed.map(async (row) => ({
      deckId: row.id,
      name: row.name,
      description: row.description || '',
      createdAt: row.created_at,
      contentUpdatedAt: row.content_updated_at,
      cardCount: row.card_count,
      audioCount: row.audio_count,
      localCardCount: (await localDB.getCardsByDeck(row.id)).length,
      localAudioCount: (await localDB.getDeckAudios(row.id)).length,
    })));
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
      const rows: any[] = [];
      const totalSteps = Math.max(1, Math.ceil(manifestBefore.card_count / PAGE_SIZE)) + 2;

      while (rows.length < manifestBefore.card_count) {
        onProgress?.({
          completed: Math.floor(rows.length / PAGE_SIZE),
          total: totalSteps,
          label: packageAttempt === 0 ? 'Baixando cartões' : `Conferindo pacote (tentativa ${packageAttempt + 1})`,
        });
        const page = await fetchCardsPage(rows.length, rows.length + PAGE_SIZE - 1, deckId);
        if (page.length === 0) break;
        rows.push(...page);
      }

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
      return { manifest: manifestAfter, rows, audios: (audios.data || []) as any[], totalSteps };
    } catch (error) {
      lastError = error;
      if (packageAttempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 900 * (packageAttempt + 1)));
    }
  }

  throw lastError instanceof Error
    ? new Error(`Não foi possível baixar o baralho completo. Nada foi substituído no celular. ${lastError.message}`)
    : new Error('Não foi possível baixar o baralho completo. Nada foi substituído no celular.');
}

/** Downloads one coherent deck package and installs it only after full validation. */
export async function downloadDeckPackage(
  update: DeckUpdate,
  onProgress?: (progress: PackageSyncProgress) => void,
): Promise<Flashcard[]> {
  if (!isOnline()) throw new Error('Você está offline');
  await syncOfflineQueue();
  if (await offlineQueue.count()) {
    throw new Error('Este aparelho ainda tem alterações aguardando a nuvem. Aguarde a sincronização antes de baixar.');
  }

  const localRows = await localDB.getCardsByDeck(update.deckId);
  const { manifest, rows: remoteRows, audios, totalSteps } = await fetchVerifiedDeckPackage(update.deckId, onProgress);
  const { rows, localProgressRows } = mergeDownloadedCardRows(remoteRows, localRows);

  await Promise.all([
    syncLocalDeckCards(update.deckId, rows),
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
  if (localProgressRows.length > 0) {
    await persistMutations(localProgressRows.map((row) => ({
      table: 'cards' as const,
      action: 'update' as const,
      payload: {
        id: row.id,
        ...Object.fromEntries(PROGRESS_FIELDS.map((field) => [field, row[field]])),
      },
    })));
  }
  onProgress?.({ completed: totalSteps, total: totalSteps, label: `${manifest.card_count} cartões conferidos e instalados` });
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
    const rows = await localDB.getCardSummaries();
    return rows.map(rowToCard);
  } catch (error) {
    console.error('Failed to read local card summaries:', error);
    return [];
  }
}

export async function getCardsByDeck(deckId: string): Promise<Flashcard[]> {
  const localOnly = await isDeckInstalled(deckId);

  if (cache.cards !== null && loadedDeckCardIds.has(deckId)) {
    const cachedDeckCards = cache.cards.filter(card => card.deckId === deckId);
    if (!localOnly && !isDeckCardsFresh(deckId) && isOnline()) fetchCardsByDeckFromDB(deckId).catch(console.error);
    return cachedDeckCards;
  }

  let localCards: any[] = [];
  try {
    localCards = await localDB.getCardsByDeck(deckId);
  } catch (e) {
    console.error(`Failed to read local cards for deck ${deckId}:`, e);
  }

  if (localCards.length > 0) {
    const cards = sortCards(localCards.map(rowToCard));
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

export async function addCard(deckId: string, front: string, back: string, audioId?: string | null, cardType: 'standard' | 'typing' = 'standard'): Promise<Flashcard> {
  const userId = await getCachedUserId();
  const now = new Date().toISOString();
  const card: Flashcard = {
    id: crypto.randomUUID(), front, back, deckId, audioId: audioId || null, status: 'new',
    interval: 0, easeFactor: 2.5, stepsIndex: 0, repetition: 0,
    reviewCount: 0, lapseCount: 0, dueDate: now, createdAt: now, updatedAt: now,
    progressUpdatedAt: now, flagged: false, cardType,
  };

  // Update cache immediately
  if (cache.cards) cache.cards.push(card);
  touch('cards');
  touchDeckCards(deckId);

  // Persist locally and through the durable cloud outbox.
  const row = cardToRow(card, userId);
  await localDB.saveCard(row);
  await persistMutations([{ table: 'cards', action: 'insert', payload: row }]);

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

export async function updateCard(id: string, updates: Partial<Flashcard>): Promise<void> {
  const dbUpdates: Record<string, any> = {};
  if (updates.front !== undefined) dbUpdates.front = updates.front;
  if (updates.back !== undefined) dbUpdates.back = updates.back;
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
  // Update cache immediately
  const deletedCard = cache.cards?.find(c => c.id === cardId) || null;
  if (cache.cards) cache.cards = cache.cards.filter(c => c.id !== cardId);
  if (deletedCard) touchDeckCards(deletedCard.deckId);
  // Cascade: invalidate review history cache since DB cascade deletes related reviews
  invalidateCache('reviewHistory');

  await persistMutations([{ table: 'cards', action: 'delete', payload: { id: cardId } }]);
  await localDB.deleteCard(cardId);
}

// ── Review History ──

export async function addReviewHistory(cardId: string, rating: string): Promise<void> {
  const userId = await getCachedUserId();

  const row = { id: crypto.randomUUID(), card_id: cardId, rating, user_id: userId, reviewed_at: new Date().toISOString() };

  // Invalidate cache immediately
  invalidateCache('reviewHistory');

  await localDB.saveReview(row);
  await persistMutations([{ table: 'review_history', action: 'insert', payload: row }]);
}

async function fetchReviewHistoryFromDB(): Promise<{ date: string; count: number }[]> {
  const { data, error } = await supabase.from('review_history').select('*');
  if (error) throw error;
  localDB.replaceReviewHistory(data || []).catch(console.error);
  const countMap: Record<string, number> = {};
  (data || []).forEach((r: any) => {
    const date = r.reviewed_at.slice(0, 10);
    countMap[date] = (countMap[date] || 0) + 1;
  });
  const result = Object.entries(countMap).map(([date, count]) => ({ date, count }));
  cache.reviewHistory = result;
  touch('reviewHistory');
  return result;
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
  if (cache.reviewHistory !== null) {
    if (!isFresh('reviewHistory') && isOnline()) fetchReviewHistoryFromDB().catch(console.error);
    return cache.reviewHistory;
  }
  // Always try local first for instant rendering
  try {
    const local = await localDB.getReviewHistory();
    if (local.length > 0) {
      const result = aggregateReviewHistory(local);
      cache.reviewHistory = result;
      touch('reviewHistory');
      if (isOnline()) fetchReviewHistoryFromDB().catch(console.error);
      return result;
    }
  } catch (e) {
    console.error('Failed to read local review history:', e);
  }
  if (!isOnline()) return [];
  return fetchReviewHistoryFromDB();
}

export function getCachedReviewHistory(): { date: string; count: number }[] | null {
  return cache.reviewHistory;
}

export async function getReviewHistoryToday(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  if (isOnline()) {
    const { count, error } = await supabase
      .from('review_history')
      .select('*', { count: 'exact', head: true })
      .gte('reviewed_at', today + 'T00:00:00')
      .lt('reviewed_at', today + 'T23:59:59.999');
    if (error) throw error;
    return count || 0;
  }
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
  await persistMutations(updatedRows.map((row) => ({
    table: 'cards' as const,
    action: 'update' as const,
    payload: { id: row.id, ...resetFields },
  })));
}
