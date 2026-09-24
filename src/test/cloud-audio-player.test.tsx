import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CloudAudioPlayer from '@/components/CloudAudioPlayer';
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('starts the cloud URL synchronously on tap, without local storage or decoding', () => {
  const open = vi.fn(); vi.stubGlobal('caches', { open });
  const { container } = render(<CloudAudioPlayer src="https://example.com/a.mp3" autoPlay={false} />);
  const audio = container.querySelector('audio')!;
  expect(new URL(audio.src).searchParams.get('revystudy_download')).toBeTruthy();
  expect(audio.preload).toBe('none');
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();
  fireEvent.playing(audio);
  expect(screen.getByRole('button', { name: 'Pausar áudio' })).toBeInTheDocument();
});
it('leaves manual playback available when iOS refuses autoplay', async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('gesture', 'NotAllowedError'));
  render(<CloudAudioPlayer src="https://example.com/b.mp3" />);
  await act(async () => {});
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
});
it('times out a stalled stream and retries directly from the cloud', async () => {
  vi.useFakeTimers();
  vi.mocked(HTMLMediaElement.prototype.play).mockReturnValue(new Promise(() => {}));
  const { container } = render(<CloudAudioPlayer src="https://example.com/c.mp3" autoPlay={false} />);
  const first = container.querySelector('audio')!.src;
  fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(screen.getByRole('alert')).toHaveTextContent('A nuvem não respondeu a tempo');
  fireEvent.click(screen.getByText('Tentar novamente'));
  expect(container.querySelector('audio')!.src).not.toBe(first);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
});
it('stops the previous side and ignores its late rejection after a card change', async () => {
  let reject!: (reason: unknown) => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(new Promise((_, no) => { reject = no; }));
  const view = render(<CloudAudioPlayer src="https://example.com/old.mp3" />);
  view.rerender(<CloudAudioPlayer src="https://example.com/new.mp3" autoPlay={false} />);
  await act(async () => { reject(new Error('old')); });
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
});
