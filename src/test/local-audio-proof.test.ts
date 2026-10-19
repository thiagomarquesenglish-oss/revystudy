import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkLocalAudioWorker, clearAudioSamples, installAudioSample, loadAudioSamples, LOCAL_AUDIO_CACHE, selectAudioSamples } from '@/lib/local-audio-proof';
import type { Flashcard } from '@/lib/types';

const mp3 = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0, 255, 251, 90, 255]);
const sample = { source: 'https://example.com/voice.mp3', label: 'Try again.', cardId: 'card-1' };
let files: Map<string, Response>;
let cache: { match: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

beforeEach(() => {
  localStorage.clear(); files = new Map();
  vi.stubGlobal('crypto', webcrypto);
  cache = {
    match: vi.fn(async (url: string) => files.get(url)?.clone()),
    put: vi.fn(async (url: string, response: Response) => { files.set(url, response.clone()); }),
    delete: vi.fn(async (url: string) => files.delete(url)),
  };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(mp3.length) } })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('persists exact compressed MP3 bytes, verifies the readback and reuses them without another download', async () => {
  const entry = await installAudioSample('user-1', sample);
  expect(caches.open).toHaveBeenCalledWith(LOCAL_AUDIO_CACHE);
  expect(entry.localUrl).toMatch(/^\/__local_audio\/v1\/user-1\/[a-f0-9]{64}\.mp3$/);
  expect(new Uint8Array(await files.values().next().value!.clone().arrayBuffer())).toEqual(mp3);
  expect(loadAudioSamples('user-1')).toEqual([entry]);
  expect(loadAudioSamples('another-user')).toEqual([]);
  expect(await installAudioSample('user-1', sample)).toEqual(entry);
  expect(fetch).toHaveBeenCalledOnce();
});

it('does not advertise installation if persistent bytes differ from the download', async () => {
  cache.match.mockImplementation(async () => new Response('corrupted'));
  await expect(installAudioSample('user-1', sample)).rejects.toThrow('conferir');
  expect(loadAudioSamples('user-1')).toEqual([]);
  expect(cache.delete).toHaveBeenCalledOnce();
});

it.each([
  () => new Response(mp3, { status: 206 }),
  () => new Response('<html>error</html>'),
  () => new Response(mp3, { headers: { 'Content-Length': '1000' } }),
  () => new Response(new Uint8Array()),
])('rejects partial, non-audio, truncated or empty downloads', async create => {
  vi.mocked(fetch).mockResolvedValue(create());
  await expect(installAudioSample('user-1', sample)).rejects.toThrow();
  expect(loadAudioSamples('user-1')).toEqual([]);
  expect(cache.put).not.toHaveBeenCalled();
});

it('repairs an evicted file and only clears this user’s experimental files', async () => {
  const one = await installAudioSample('user-1', sample);
  await installAudioSample('user-2', sample);
  files.delete(new URL(one.localUrl, location.origin).href);
  await installAudioSample('user-1', sample);
  expect(fetch).toHaveBeenCalledTimes(3);
  await clearAudioSamples('user-1');
  expect(loadAudioSamples('user-1')).toEqual([]);
  expect(loadAudioSamples('user-2')).toHaveLength(1);
  expect(files.size).toBe(1);
});

it('requires the active local service worker before claiming this test is available', async () => {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: {} } });
  await expect(checkLocalAudioWorker()).rejects.toThrow('serviço antigo');
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404, headers: { 'X-Revy-Local-Audio': 'v1' } }));
  await expect(checkLocalAudioWorker()).resolves.toBeUndefined();
});

it('selects at most five distinct MP3 sources, including the oldest and newest cards', () => {
  const cards = Array.from({length:10}, (_, i) => ({id:`card-${i}`,createdAt:`2026-10-${10+i}`,front:`<p>Sentence ${i}</p>`,back:`<audio src="https://example.com/${i}.mp3"></audio>`})) as Flashcard[];
  const samples = selectAudioSamples(cards);
  expect(samples).toHaveLength(5);
  expect(samples.some(item => item.cardId === 'card-0')).toBe(true);
  expect(samples.some(item => item.cardId === 'card-9')).toBe(true);
  expect(new Set(samples.map(item => item.source)).size).toBe(5);
});
