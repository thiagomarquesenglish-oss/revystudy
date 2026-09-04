import { scheduleDictation, type DictationHistory, type DictationProgress, type DictationRating } from './dictation-srs';
export interface DictationReview {
  id: string; user_id: string; card_id: string; deck_id: string;
  answer: string; rating: DictationRating | 'legacy'; reviewed_at: string;
  legacy?: DictationProgress | null;
}
export function deriveDictationHistory(events: DictationReview[], deckId: string): DictationHistory {
  const history: DictationHistory = {};
  const unique = [...new Map(events.map(e => [e.id, e])).values()];
  unique.filter(e => e.deck_id === deckId).sort((a,b) => Date.parse(a.reviewed_at) - Date.parse(b.reviewed_at) || a.id.localeCompare(b.id)).forEach(e => {
    if (e.rating === 'legacy') { if (e.legacy && !history[e.card_id]) history[e.card_id] = e.legacy; return; }
    const old = history[e.card_id];
    history[e.card_id] = scheduleDictation(old?.answer === e.answer.trim() ? old : undefined, e.answer, e.rating, Date.parse(e.reviewed_at));
  });
  return history;
}
export function dictationSummary(events: DictationReview[], now = new Date()) {
  events = [...new Map(events.map(e=>[e.id,e])).values()];
  const day = now.toDateString();
  const attempts = events.filter(e => e.rating !== 'legacy');
  const today = attempts.filter(e => new Date(e.reviewed_at).toDateString() === day);
  const baseline = events.filter(e=>e.rating==='legacy').reduce((sum,e)=>({reviews:sum.reviews+(e.legacy?.reviews||0),mistakes:sum.mistakes+(e.legacy?.mistakes||0)}),{reviews:0,mistakes:0});
  const total = attempts.length+baseline.reviews;
  const correct = attempts.filter(e => e.rating !== 'again').length + baseline.reviews-baseline.mistakes;
  return { today: today.length, total, correct, accuracy: total ? Math.round(correct / total * 100) : null };
}

export function validDictationReview(value: unknown): value is DictationReview {
  if (!value || typeof value !== 'object') return false;
  const e=value as DictationReview;
  if (![e.id,e.user_id,e.card_id,e.deck_id].every(v=>typeof v==='string' && v.length>0) || typeof e.answer!=='string' || !['again','hard','good','easy','legacy'].includes(e.rating) || !Number.isFinite(Date.parse(e.reviewed_at))) return false;
  if(e.rating==='legacy') {
    const p=e.legacy;
    return !!p && typeof p.answer==='string' && Number.isFinite(p.due) && Number.isFinite(p.interval) && p.interval>=0 && Number.isInteger(p.reviews) && p.reviews>=0 && Number.isInteger(p.mistakes) && p.mistakes>=0 && p.mistakes<=p.reviews;
  }
  return true;
}
