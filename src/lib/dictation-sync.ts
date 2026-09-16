import { readDictationHistory, saveDictationHistory, type DictationRating } from './dictation-srs';
import { deriveDictationHistory, validDictationReview, type DictationReview } from './dictation-events';
const eventKey = (user: string) => `revystudy:dictation:events:v1:${user}`;
interface Stored { events: DictationReview[]; pending: string[] }
function read(user: string): Stored {
  const raw = localStorage.getItem(eventKey(user));
  if(!raw) return {events:[],pending:[]};
  const data=JSON.parse(raw);
  if(!Array.isArray(data.events) || !data.events.every(validDictationReview) || !Array.isArray(data.pending) || !data.pending.every((id:unknown)=>typeof id==='string')) throw new Error('O histórico de escrita está inválido. Preserve os dados deste navegador.');
  return data;
}
function write(user: string, state: Stored) { localStorage.setItem(eventKey(user), JSON.stringify(state)); }
export function getDictationEvents(user: string) { return read(user).events; }
export function pendingDictationCount(user: string) { return read(user).pending.length; }
function cacheHistories(user: string, events: DictationReview[]) {
  const prefix = `revystudy:dictation:v1:${user}:`;
  const decks = new Set([...Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length)), ...events.map(e=>e.deck_id)]);
  for (const deck of decks) { try { saveDictationHistory(user, deck, deriveDictationHistory(events, deck)); } catch { /* Canonical events remain durable. */ } }
}
export function migrateLegacyDictation(user: string) {
  const state = read(user);
  const prefix = `revystudy:dictation:v1:${user}:`;
  for (const key of Object.keys(localStorage).filter(k => k.startsWith(prefix))) {
    const deck = key.slice(prefix.length);
    for (const [card, progress] of Object.entries(readDictationHistory(user, deck))) {
      if (state.events.some(e => e.card_id === card)) continue;
      state.events.push({ id: card, user_id: user, card_id: card, deck_id: deck, answer: progress.answer, rating: 'legacy', reviewed_at: '1970-01-01T00:00:00.000Z', legacy: progress });
    }
  }
  write(user, state);
}
export function recordDictationReview(user: string, deck: string, card: string, answer: string, rating: DictationRating) {
  migrateLegacyDictation(user);
  const state = read(user);
  const event: DictationReview = { id: crypto.randomUUID(), user_id: user, deck_id: deck, card_id: card, answer: answer.trim(), rating, reviewed_at: new Date().toISOString() };
  state.events.push(event);
  write(user, state);
  const history = deriveDictationHistory(state.events, deck);
  try { saveDictationHistory(user, deck, history); } catch { /* The event is already saved. */ }
  return history;
}
/** Writing practice is deliberately device-local; only decks and cards use cloud sync. */
export async function syncDictation() { return Promise.resolve(); }
export function restoreDictationEvents(user: string, events: DictationReview[], replace: boolean) {
  const old = replace ? {events: [], pending: []} : read(user);
  const incoming = events.map(e=>({...e,user_id:user}));
  const merged = [...new Map([...old.events,...incoming].map(e=>[e.id,e])).values()];
  if (replace) for (const k of Object.keys(localStorage).filter(k=>k.startsWith(`revystudy:dictation:v1:${user}:`))) localStorage.removeItem(k);
  write(user,{events:merged,pending:[]}); cacheHistories(user,merged);
}
