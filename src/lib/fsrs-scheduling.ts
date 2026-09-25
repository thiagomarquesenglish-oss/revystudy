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
  traditional?: { easeFactor: number; step: number };
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
  const old = schedule.memory;
  const memory = {...old, reps:old.reps+1, last_review:now.toISOString()};
  let easeFactor = schedule.traditional?.easeFactor ?? 2.5;
  let step = schedule.traditional?.step ?? (old.state === State.Learning && old.learning_steps > 0 ? 1 : 0);
  const days = (interval: number) => {
    const count = Math.min(36500, Math.max(1, Math.round(interval)));
    const due = studyDayStart(now); due.setDate(due.getDate() + count);
    memory.state = State.Review; memory.scheduled_days = count; memory.due = due.toISOString(); step = 0;
  };
  const minutes = (delay: number, state: State) => {
    memory.state = state; memory.due = new Date(now.getTime()+delay*60000).toISOString();
  };
  if (old.state === State.Review) {
    const interval = Math.max(1, old.scheduled_days);
    const dueDay = studyDayStart(new Date(old.due));
    const today = studyDayStart(now);
    // Calendar days, not 24h units (DST may change the length of a day).
    const serial = (date: Date) => Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000;
    const late = Math.max(0, serial(today)-serial(dueDay));
    const hard = Math.max(interval+1, Math.round(interval*1.2));
    const good = Math.max(hard+1, Math.round((interval+late/2)*easeFactor));
    const easy = Math.max(good+1, Math.round((interval+late)*easeFactor*1.3));
    if (rating === 'again') {
      easeFactor = Math.max(1.3,easeFactor-.2); memory.lapses++; memory.scheduled_days=1; step=0; minutes(10,State.Relearning);
    } else {
      days(rating === 'hard' ? hard : rating === 'good' ? good : easy);
      easeFactor = Math.max(1.3,easeFactor+(rating === 'hard' ? -.15 : rating === 'easy' ? .15 : 0));
    }
  } else if (old.state === State.Relearning) {
    if (rating === 'again') minutes(10,State.Relearning);
    else if (rating === 'hard') minutes(15,State.Relearning);
    else days(rating === 'easy' ? Math.max(2,old.scheduled_days+1) : old.scheduled_days);
  } else {
    if (rating === 'easy') days(4);
    else if (rating === 'again') { step=0; minutes(1,State.Learning); }
    else if (rating === 'hard') minutes(step===0 ? 5.5 : 10,State.Learning);
    else if (step===0) { step=1; minutes(10,State.Learning); }
    else days(1);
  }
  memory.learning_steps=step;
  return {...schedule, memory, traditional:{easeFactor,step}, updated_at:now.toISOString()};
}

/**
 * Human-readable preview of the next interval for the current exercise.
 * This is intentionally calculated from the same scheduler used when the
 * answer is saved, so the label shown on a rating button cannot drift from
 * the actual due date.
 */
export function intervalLabel(schedule: SkillSchedule, rating: Rating, now = new Date()): string {
  const next = answerSchedule(schedule, rating, now);
  const due = Date.parse(next.memory.due);
  if (!Number.isFinite(due)) return '';
  if ([State.Learning, State.Relearning].includes(next.memory.state)) {
    const minutes = Math.max(1, Math.round((due - now.getTime()) / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.max(1, Math.round(minutes / 60));
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  const days = Math.max(1, next.memory.scheduled_days);
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
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
  // Other skills must never postpone or advance this exercise.
  return Date.parse(item.schedule.memory.due);
}

export function pickDueCard(all: ScheduledCard[], now = new Date(), lastSkill?: LearningSkill, lastCardId?: string): ScheduledCard | null {
  let due = all.filter(item => availableAt(item, all, now) <= now.getTime());
  if (!due.length) return null;
  // Interleave source cards, not just their skills. Never pull a future review forward.
  const otherCards = due.filter(item => item.id !== lastCardId);
  if (otherCards.length) due = otherCards;
  const priority = (item: ScheduledCard) => [State.Learning, State.Relearning].includes(item.schedule.memory.state) ? 0 : item.schedule.memory.state === State.Review ? 1 : 2;
  const firstPriority = Math.min(...due.map(priority));
  due = due.filter(item => priority(item) === firstPriority);
  const differentSkills = due.filter(item => item.schedule.skill !== lastSkill);
  if (differentSkills.length) due = differentSkills;
  const ids = [...new Set(due.map(item => item.id))];
  const id = ids[Math.floor(Math.random() * ids.length)];
  const variants = due.filter(item => item.id === id);
  return variants[Math.floor(Math.random() * variants.length)];
}

export function validSkillSchedule(row: any): row is SkillSchedule {
  return !!row && row.version === 1 && typeof row.card_id === 'string' && typeof row.deck_id === 'string' &&
    typeof row.user_id === 'string' && typeof row.id === 'string' && ['comprehension','listening','production','writing'].includes(row.skill) &&
    !!row.memory && Number.isFinite(Date.parse(row.memory.due)) && [0,1,2,3].includes(row.memory.state) &&
    ['stability','difficulty','elapsed_days','scheduled_days','learning_steps','reps','lapses'].every(key => Number.isFinite(row.memory[key]) && row.memory[key] >= 0) &&
    Number.isFinite(Date.parse(row.updated_at)) &&
    (!row.memory.last_review || Number.isFinite(Date.parse(row.memory.last_review))) &&
    (!row.traditional || (Number.isFinite(row.traditional.easeFactor) && row.traditional.easeFactor >= 1.3 && [0,1].includes(row.traditional.step)));
}
