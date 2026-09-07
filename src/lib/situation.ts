import { pedagogySchema, type Pedagogy } from './curriculum';
export interface SituationContent { english: string; context: string; portuguese: string; mediaHtml: string; pedagogy?: Pedagogy }
export const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function buildSituationHtml(content: SituationContent) {
  const metadata = content.pedagogy ? ` data-learning="${escapeHtml(JSON.stringify(pedagogySchema.parse(content.pedagogy)))}"` : '';
  const front = `<div data-situation="true"${metadata}><div data-context-en>${escapeHtml(content.context)}</div><div data-situation-media>${content.mediaHtml}</div></div>`;
  const back = `<div data-situation-answer><p data-answer-en lang="en">${escapeHtml(content.english)}</p>${content.portuguese ? `<p data-translation-pt lang="pt">${escapeHtml(content.portuguese)}</p>` : ''}</div>`;
  return { front, back };
}
export function readSituation(front: string, back: string): SituationContent | null {
  const root = document.createElement('div'); root.innerHTML = front + back;
  if (!root.querySelector('[data-situation]')) return null;
  let pedagogy: Pedagogy | undefined;
  try { const result=pedagogySchema.safeParse(JSON.parse(root.querySelector('[data-learning]')?.getAttribute('data-learning') || 'null')); if(result.success)pedagogy=result.data as Pedagogy; } catch { /* Legacy content remains usable. */ }
  return {
    ...(pedagogy ? {pedagogy} : {}),
    english: root.querySelector('[data-answer-en]')?.textContent?.trim() || '',
    context: root.querySelector('[data-context-en]')?.textContent?.trim() || '',
    portuguese: root.querySelector('[data-translation-pt]')?.textContent?.trim() || '',
    mediaHtml: root.querySelector('[data-situation-media]')?.innerHTML || '',
  };
}
export function translationSupportLevel(reviewCount: number) { return reviewCount < 3 ? 'visible' : reviewCount < 6 ? 'hint' : 'reference'; }
