import { supabase } from '@/integrations/supabase/client';
import { localDB } from './offline-db';

export const OFFLINE_MEDIA_CACHE = 'revystudy-media-v1';
const PREF_KEY = 'revystudy:offline-media-enabled';
const localObjectUrls = new Map<string, Promise<string>>();

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
  return Array.from(root.querySelectorAll('img[src],audio[src],audio source[src],[data-audio][data-src]'))
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

async function readableMedia(response?: Response): Promise<Blob | null> {
  if (!response || response.status !== 200 || response.type === 'opaque') return null;
  const blob = await response.blob();
  if (!blob.size || /text\/html|application\/json/i.test(blob.type)) return null;
  return blob;
}

async function downloadMedia(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    // no-store bypasses HTTP cache, NOT a CacheFirst service worker. A unique
    // URL also avoids opaque entries while an older worker still controls iOS.
    const downloadUrl = new URL(url);
    downloadUrl.searchParams.set('revystudy_download', crypto.randomUUID());
    const response = await fetch(downloadUrl.href, { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal });
    const blob = await readableMedia(response);
    if (!blob) throw new Error('O arquivo baixado está vazio ou incompleto. Baixe as mídias novamente.');
    return new Response(blob, { status: 200, headers: { 'Content-Type': blob.type || 'application/octet-stream' } });
  } finally { clearTimeout(timer); }
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
    if (!(await readableMedia(await cache.match(url)))) {
      await cache.put(url, await downloadMedia(url));
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

/** Return a blob URL backed by the downloaded file, bypassing mobile network/range requests. */
export function resolveOfflineMediaUrl(url: string): Promise<string> {
  if (!/^https:\/\//i.test(url)) return Promise.resolve(url);
  if (!('caches' in window)) return Promise.reject(new Error('O armazenamento local de áudio está indisponível neste navegador.'));
  const existing = localObjectUrls.get(url);
  if (existing) return existing;
  const resolved = caches.open(OFFLINE_MEDIA_CACHE)
    .then(async cache => {
      let blob = await readableMedia(await cache.match(url));
      if (!blob) {
        if (!navigator.onLine) throw new Error('Este áudio não está salvo neste aparelho. Conecte-se e baixe as mídias nos Ajustes.');
        const downloaded = await downloadMedia(url);
        await cache.put(url, downloaded.clone());
        blob = await downloaded.blob();
      }
      return URL.createObjectURL(blob);
    })
    .catch(error => { localObjectUrls.delete(url); throw error; });
  localObjectUrls.set(url, resolved);
  return resolved;
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
  for (const pending of localObjectUrls.values()) {
    const value = await pending.catch(() => '');
    if (value.startsWith('blob:')) URL.revokeObjectURL(value);
  }
  localObjectUrls.clear();
  if ('caches' in window) await caches.delete(OFFLINE_MEDIA_CACHE);
}
