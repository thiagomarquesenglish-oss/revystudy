import { createEmptyCard, fsrs, Rating as Grade, State, type Card as MemoryCard } from 'ts-fsrs';
import type { Flashcard, Rating } from './types';
import { availableSituationModes, exerciseInfo, type ExerciseMode, type LearningSkill } from './adaptive-study';
import { readSituation } from './situation';
import { localDB } from './offline-db';

export const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 36500,
  enable_fuzz: true, enable_short_term: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] });
const grades = { again: Grade.Again, hard: Grade.Hard, good: Grade.Good, easy: Grade.Easy } as const;
export type Memory = Omit<MemoryCard, 'due' | 'last_review'> & { due: string; last_review?: string };
export interface SkillSchedule {
  id: string; user_id: string; card_id: string; deck_id: string; skill: LearningSkill;
  version: 1; memory: Memory; updated_at: string;
}
export type ScheduledCard = Flashcard & { sessionKey: string; sessionMode?: ExerciseMode; schedule: SkillSchedule };
const serialize = (card: MemoryCard): Memory => ({ ...card, due: card.due.toISOString(), last_review: card.last_review?.toISOString() });
export const scheduleId = (userId: string, cardId: string, skill: LearningSkill) => `${userId}:${cardId}:${skill}`;

export function studyDayStart(now: Date) {
  const date = new Date(now); date.setHours(4, 0, 0, 0);
  if (date > now) date.setDate(date.getDate() - 1);
  return date;
}
export function nextStudyDay(now: Date) { const date = studyDayStart(now); date.setDate(date.getDate() + 1); return date; }

export function cardModes(card: Flashcard): { skill: LearningSkill; mode?: ExerciseMode }[] {
  const situation = readSituation(card.front, card.back);
  if (!situation) return [{ skill: card.cardType === 'typing' ? 'writing' : 'comprehension' }];
  const root = document.createElement('div'); root.innerHTML = situation.mediaHtml;
  const modes = availableSituationModes({ hasImage: !!root.querySelector('img[src]'),
    hasAudio: !!card.audioId || !!root.querySelector('audio[src],[data-audio][data-src]'),
    hasEnglish: !!situation.english, hasPortuguese: !!situation.portuguese });
  // One schedule per skill, not per presentation (image+audio is still listening).
  return [...new Map(modes.map(mode => [exerciseInfo[mode].skill, { skill: exerciseInfo[mode].skill, mode }])).values()];
}

export function migrateSchedule(card: Flashcard, userId: string, skill: LearningSkill, history: any[], now = new Date()): SkillSchedule {
  let memory = createEmptyCard(now);
  const relevant = history.filter(row => row.user_id === userId && row.card_id === card.id &&
    (row.skill === skill || (!row.skill && !readSituation(card.front, card.back))) && row.rating in grades &&
    Number.isFinite(Date.parse(row.reviewed_at)) && Date.parse(row.reviewed_at) <= now.getTime())
    .sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at) || a.id.localeCompare(b.id));
  for (const row of relevant) memory = scheduler.next(memory, new Date(row.reviewed_at), grades[row.rating as Rating]).card;
  // Migration must not bring a previously postponed Easy card back today.
  if (Number.isFinite(Date.parse(card.dueDate))) memory.due = new Date(card.dueDate);
  return { id: scheduleId(userId, card.id, skill), user_id: userId, card_id: card.id,
    deck_id: card.deckId, skill, version: 1, memory: serialize(memory), updated_at: now.toISOString() };
}

export function answerSchedule(schedule: SkillSchedule, rating: Rating, now = new Date()): SkillSchedule {
  const result = scheduler.next(schedule.memory, now, grades[rating]).card;
  // Reviews use study days; short learning steps keep their exact timestamp.
  if (result.state === State.Review) {
    const due = studyDayStart(now); due.setDate(due.getDate() + Math.max(1, result.scheduled_days)); result.due = due;
  }
  return { ...schedule, memory: serialize(result), updated_at: now.toISOString() };
}

export async function loadScheduledCards(cards: Flashcard[], userId: string): Promise<ScheduledCard[]> {
  if (!userId) throw new Error('Entre novamente para carregar o agendamento.');
  const [saved, history] = await Promise.all([localDB.getSkillSchedules(), localDB.getReviewHistory()]);
  const byId = new Map<string, SkillSchedule>(saved.filter(row => row.user_id === userId).map(row => [row.id, row]));
  const missing: SkillSchedule[] = [];
  const result = cards.flatMap(card => cardModes(card).map(({ skill, mode }) => {
    const id = scheduleId(userId, card.id, skill);
    const schedule = byId.get(id) || migrateSchedule(card, userId, skill, history);
    if (!byId.has(id)) missing.push(schedule);
    return { ...card, sessionKey: id, sessionMode: mode, schedule };
  }));
  if (missing.length) {
    const initialized = new Map((await localDB.initializeSkillSchedules(missing)).map(row => [row.id, row]));
    for (const item of result) item.schedule = initialized.get(item.sessionKey) || item.schedule;
  }
  return result;
}

export function availableAt(item: ScheduledCard, all: ScheduledCard[], now: Date): number {
  const today = studyDayStart(now).getTime();
  const sibling = all.some(other => other.id === item.id && other.sessionKey !== item.sessionKey &&
    Date.parse(other.schedule.memory.last_review || '') >= today);
  return Math.max(Date.parse(item.schedule.memory.due), sibling ? nextStudyDay(now).getTime() : 0);
}

export function pickDueCard(all: ScheduledCard[], now = new Date(), lastSkill?: LearningSkill): ScheduledCard | null {
  const due = all.filter(item => availableAt(item, all, now) <= now.getTime());
  const priority = (item: ScheduledCard) => [State.Learning, State.Relearning].includes(item.schedule.memory.state) ? 0 : item.schedule.memory.state === State.Review ? 1 : 2;
  due.sort((a,b) => priority(a)-priority(b) || Date.parse(a.schedule.memory.due)-Date.parse(b.schedule.memory.due) || a.sessionKey.localeCompare(b.sessionKey));
  if (!due.length) return null;
  // Alternate skills only among eligible cards of the same scheduling priority.
  return due.find(item => priority(item) === priority(due[0]) && item.schedule.skill !== lastSkill) || due[0];
}

export function validSkillSchedule(row: any): row is SkillSchedule {
  return !!row && row.version === 1 && typeof row.card_id === 'string' && typeof row.deck_id === 'string' &&
    typeof row.user_id === 'string' && typeof row.id === 'string' && ['comprehension','listening','production','writing'].includes(row.skill) &&
    !!row.memory && Number.isFinite(Date.parse(row.memory.due)) && [0,1,2,3].includes(row.memory.state) &&
    ['stability','difficulty','elapsed_days','scheduled_days','learning_steps','reps','lapses'].every(key => Number.isFinite(row.memory[key]) && row.memory[key] >= 0) &&
    Number.isFinite(Date.parse(row.updated_at)) &&
    (!row.memory.last_review || Number.isFinite(Date.parse(row.memory.last_review)));
}
