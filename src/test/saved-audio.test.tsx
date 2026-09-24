import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import SavedAudioPlayer from '@/components/SavedAudioPlayer';
import { downloadAudio, readSavedAudio, SAVED_AUDIO_CACHE } from '@/lib/saved-audio';
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
