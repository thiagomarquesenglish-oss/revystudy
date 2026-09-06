import { describe, expect, it } from 'vitest';
import { buildSituationHtml, readSituation, translationSupportLevel } from '@/lib/situation';

describe('learning situations', () => {
  it('stores reusable fields safely and reads them back', () => {
    const source = { english: 'This is <safe>', context: 'At home', portuguese: 'Em casa', mediaHtml: '<img src="data:image/png;base64,x">' };
    const html = buildSituationHtml(source);
    expect(html.back).not.toContain('This is <safe>');
    expect(readSituation(html.front, html.back)).toEqual(source);
  });
  it('removes Portuguese support progressively', () => {
    expect(translationSupportLevel(0)).toBe('visible');
    expect(translationSupportLevel(3)).toBe('hint');
    expect(translationSupportLevel(6)).toBe('reference');
  });
});
