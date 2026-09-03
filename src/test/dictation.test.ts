import { describe, expect, it } from 'vitest';
import { compareDictation, dictationAudioSource } from '@/lib/dictation';

describe('dictation comparison', () => {
  it('accepts casing, curly apostrophes, extra spaces and final punctuation', () => {
    expect(compareDictation("I'm hungry.", '  I’m   HUNGRY!  ').correct).toBe(true);
  });
  it('does not accept different words or silently expand contractions', () => {
    expect(compareDictation("I'm hungry", 'I am hungry').correct).toBe(false);
    expect(compareDictation("I'm hungry", "I'm angry").words).toContainEqual({ expected: 'hungry', typed: 'angry', kind: 'replace' });
  });
  it('aligns missing and extra words without shifting the whole sentence', () => {
    expect(compareDictation('I am very hungry', 'I am hungry').words).toContainEqual({ expected: 'very', kind: 'missing' });
    expect(compareDictation('I am hungry', 'I am very hungry').words).toContainEqual({ typed: 'very', kind: 'extra' });
  });
  it('rejects empty answers', () => {
    expect(compareDictation('', '').correct).toBe(false);
    expect(compareDictation('Hello', '').correct).toBe(false);
  });
});

describe('dictation audio extraction', () => {
  it('supports embedded audio, source nodes and editor metadata', () => {
    expect(dictationAudioSource('<audio src="https://example.com/a.mp3"></audio>')).toBe('https://example.com/a.mp3');
    expect(dictationAudioSource('<audio><source src="https://example.com/b.mp3"></audio>')).toBe('https://example.com/b.mp3');
    expect(dictationAudioSource('<div data-audio data-src="data:audio/mpeg;base64,SUQz"></div>')).toBe('data:audio/mpeg;base64,SUQz');
  });
  it('excludes cards with only images or unusable audio sources', () => {
    expect(dictationAudioSource('<img src="answer.png">')).toBeNull();
    expect(dictationAudioSource('<audio src="javascript:alert(1)"></audio>')).toBeNull();
  });
});
