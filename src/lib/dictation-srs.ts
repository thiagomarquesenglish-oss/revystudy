import type { Flashcard } from './types';

export type DictationRating = 'again' | 'hard' | 'good' | 'easy';
export interface DictationProgress {
  answer: string;
  interval: number;
  due: number;
  reviews: number;
  mistakes: number;
}
export type DictationHistory = Record<string, DictationProgress>;
const DAY = 86400000;
const key = (userId: string, deckId: string) => `revystudy:dictation:v1:${userId}:${deckId}`;

export function readDictationHistory(userId: string, deckId: string): DictationHistory {
  const raw = localStorage.getItem(key(userId, deckId));
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Histórico inválido');
  const valid: DictationHistory = {};
  for (const [id, value] of Object.entries(parsed)) {
    const p = value as DictationProgress;
    if (p && typeof p.answer === 'string' && Number.isFinite(p.due) && Number.isFinite(p.interval)
      && p.interval >= 0 && Number.isFinite(p.reviews) && Number.isFinite(p.mistakes)) valid[id] = p;
  }
  return valid;
}

export function saveDictationHistory(userId: string, deckId: string, history: DictationHistory) {
  localStorage.setItem(key(userId, deckId), JSON.stringify(history));
}

export function progressFor(card: Flashcard, history: DictationHistory) {
  const progress = history[card.id];
  return progress?.answer === card.dictationAnswer?.trim() ? progress : undefined;
}

export function scheduleDictation(previous: DictationProgress | undefined, answer: string, rating: DictationRating, now = Date.now()): DictationProgress {
  const old = previous?.interval ?? 0;
  const interval = rating === 'again' ? 0 : rating === 'hard' ? Math.max(1, Math.round(old * 1.2))
    : rating === 'easy' ? Math.max(4, Math.round(old * 3)) : Math.max(1, Math.round(old * 2));
  return { answer: answer.trim(), interval: Math.min(interval, 365),
    due: now + (rating === 'again' ? 10 * 60000 : Math.min(interval, 365) * DAY),
    reviews: (previous?.reviews ?? 0) + 1, mistakes: (previous?.mistakes ?? 0) + Number(rating === 'again') };
}

export function shuffleDictation<T>(items: T[], random = Math.random): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dueDictation<T extends { card: Flashcard }>(items: T[], history: DictationHistory, now = Date.now()): T[] {
  return shuffleDictation(items.filter(({ card }) => {
    const progress = progressFor(card, history);
    return !progress || progress.due <= now;
  }));
}

export function intervalLabel(progress: DictationProgress) {
  return progress.interval === 0 ? '10 min' : `${progress.interval} ${progress.interval === 1 ? 'dia' : 'dias'}`;
}
