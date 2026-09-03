import { describe, expect, it, beforeEach } from 'vitest';
import { dueDictation, progressFor, readDictationHistory, saveDictationHistory, scheduleDictation, shuffleDictation } from '@/lib/dictation-srs';
import type { Flashcard } from '@/lib/types';
const card = { id: 'one', dictationAnswer: 'Hello' } as Flashcard;
beforeEach(() => localStorage.clear());
describe('dictation spaced repetition', () => {
  it('repeats mistakes in ten minutes and grows successful intervals', () => {
    const failed = scheduleDictation(undefined, 'Hello', 'again', 1000);
    expect(failed.due).toBe(601000);
    const good = scheduleDictation(undefined, 'Hello', 'good', 1000);
    expect(good.interval).toBe(1);
    expect(scheduleDictation(good, 'Hello', 'good', 1000).interval).toBe(2);
    expect(scheduleDictation(good, 'Hello', 'easy', 1000).interval).toBe(4);
    expect(scheduleDictation(good, 'Hello', 'hard', 1000).interval).toBe(1);
    expect(scheduleDictation(good, 'Hello', 'again', 1000).interval).toBe(0);
  });
  it('selects due and new phrases and resets changed answers', () => {
    const history = { one: scheduleDictation(undefined, 'Hello', 'good', 1000) };
    expect(dueDictation([{ card }], history, 2000)).toEqual([]);
    expect(dueDictation([{ card }], history, history.one.due)).toHaveLength(1);
    expect(progressFor({ ...card, dictationAnswer: 'Goodbye' }, history)).toBeUndefined();
    expect(dueDictation([{ card: { ...card, id: 'two' } }], history, 2000)).toHaveLength(1);
  });
  it('persists progress separately for each account and deck', () => {
    const history = { one: scheduleDictation(undefined, 'Hello', 'hard', 1000) };
    saveDictationHistory('user', 'deck', history);
    expect(readDictationHistory('user', 'deck')).toEqual(history);
    expect(readDictationHistory('other', 'deck')).toEqual({});
    expect(readDictationHistory('user', 'other')).toEqual({});
  });
  it('shuffles without changing or losing the source items', () => {
    const source = [1, 2, 3, 4];
    const shuffled = shuffleDictation(source, () => 0);
    expect(shuffled).not.toEqual(source);
    expect([...shuffled].sort()).toEqual(source);
    expect(source).toEqual([1, 2, 3, 4]);
  });
});
