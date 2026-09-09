import { expect, it } from 'vitest';
import { computeStreak, localStudyDate } from '@/lib/streak';
const history = (...dates: string[]) => dates.map(date => ({date, count:1}));
it('counts consecutive days, not repetitions', () => {
  expect(computeStreak(history('2026-09-06','2026-09-07','2026-09-08','2026-09-08'), new Date(2026,8,8))).toBe(3);
});
it('keeps yesterday until today ends, then resets after a missed day', () => {
  expect(computeStreak(history('2026-09-06','2026-09-07'), new Date(2026,8,8,23,59))).toBe(2);
  expect(computeStreak(history('2026-09-06','2026-09-07'), new Date(2026,8,9,0,0))).toBe(0);
  expect(computeStreak(history('2026-09-06','2026-09-07','2026-09-09'), new Date(2026,8,9))).toBe(1);
});
it('ignores zero activity and handles month/year boundaries', () => {
  expect(computeStreak([{date:'2026-09-08',count:0}],new Date(2026,8,8))).toBe(0);
  expect(computeStreak(history('2025-12-31','2026-01-01'),new Date(2026,0,1))).toBe(2);
  expect(localStudyDate(new Date(2026,8,8,23,59))).toBe('2026-09-08');
});
