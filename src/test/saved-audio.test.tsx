import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import SavedAudioPlayer from '@/components/SavedAudioPlayer';
import { AUDIO_SAVED_EVENT, audioKey, audioMimeType, downloadAudio, extractAudioSrcs, prefetchAudios, readSavedAudio, SAVED_AUDIO_CACHE } from '@/lib/saved-audio';
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
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
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
  vi.mocked(fetch).mockImplementation(async (input: any) => new URL(String(input)).pathname === '/bad.mp3' ? new Response('x', { status: 500 }) : new Response('audio-bytes', { headers: { 'Content-Type': 'audio/mpeg' } }));
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
it('recovers a non-paused stalled play and ignores the old promise aborted by reload', async () => {
  vi.useFakeTimers();
  let rejectFirst!: (error: Error) => void;
  vi.mocked(HTMLMediaElement.prototype.play)
    .mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectFirst = reject; }))
    .mockResolvedValue(undefined);
  render(<SavedAudioPlayer src="blob:local" />);
  const element = document.querySelector('audio')!;
  Object.defineProperty(element, 'paused', { configurable: true, value: false });
  Object.defineProperty(element, 'readyState', { configurable: true, value: 0 });
  fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
  vi.mocked(HTMLMediaElement.prototype.load).mockImplementation(() => rejectFirst(new DOMException('Reload', 'AbortError')));
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.playing(element);
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
});
it('stops after the deadline if recovery also stalls', async () => {
  vi.useFakeTimers();
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => new Promise<void>(() => {}));
  render(<SavedAudioPlayer src="blob:local" />);
  Object.defineProperty(document.querySelector('audio')!, 'paused', { configurable: true, value: false });
  fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('alert')).toHaveTextContent('O áudio salvo não iniciou');
});
it('does not retry after the user stops waiting', async () => {
  vi.useFakeTimers();
  render(<SavedAudioPlayer src="blob:local" />);
  fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pausar áudio' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('alert')).toBeNull();
});
it('materializes saved bytes without passing the cache blob to the player or rewriting it', async () => {
  const original = new Uint8Array([73, 68, 51, 4, 0, 255, 251, 144, 196]);
  const arrayBuffer = vi.fn(async () => original.buffer);
  const blob = vi.fn(() => { throw new Error('Do not expose cache-backed blob'); });
  const put = vi.fn();
  vi.mocked(caches.open).mockResolvedValue({
    match: async () => ({ status: 200, type: 'basic', headers: new Headers({ 'Content-Type': 'audio/mpeg' }), arrayBuffer, blob }), put,
  } as unknown as Cache);
  const saved = await readSavedAudio('https://example.com/memory.mp3');
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(saved!);
  });
  expect(new Uint8Array(bytes)).toEqual(original);
  expect(saved?.type).toBe('audio/mpeg');
  expect(arrayBuffer).toHaveBeenCalledOnce();
  expect(blob).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it('does not revoke a prepared source on duplicate saved events', async () => {
  const src = 'https://example.com/duplicate.mp3';
  await downloadAudio(src);
  const view = render(<SavedAudioPlayer src={src} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reproduzir áudio' }));
  await act(async () => {
    window.dispatchEvent(new CustomEvent(AUDIO_SAVED_EVENT, { detail: audioKey(src) }));
    window.dispatchEvent(new CustomEvent(AUDIO_SAVED_EVENT, { detail: audioKey(src) }));
  });
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
it('does not abort an active initial load when the user taps play', () => {
  render(<SavedAudioPlayer src="blob:local" />);
  Object.defineProperty(document.querySelector('audio')!, 'networkState', { configurable: true, value: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
  expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
});
