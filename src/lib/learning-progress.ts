import { CURRICULUM, unitKey } from "./curriculum";
import { readSituation } from "./situation";
import type { Flashcard, Rating } from "./types";
import {
  parseAdaptiveEvent,
  type LearningSkill,
  type ExerciseMode,
} from "./adaptive-study";

export const SKILLS: LearningSkill[] = [
  "listening",
  "comprehension",
  "production",
  "writing",
];
export const SKILL_LABELS: Record<LearningSkill, string> = {
  listening: "Escuta",
  comprehension: "Leitura",
  production: "Fala",
  writing: "Escrita",
};
export type EvidenceStatus='none'|'low'|'sufficient';
export interface LearningEvent {
  id: string;
  cardId: string;
  rating: Rating;
  mode: ExerciseMode;
  at: string;
}
export const modeSkills = (mode: ExerciseMode): LearningSkill[] =>
  mode === "audio-dictation"
    ? ["listening", "writing"]
    : [
        mode === "audio-comprehension" || mode === "image-audio"
          ? "listening"
          : mode === "text-comprehension"
            ? "comprehension"
            : "production",
      ];
export function toLearningEvent(row: {
  id: string;
  card_id: string;
  rating?: string;
  skill?: string | null;
  exercise_mode?: string | null;
  reviewed_at?: string;
}): LearningEvent | null {
  const event = parseAdaptiveEvent(row);
  return event && Number.isFinite(Date.parse(event.reviewedAt))
    ? {
        id: row.id,
        cardId: row.card_id,
        rating: event.rating,
        mode: event.mode,
        at: event.reviewedAt,
      }
    : null;
}
const score: Record<Rating, number> = {
  again: 0,
  hard: 40,
  good: 90,
  easy: 100,
};
const DAY = 86400000;
const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
export interface UnitMetrics {
  count: number;
  reviewCount: number;
  skills: Record<LearningSkill, number|null>;
  coverage: Record<LearningSkill, number>;
  evidence: Record<LearningSkill,EvidenceStatus>;
  overall: number;
  retained: number;
  days: number;
  ready: boolean;
  mastered: boolean;
}
export function measureUnit(
  cards: Flashcard[],
  events: LearningEvent[],
  now = Date.now(),
): UnitMetrics {
  const ids = new Set(cards.map((c) => c.id));
  const attempts = events
    .filter((e) => ids.has(e.cardId) && Date.parse(e.at) <= now)
    .sort((a, b) => a.at.localeCompare(b.at));
  const skills = {} as Record<LearningSkill, number|null>,
    coverage = {} as Record<LearningSkill, number>,
    evidence = {} as Record<LearningSkill,EvidenceStatus>;
  for (const skill of SKILLS) {
    let covered = 0;
    const values = cards.map((card) => {
      // One observation per UTC day prevents repeated immediate answers inflating evidence.
      const daily = new Map<string, LearningEvent>();
      attempts
        .filter(
          (e) => e.cardId === card.id && modeSkills(e.mode).includes(skill),
        )
        .forEach((e) => daily.set(e.at.slice(0, 10), e));
      const recent = [...daily.values()].slice(-6);
      if (recent.length) covered++;
      if (!recent.length) return 0;
      const weighted =
        recent.reduce((sum, e, i) => sum + score[e.rating] * (i + 1), 0) /
        ((recent.length * (recent.length + 1)) / 2);
      const age = (now - Date.parse(recent.at(-1)!.at)) / DAY;
      return weighted * Math.max(0.5, 1 - Math.max(0, age - 30) / 120);
    });
    const skillAttempts=attempts.filter(e=>modeSkills(e.mode).includes(skill));
    const skillDays=new Set(skillAttempts.map(e=>e.at.slice(0,10))).size;
    skills[skill] = skillAttempts.length ? Math.round(average(values)) : null;
    coverage[skill] = cards.length ? covered / cards.length : 0;
    evidence[skill]=skillAttempts.length===0?'none':coverage[skill]>=.8&&skillDays>=2?'sufficient':'low';
  }
  const retained = cards.filter((card) => {
    const good = attempts.filter(
      (e) =>
        e.cardId === card.id && (e.rating === "good" || e.rating === "easy"),
    );
    return (
      good.length > 1 &&
      Date.parse(good.at(-1)!.at) - Date.parse(good[0].at) >= 2 * DAY
    );
  }).length;
  const days = new Set(attempts.map((e) => e.at.slice(0, 10))).size;
  const observed=Object.values(skills).filter((value):value is number=>value!==null);
  const overall = Math.round(average(observed));
  const enoughEvidence =
    cards.length >= 5 &&
    days >= 3 &&
    retained / cards.length >= 0.8 &&
    SKILLS.every((s) => evidence[s] === 'sufficient');
  const ready =
    enoughEvidence && overall >= 80 && SKILLS.every((s) => (skills[s]??0) >= 65);
  const mastered =
    enoughEvidence &&
    overall >= 90 &&
    SKILLS.every((s) => (skills[s]??0) >= 80) &&
    attempts.length > 0 &&
    Date.parse(attempts.at(-1)!.at) - Date.parse(attempts[0].at) >= 7 * DAY;
  return {
    count: cards.length,
    reviewCount: attempts.length,
    skills,
    coverage,
    evidence,
    overall,
    retained,
    days,
    ready,
    mastered,
  };
}

export type StageLearningState='locked'|'available'|'preparing'|'ready'|'studying'|'mastered';
export function stageLearningState(stage:{unlocked:boolean;count:number;targetContent:number;reviewCount:number;mastered:boolean}):StageLearningState{
  if(!stage.unlocked)return 'locked';
  if(stage.mastered)return 'mastered';
  if(stage.count===0)return 'available';
  if(stage.count<stage.targetContent)return 'preparing';
  if(stage.reviewCount===0)return 'ready';
  return 'studying';
}
export function curriculumProgress(
  cards: Flashcard[],
  input: LearningEvent[],
  now = Date.now(),
  manualStage = 1,
) {
  const events = [...new Map(input.map((e) => [e.id, e])).values()].filter(
    (e) => Date.parse(e.at) <= now,
  );
  const classified = cards.map((card) => ({
    card,
    meta: readSituation(card.front, card.back)?.pedagogy,
  }));
  const manualFloor = Math.max(1, Math.min(CURRICULUM.length, manualStage));
  let unlocked = true;
  const units = CURRICULUM.map((unit) => {
    const members = classified
      .filter((x) => x.meta && unitKey(x.meta) === unitKey(unit))
      .map((x) => x.card);
    const ids = new Set(members.map((c) => c.id));
    const history = events.filter((e) => ids.has(e.cardId));
    const metrics = measureUnit(members, history, now);
    // Reconstruct earned access from dated evidence, including the cohort present then.
    // Later forgetting or adding a new batch does not revoke previously earned access.
    const checkpoints = [
      ...new Set(
        history
          .filter((e) => e.rating === "good" || e.rating === "easy")
          .map((e) => Date.parse(e.at)),
      ),
    ].sort((a, b) => a - b);
    const first = checkpoints[0] || now;
    const earned =
      metrics.ready ||
      checkpoints.some(
        (time) =>
          time - first >= 2 * DAY &&
          measureUnit(
            members.filter((c) => Date.parse(c.createdAt) <= time),
            history,
            time,
          ).ready,
      );
    const isUnlocked = unlocked || unit.stage <= manualFloor;
    const result = {
      ...unit,
      ...metrics,
      unlocked: isUnlocked,
      earned: isUnlocked && earned,
      manuallyCompleted: unit.stage < manualFloor,
    };
    // A manual jump bypasses only earlier gates; progress after the selected
    // stage still has to be earned normally.
    unlocked = unit.stage < manualFloor ? true : isUnlocked && earned;
    return result;
  });
  const current = units.find((u) => u.stage >= manualFloor && u.unlocked && !u.earned) || units.at(-1)!;
  return {
    units,
    current,
    complete: units.every((u) => u.earned),
    legacy: classified.filter((x) => !x.meta).length,
  };
}

export function mixedCurriculumQueue(
  cards: Flashcard[],
  events: LearningEvent[],
  now = Date.now(),
  limit = 30,
  manualStage = 1,
): Flashcard[] {
  const progress = curriculumProgress(cards, events, now, manualStage);
  const unlocked = new Set(
    progress.units.filter((u) => u.unlocked).map(unitKey),
  );
  const pools: Flashcard[][] = [[], [], []];
  for (const card of cards) {
    const meta = readSituation(card.front, card.back)?.pedagogy;
    if (
      !meta ||
      !unlocked.has(unitKey(meta)) ||
      (card.status !== "new" && Date.parse(card.dueDate) > now)
    )
      continue;
    const age = progress.current.stage - meta.stage;
    pools[age <= 0 ? 0 : age <= 2 ? 1 : 2].push(card);
  }
  // Overdue/failed material leads each pool. The 55/25/20 cycle fills shortages.
  pools.forEach((pool) =>
    pool.sort(
      (a, b) =>
        Number(a.status === "new") - Number(b.status === "new") ||
        Date.parse(a.dueDate) - Date.parse(b.dueDate),
    ),
  );
  const pattern = [0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 0, 1, 0, 2, 0, 1, 0, 2, 0],
    result: Flashcard[] = [];
  while (result.length < limit && pools.some((p) => p.length)) {
    const wanted = pattern[result.length % pattern.length];
    const pool = pools[wanted].length
      ? pools[wanted]
      : pools.find((p) => p.length)!;
    result.push(pool.shift()!);
  }
  return result;
}
