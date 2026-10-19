import { cloudMediaUrl } from './cloud-media';
import { extractAudioSrcs } from './saved-audio';
import { readSituation } from './situation';
import type { Flashcard } from './types';

export const LOCAL_AUDIO_CACHE = 'revystudy-local-audio-proof-v1';
export const LOCAL_AUDIO_PREFIX = '/__local_audio/v1/';
const keyFor = (userId: string) => `revystudy:local-audio-proof:${userId}`;
const MAX_BYTES = 5 * 1024 * 1024;
export type LocalAudioSample = { source: string; label: string; cardId: string };
export type InstalledAudioSample = LocalAudioSample & { localUrl: string; hash: string; bytes: number; installedAt: string };

export function selectAudioSamples(cards: Flashcard[]): LocalAudioSample[] {
  const sorted = [...cards].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const sources = new Set<string>();
  const found: LocalAudioSample[] = [];
  for (const card of sorted) {
    const situation = readSituation(card.front, card.back);
    const doc = new DOMParser().parseFromString(card.front, 'text/html');
    const label = (situation?.english || card.dictationAnswer || doc.body.textContent || 'Áudio do cartão').trim().slice(0, 100);
    for (const raw of [...extractAudioSrcs(card.front), ...extractAudioSrcs(card.back)]) {
      const source = cloudMediaUrl(raw);
      if (!/\.mp3$/i.test(new URL(source).pathname) || sources.has(source)) continue;
      sources.add(source); found.push({ source, label, cardId: card.id });
    }
  }
  // Mix older and newer uploads, rather than testing five versions of one card.
  return [...new Set([0, found.length - 1, Math.floor(found.length / 2), 1, found.length - 2])]
    .map(index => found[index]).filter((item): item is LocalAudioSample => !!item).slice(0, 5);
}

export function loadAudioSamples(userId: string): InstalledAudioSample[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(keyFor(userId)) || '[]');
    return Array.isArray(value) ? value.filter((item): item is InstalledAudioSample =>
      !!item && /^[a-f0-9]{64}$/.test(item.hash) && Number.isSafeInteger(item.bytes) && item.bytes > 0 &&
      item.localUrl === `${LOCAL_AUDIO_PREFIX}${encodeURIComponent(userId)}/${item.hash}.mp3` &&
      typeof item.label === 'string' && typeof item.source === 'string') : [];
  } catch { return []; }
}

export async function checkLocalAudioWorker(): Promise<void> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller || !('caches' in globalThis)) {
    throw new Error('Atualize o aplicativo e reabra para ativar o teste de áudio local.');
  }
  const response = await fetch(`${LOCAL_AUDIO_PREFIX}probe`, { method: 'HEAD', cache: 'no-store' });
  if (response.headers.get('X-Revy-Local-Audio') !== 'v1') {
    throw new Error('O aplicativo ainda está com o serviço antigo. Use Atualizar aplicativo e reabra.');
  }
}

const digest = async (bytes: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');

/** A download is installed only after a byte-for-byte persistent readback. */
export async function installAudioSample(userId: string, sample: LocalAudioSample, signal?: AbortSignal): Promise<InstalledAudioSample> {
  const cache = await caches.open(LOCAL_AUDIO_CACHE);
  const old = loadAudioSamples(userId).find(entry => entry.source === sample.source);
  if (old) {
    const saved = await cache.match(new URL(old.localUrl, location.origin).href);
    if (saved && await digest(await saved.arrayBuffer()) === old.hash) return old;
  }
  const response = await fetch(cloudMediaUrl(sample.source), { credentials: 'omit', mode: 'cors', cache: 'default', signal });
  if (response.status !== 200 || response.type === 'opaque') throw new Error('O download não retornou o áudio completo.');
  const length = Number(response.headers.get('Content-Length'));
  if (length > MAX_BYTES) throw new Error('Este teste aceita áudios curtos de até 5 MB.');
  const bytes = await response.arrayBuffer();
  if (signal?.aborted) throw new Error('Download cancelado.');
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES || (length > 0 && length !== bytes.byteLength)) throw new Error('O arquivo chegou vazio, incompleto ou grande demais para este teste.');
  const head = new Uint8Array(bytes);
  const id3 = head[0] === 73 && head[1] === 68 && head[2] === 51;
  const frame = head[0] === 255 && (head[1] & 224) === 224;
  if (!id3 && !frame) throw new Error('O arquivo recebido não foi identificado como MP3.');
  const hash = await digest(bytes);
  const localUrl = `${LOCAL_AUDIO_PREFIX}${encodeURIComponent(userId)}/${hash}.mp3`;
  const cacheUrl = new URL(localUrl, location.origin).href;
  await cache.put(cacheUrl, new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(bytes.byteLength) } }));
  const saved = await cache.match(cacheUrl);
  if (!saved || await digest(await saved.arrayBuffer()) !== hash) {
    await cache.delete(cacheUrl);
    throw new Error('Não foi possível conferir o arquivo gravado no aparelho.');
  }
  const entry = { ...sample, localUrl, hash, bytes: bytes.byteLength, installedAt: new Date().toISOString() };
  const entries = loadAudioSamples(userId).filter(item => item.source !== sample.source);
  localStorage.setItem(keyFor(userId), JSON.stringify([...entries, entry]));
  return entry;
}

export async function clearAudioSamples(userId: string): Promise<void> {
  const cache = await caches.open(LOCAL_AUDIO_CACHE);
  for (const entry of loadAudioSamples(userId)) await cache.delete(new URL(entry.localUrl, location.origin).href);
  localStorage.removeItem(keyFor(userId));
}
