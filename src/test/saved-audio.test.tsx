import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import SavedAudioPlayer from '@/components/SavedAudioPlayer';
import { audioMimeType, downloadAudio, extractAudioSrcs, prefetchAudios, readSavedAudio, SAVED_AUDIO_CACHE } from '@/lib/saved-audio';
let entries: Map<string, Response>;
beforeEach(() => {
  entries = new Map();
  vi.stubGlobal('caches', { open: vi.fn(async (name: string) => {
    expect(name).toBe(SAVED_AUDIO_CACHE);
    return { match: async (key: string) => entries.get(key)?.clone(), put: async (key: string, response: Response) => { entries.set(key, response.clone()); } };
  }) });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('audio-bytes', { headers: { 'Content-Type': 'audio/mpeg' } })));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:saved') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('downloads only on tap, then reuses the saved file after reopening offline', async () => {
  const src = 'https://example.com/audio.mp3';
  const view = render(<SavedAudioPlayer src={src} />);
  const download = await screen.findByRole('button', { name: 'Baixar áudio' });
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(download);
  await screen.findByRole('button', { name: 'Reproduzir áudio' });
  expect(fetch).toHaveBeenCalledOnce();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  view.unmount();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  render(<SavedAudioPlayer src={src} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reproduzir áudio' }));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledOnce();
  expect(document.querySelector('audio')!.src).toBe('blob:saved');
});
it('shares one download across duplicate players and repeated calls', async () => {
  render(<><SavedAudioPlayer src="https://example.com/shared.mp3" /><SavedAudioPlayer src="https://example.com/shared.mp3" /></>);
  await screen.findAllByRole('button', { name: 'Baixar áudio' });
  await act(async () => { await Promise.all([downloadAudio('https://example.com/shared.mp3'), downloadAudio('https://example.com/shared.mp3')]); });
  expect(await screen.findAllByRole('button', { name: 'Reproduzir áudio' })).toHaveLength(2);
  await downloadAudio('https://example.com/shared.mp3');
  expect(fetch).toHaveBeenCalledOnce();
});
it('does not mark a failed download as saved', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('error', { status: 500 }));
  await expect(downloadAudio('https://example.com/failure.mp3')).rejects.toThrow();
  expect(await readSavedAudio('https://example.com/failure.mp3')).toBeNull();
});
it('gives iOS a real audio type when the server sends octet-stream or nothing', async () => {
  expect(audioMimeType('https://x.co/a.m4a', 'application/octet-stream')).toBe('audio/mp4');
  expect(audioMimeType('https://x.co/a.mp3', '')).toBe('audio/mpeg');
  expect(audioMimeType('https://x.co/a.mp3', 'audio/x-m4a')).toBe('audio/x-m4a');
  vi.mocked(fetch).mockResolvedValue(new Response('audio-bytes', { headers: { 'Content-Type': 'application/octet-stream' } }));
  await downloadAudio('https://example.com/voice.m4a');
  expect((await readSavedAudio('https://example.com/voice.m4a'))!.type).toBe('audio/mp4');
});
it('repairs the type of a previously saved audio without downloading again', async () => {
  entries.set('https://example.com/old.m4a', new Response('audio-bytes', { headers: { 'Content-Type': 'application/octet-stream' } }));
  expect((await readSavedAudio('https://example.com/old.m4a'))!.type).toBe('audio/mp4');
  expect(fetch).not.toHaveBeenCalled();
});
it('extracts remote audio urls from card html and ignores local ones', () => {
  const html = '<p>x</p><div data-audio data-src="https://e.co/a.mp3"></div><audio><source src="https://e.co/b.m4a"></audio><audio src="blob:local"></audio>';
  expect(extractAudioSrcs(html)).toEqual(['https://e.co/a.mp3', 'https://e.co/b.m4a']);
  expect(extractAudioSrcs('<p>no audio</p>')).toEqual([]);
});
it('prefetches every audio once, skips saved ones, and survives a failure', async () => {
  const urls = ['https://e.co/1.mp3', 'https://e.co/2.mp3', 'https://e.co/2.mp3', 'https://e.co/bad.mp3', 'blob:skip'];
  vi.mocked(fetch).mockImplementation(async (input: any) => String(input).includes('bad') ? new Response('x', { status: 500 }) : new Response('audio-bytes', { headers: { 'Content-Type': 'audio/mpeg' } }));
  const result = await prefetchAudios(urls);
  expect(result).toEqual({ total: 3, failed: 1 });
  expect(fetch).toHaveBeenCalledTimes(3);
  await prefetchAudios(urls);
  expect(fetch).toHaveBeenCalledTimes(4); // only the failed one is retried
});
it('automatically reloads a stuck first play instead of showing an error', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const src = 'https://example.com/stuck.mp3';
  await downloadAudio(src);
  render(<SavedAudioPlayer src={src} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reproduzir áudio' }));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
  vi.useRealTimers();
});
