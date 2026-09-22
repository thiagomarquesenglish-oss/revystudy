import type { Flashcard } from './types';
export const mediaFilters = [
  ['all','Todas as mídias'], ['no-image','Sem imagem'], ['no-audio','Sem áudio'],
  ['text-only','Sem imagem nem áudio'], ['has-image','Com imagem'], ['has-audio','Com áudio'],
] as const;
export type CardMediaFilter = typeof mediaFilters[number][0];
export function matchesCardMedia(card: Pick<Flashcard,'front'|'back'|'audioId'>, filter: CardMediaFilter) {
  if (filter === 'all') return true;
  const root = document.createElement('div'); root.innerHTML = card.front + card.back;
  const present = (selector: string) => [...root.querySelectorAll(selector)].some(node =>
    !!(node.getAttribute('src')?.trim() || node.getAttribute('srcset')?.trim() || node.getAttribute('data-src')?.trim() || node.hasAttribute('data-embedded-media')));
  const image = present('img, picture source');
  const audio = !!card.audioId || present('audio, audio source, [data-audio]');
  return filter === 'no-image' ? !image : filter === 'no-audio' ? !audio : filter === 'text-only' ? !image && !audio : filter === 'has-image' ? image : audio;
}
