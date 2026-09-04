import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
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
      state.pending.push(card);
    }
  }
  write(user, state);
}
export function recordDictationReview(user: string, deck: string, card: string, answer: string, rating: DictationRating) {
  migrateLegacyDictation(user);
  const state = read(user);
  const event: DictationReview = { id: crypto.randomUUID(), user_id: user, deck_id: deck, card_id: card, answer: answer.trim(), rating, reviewed_at: new Date().toISOString() };
  state.events.push(event); state.pending.push(event.id);
  write(user, state);
  const history = deriveDictationHistory(state.events, deck);
  try { saveDictationHistory(user, deck, history); } catch { /* The event is already saved. */ }
  void syncDictation().catch(() => {});
  return history;
}
let inFlight: Promise<void> | undefined;
export function syncDictation() {
  if (inFlight) return inFlight;
  inFlight = run().finally(() => { inFlight = undefined; }); return inFlight;
}
async function run() {
  if (!navigator.onLine) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const user = session.user.id;
  migrateLegacyDictation(user);
  const snapshot = read(user);
  const pending = snapshot.events.filter(e => snapshot.pending.includes(e.id));
  for (let i=0; i<pending.length; i+=100) {
    const candidates = pending.slice(i,i+100);
    const {data: cards, error: cardError} = await supabase.from('cards').select('id,deck_id').in('id', candidates.map(e=>e.card_id)).eq('user_id', user);
    if (cardError) throw cardError;
    const batch = candidates.filter(e=>cards.some(c=>c.id===e.card_id && c.deck_id===e.deck_id));
    if (!batch.length) { const latest=read(user); latest.pending=latest.pending.filter(id=>!candidates.some(e=>e.id===id)); write(user,latest); continue; }
    const { error } = await supabase.from('dictation_reviews').upsert(batch.map(e=>({...e,legacy:e.legacy as unknown as Json})), { onConflict: 'user_id,id', ignoreDuplicates: true });
    if (error) throw error;
    const latest = read(user); latest.pending = latest.pending.filter(id => !candidates.some(e=>e.id===id)); write(user, latest);
  }
  const remote: DictationReview[] = [];
  for (let from=0;;from+=1000) {
    const { data, error } = await supabase.from('dictation_reviews').select('*').eq('user_id',user).order('id').range(from,from+999);
    if (error) throw error;
    remote.push(...(data as unknown as DictationReview[])); if (data.length<1000) break;
  }
  const latest = read(user);
  // Keep unsent events created during the request; accepted cloud events are authoritative.
  const merged = [...new Map([...latest.events.filter(e=>latest.pending.includes(e.id)), ...remote].map(e=>[e.id,e])).values()];
  write(user, {events: merged, pending: latest.pending}); cacheHistories(user, merged);
  window.dispatchEvent(new Event('revystudy:dictation-updated'));
}
export function restoreDictationEvents(user: string, events: DictationReview[], replace: boolean) {
  const old = replace ? {events: [], pending: []} : read(user);
  const incoming = events.map(e=>({...e,user_id:user}));
  const merged = [...new Map([...old.events,...incoming].map(e=>[e.id,e])).values()];
  if (replace) for (const k of Object.keys(localStorage).filter(k=>k.startsWith(`revystudy:dictation:v1:${user}:`))) localStorage.removeItem(k);
  write(user,{events:merged,pending:[...new Set([...old.pending,...incoming.map(e=>e.id)])]}); cacheHistories(user,merged);
}
