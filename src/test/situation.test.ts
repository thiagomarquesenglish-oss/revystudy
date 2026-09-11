import { describe, expect, it } from 'vitest';
import { buildImageGenerationPrompt, buildSituationHtml, readSituation, translationSupportLevel } from '@/lib/situation';

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
  it('builds a self-contained image request from every existing situation', () => {
    const prompt=buildImageGenerationPrompt({english:'She is a teacher.',context:'Identifique a profissão.',portuguese:'Ela é professora.',mediaHtml:'',pedagogy:{curriculum:'english-v1',stage:2,unit:1,goal:'Identificar pessoas e objetos',structures:['she is'],vocabulary:['teacher'],batchId:'b',contentId:'c',source:'external-ai',imagePrompt:'Uma professora, ilustração simples e realista.',audioText:'She is a teacher.',tags:[],difficulty:1}});
    expect(prompt).toContain('"english": "She is a teacher."');
    expect(prompt).toContain('âncora de identificação');
    expect(prompt).toContain('fotografia fotorrealista e cinematográfica');
    expect(prompt).not.toContain('ilustração simples');
  });
});
