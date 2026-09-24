import { cloudMediaUrl } from './cloud-media';

// Explicit per-file downloads only. The service worker never writes this cache.
export const SAVED_AUDIO_CACHE = 'revystudy-saved-audio-v1';
export const AUDIO_SAVED_EVENT = 'revystudy:audio-saved';
const pending = new Map<string, Promise<void>>();
// Supply a specific media type when storage returned a generic one.
const AUDIO_TYPES: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac', caf: 'audio/x-caf' };
export function audioMimeType(src: string, declared = ''): string {
  if (/^(audio|video)\//i.test(declared)) return declared;
  let ext = '';
  try { ext = new URL(src).pathname.split('.').pop()?.toLowerCase() ?? ''; } catch { /* relative URL */ }
  return AUDIO_TYPES[ext] || 'audio/mpeg';
}
const typed = (blob: Blob, src: string) => { const type = audioMimeType(src, blob.type); return blob.type === type ? blob : new Blob([blob], { type }); };
export const isRemoteAudio = (src: string) => /^https?:\/\//i.test(src);
export function audioKey(src: string): string {
  const url = new URL(src);
  url.searchParams.delete('revystudy_download');
  return url.href;
}
export async function readSavedAudio(src: string): Promise<Blob | null> {
  if (!('caches' in globalThis)) throw new Error('O navegador não disponibilizou armazenamento para áudio.');
  const response = await (await caches.open(SAVED_AUDIO_CACHE)).match(audioKey(src));
  if (!response || response.status !== 200 || response.type === 'opaque') return null;
  const blob = await response.blob();
  return blob.size ? typed(blob, src) : null;
}
export function downloadAudio(src: string): Promise<void> {
  const key = audioKey(src);
  const existing = pending.get(key);
  if (existing) return existing;
  const task = (async () => {
    if (await readSavedAudio(src)) return;
    if (!navigator.onLine) throw new Error('Conecte-se à internet para baixar este áudio.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(cloudMediaUrl(src), { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal });
      if (response.status !== 200 || response.type === 'opaque') throw new Error('Não foi possível baixar o áudio completo.');
      const raw = await response.blob();
      if (!raw.size || /text\/html|application\/(json|xml)/i.test(raw.type)) throw new Error('O servidor não retornou um arquivo de áudio válido.');
      const blob = typed(raw, src);
      await (await caches.open(SAVED_AUDIO_CACHE)).put(key, new Response(blob, { headers: { 'Content-Type': blob.type } }));
      // Never report success before the persistent write has finished.
      window.dispatchEvent(new CustomEvent(AUDIO_SAVED_EVENT, { detail: key }));
      void navigator.storage?.persist?.().catch(() => false);
    } finally { clearTimeout(timeout); }
  })().finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
