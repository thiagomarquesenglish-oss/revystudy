import { supabase } from '@/integrations/supabase/client';
import { localDB } from './offline-db';

export const OFFLINE_MEDIA_CACHE = 'revystudy-media-v1';
const PREF_KEY = 'revystudy:offline-media-enabled';

type CardRow = { front?: string; back?: string };
type AudioRow = { file_path?: string };
export type MediaDownloadProgress = { completed: number; total: number; label: string };

export function offlineMediaEnabled(): boolean {
  try { return localStorage.getItem(PREF_KEY) === 'true'; } catch { return false; }
}

export function setOfflineMediaEnabled(enabled: boolean): void {
  try { localStorage.setItem(PREF_KEY, String(enabled)); } catch { /* private mode */ }
}

function urlsFromHtml(html = ''): string[] {
  const root = document.createElement('div');
  root.innerHTML = html;
  return Array.from(root.querySelectorAll('img[src],audio[src],[data-audio][data-src]'))
    .map(node => node.getAttribute('src') || node.getAttribute('data-src') || '')
    .filter(url => /^https:\/\//i.test(url));
}

export function collectMediaUrls(cards: CardRow[], audios: AudioRow[]): string[] {
  const urls = new Set<string>();
  for (const card of cards) {
    for (const url of [...urlsFromHtml(card.front), ...urlsFromHtml(card.back)]) urls.add(url);
  }
  for (const audio of audios) {
    if (!audio.file_path) continue;
    urls.add(supabase.storage.from('deck-audios').getPublicUrl(audio.file_path).data.publicUrl);
  }
  return [...urls];
}

async function ensureCapacity(): Promise<void> {
  const estimate = await navigator.storage?.estimate?.();
  if (estimate?.usage && estimate?.quota && estimate.usage / estimate.quota > 0.88) {
    throw new Error('O armazenamento deste aparelho está quase cheio. Libere espaço antes de baixar as mídias.');
  }
}

export async function cacheMediaUrls(urls: string[], onProgress?: (progress: MediaDownloadProgress) => void): Promise<number> {
  if (!('caches' in window)) throw new Error('Este navegador não permite armazenamento offline de mídias.');
  await navigator.storage?.persist?.().catch(() => false);
  await ensureCapacity();
  const unique = [...new Set(urls)];
  const cache = await caches.open(OFFLINE_MEDIA_CACHE);
  let completed = 0;
  for (const url of unique) {
    onProgress?.({ completed, total: unique.length, label: `Salvando mídias no aparelho (${completed}/${unique.length})` });
    if (!(await cache.match(url))) {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok && response.type !== 'opaque') throw new Error('Não foi possível baixar uma das mídias. Tente novamente com uma conexão estável.');
      await cache.put(url, response);
    }
    completed += 1;
    if (completed % 10 === 0) await ensureCapacity();
  }
  onProgress?.({ completed, total: unique.length, label: `${completed} mídias salvas no aparelho` });
  return completed;
}

export async function cacheDeckMedia(cards: CardRow[], audios: AudioRow[], onProgress?: (progress: MediaDownloadProgress) => void): Promise<number> {
  return cacheMediaUrls(collectMediaUrls(cards, audios), onProgress);
}

export async function cacheAllLocalMedia(onProgress?: (progress: MediaDownloadProgress) => void): Promise<number> {
  const cards = await localDB.getCards();
  const decks = await localDB.getDecks();
  const audioGroups = await Promise.all(decks.map(deck => localDB.getDeckAudios(deck.id)));
  return cacheDeckMedia(cards, audioGroups.flat(), onProgress);
}

export async function offlineMediaCount(): Promise<number> {
  if (!('caches' in window)) return 0;
  return (await (await caches.open(OFFLINE_MEDIA_CACHE)).keys()).length;
}

export async function clearOfflineMedia(): Promise<void> {
  if ('caches' in window) await caches.delete(OFFLINE_MEDIA_CACHE);
}
