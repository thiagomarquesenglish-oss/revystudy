import { Flashcard, Rating, CardStatus } from './types';

// ── Anki v3 Scheduler configuration ────────────────────────
const LEARNING_STEPS_MINUTES = [1, 10];
const RELEARNING_STEPS_MINUTES = [10];
const GRADUATING_INTERVAL = 1;   // days
const EASY_INTERVAL = 4;         // days
const HARD_MULTIPLIER = 1.2;
const EASY_BONUS = 1.3;
const MINIMUM_EASE = 1.3;
const LAPSE_INTERVAL_MULTIPLIER = 0.5;
const MAX_INTERVAL = 36500;

// ── Helpers ─────────────────────────────────────────────────
function minutesToDays(minutes: number): number {
  return minutes / 1440;
}

function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function addDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Anki v3: Hard delay = average of current step and next step.
 * If on the last step, use current step * 1.5.
 */
function hardStepDelay(steps: number[], stepsIndex: number): number {
  const current = steps[stepsIndex] ?? steps[steps.length - 1];
  if (stepsIndex + 1 < steps.length) {
    return (current + steps[stepsIndex + 1]) / 2;
  }
  return current * 1.5;
}

// ── Core algorithm (Anki v3 Scheduler) ──────────────────────
export function processReview(card: Flashcard, rating: Rating): Partial<Flashcard> {
  let { interval, repetition, easeFactor, reviewCount, lapseCount, status, stepsIndex } = card;
  stepsIndex = stepsIndex ?? 0;
  lapseCount = lapseCount ?? 0;
  reviewCount += 1;

  let newStatus: CardStatus = status;
  let dueDate: string;

  // ────────────────────────────────────────────────────────
  // NEW → transitions to learning (or review on Easy)
  // ────────────────────────────────────────────────────────
  if (status === 'new') {
    if (rating === 'again') {
      newStatus = 'learning';
      stepsIndex = 0;
      dueDate = addMinutes(LEARNING_STEPS_MINUTES[0]);
      interval = minutesToDays(LEARNING_STEPS_MINUTES[0]);
    } else if (rating === 'hard') {
      // Anki v3: Hard on new = average of step 0 and step 1
      newStatus = 'learning';
      stepsIndex = 0;
      const delay = hardStepDelay(LEARNING_STEPS_MINUTES, 0);
      dueDate = addMinutes(delay);
      interval = minutesToDays(delay);
    } else if (rating === 'good') {
      newStatus = 'learning';
      stepsIndex = 1;
      dueDate = addMinutes(LEARNING_STEPS_MINUTES[1]);
      interval = minutesToDays(LEARNING_STEPS_MINUTES[1]);
    } else {
      // Easy → graduate immediately
      newStatus = 'review';
      interval = EASY_INTERVAL;
      repetition = 1;
      stepsIndex = 0;
      dueDate = addDays(EASY_INTERVAL);
    }
  }

  // ────────────────────────────────────────────────────────
  // LEARNING
  // ────────────────────────────────────────────────────────
  else if (status === 'learning') {
    if (rating === 'again') {
      stepsIndex = 0;
      dueDate = addMinutes(LEARNING_STEPS_MINUTES[0]);
      interval = minutesToDays(LEARNING_STEPS_MINUTES[0]);
    } else if (rating === 'hard') {
      // Anki v3: Hard = average of current step and next step
      const delay = hardStepDelay(LEARNING_STEPS_MINUTES, stepsIndex);
      dueDate = addMinutes(delay);
      interval = minutesToDays(delay);
      // stepsIndex stays the same
    } else if (rating === 'good') {
      stepsIndex += 1;
      if (stepsIndex >= LEARNING_STEPS_MINUTES.length) {
        // Graduate → review
        newStatus = 'review';
        interval = GRADUATING_INTERVAL;
        repetition = 1;
        stepsIndex = 0;
        dueDate = addDays(GRADUATING_INTERVAL);
      } else {
        const stepMin = LEARNING_STEPS_MINUTES[stepsIndex];
        dueDate = addMinutes(stepMin);
        interval = minutesToDays(stepMin);
      }
    } else {
      // Easy → graduate with easy interval
      newStatus = 'review';
      interval = EASY_INTERVAL;
      repetition = 1;
      stepsIndex = 0;
      dueDate = addDays(EASY_INTERVAL);
    }
  }

  // ────────────────────────────────────────────────────────
  // REVIEW — dynamic interval calculation
  // ────────────────────────────────────────────────────────
  else if (status === 'review') {
    if (rating === 'again') {
      // Lapse → relearning
      // Anki v3: calculate reduced interval immediately
      newStatus = 'relearning';
      lapseCount += 1;
      easeFactor = Math.max(MINIMUM_EASE, easeFactor - 0.20);
      interval = clamp(Math.max(1, Math.round(interval * LAPSE_INTERVAL_MULTIPLIER)), 1, MAX_INTERVAL);
      stepsIndex = 0;
      repetition = 0;
      dueDate = addMinutes(RELEARNING_STEPS_MINUTES[0]);
    } else if (rating === 'hard') {
      interval = clamp(Math.max(interval + 1, Math.round(interval * HARD_MULTIPLIER)), 1, MAX_INTERVAL);
      easeFactor = Math.max(MINIMUM_EASE, easeFactor - 0.15);
      repetition += 1;
      dueDate = addDays(interval);
    } else if (rating === 'good') {
      interval = clamp(Math.max(interval + 1, Math.round(interval * easeFactor)), 1, MAX_INTERVAL);
      repetition += 1;
      dueDate = addDays(interval);
    } else {
      // Easy
      interval = clamp(Math.max(interval + 1, Math.round(interval * easeFactor * EASY_BONUS)), 1, MAX_INTERVAL);
      easeFactor += 0.15;
      repetition += 1;
      dueDate = addDays(interval);
    }
  }

  // ────────────────────────────────────────────────────────
  // RELEARNING — graduates back to review with pre-calculated lapse interval
  // ────────────────────────────────────────────────────────
  else {
    if (rating === 'again') {
      stepsIndex = 0;
      dueDate = addMinutes(RELEARNING_STEPS_MINUTES[0]);
    } else if (rating === 'hard') {
      // Anki v3: Hard = average of current step and next step
      const delay = hardStepDelay(RELEARNING_STEPS_MINUTES, stepsIndex);
      dueDate = addMinutes(delay);
    } else if (rating === 'good') {
      stepsIndex += 1;
      if (stepsIndex >= RELEARNING_STEPS_MINUTES.length) {
        // Graduate back to review — interval already calculated at lapse time
        newStatus = 'review';
        repetition = 1;
        stepsIndex = 0;
        dueDate = addDays(interval);
      } else {
        const stepMin = RELEARNING_STEPS_MINUTES[stepsIndex];
        dueDate = addMinutes(stepMin);
      }
    } else {
      // Easy → graduate back to review — use pre-calculated lapse interval
      newStatus = 'review';
      repetition = 1;
      stepsIndex = 0;
      dueDate = addDays(interval);
    }
  }

  return {
    interval,
    repetition,
    easeFactor,
    dueDate,
    reviewCount,
    lapseCount,
    status: newStatus,
    stepsIndex,
  };
}

// ── Label for UI buttons (exact time from dueDate) ──────────
export function getNextReviewLabel(rating: Rating, card: Flashcard): string {
  const updated = processReview(card, rating);
  const dueDate = new Date(updated.dueDate!).getTime();
  const diffMs = dueDate - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return '< 1 min';
  if (diffMinutes < 60) return `${diffMinutes} min`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`;

  if (diffDays < 365) {
    const months = Math.round(diffDays / 30);
    return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  }

  const years = Math.round(diffDays / 365);
  return `${years} ${years === 1 ? 'ano' : 'anos'}`;
}
