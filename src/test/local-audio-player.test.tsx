import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@/lib/offline-media', () => ({ resolveOfflineMediaUrl: mocks.resolve }));
import LocalAudioPlayer from '@/components/LocalAudioPlayer';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('prepares local bytes first, then calls play synchronously inside the tap without reloading', async () => {
  let finish!: (url: string) => void;
  mocks.resolve.mockReturnValue(new Promise<string>(resolve => { finish = resolve; }));
  let inTap = false;
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    expect(inTap).toBe(true);
    expect(this.getAttribute('src')).toBe('blob:downloaded');
    return Promise.resolve();
  });
  render(<LocalAudioPlayer src="https://cdn.test/a.mp3" autoPlay={false} />);
  expect(screen.getByRole('button', { name: 'Preparando áudio local' })).toBeDisabled();
  await act(async () => { finish('blob:downloaded'); });
  inTap = true;
  fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
  inTap = false;
  expect(play).toHaveBeenCalledTimes(1);
  expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
});

it('leaves manual play usable after iPhone rejects autoplay', async () => {
  mocks.resolve.mockResolvedValue('blob:downloaded');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(new DOMException('gesture required', 'NotAllowedError'))
    .mockResolvedValue(undefined);
  render(<LocalAudioPlayer src="https://cdn.test/b.mp3" />);
  await act(async () => {});
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
  expect(play).toHaveBeenCalledTimes(2);
});

it('ignores a previous card that finishes preparing after navigation', async () => {
  let finish!: (url: string) => void;
  mocks.resolve.mockReturnValueOnce(new Promise<string>(resolve => { finish = resolve; }))
    .mockResolvedValueOnce('blob:second');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const view = render(<LocalAudioPlayer src="https://cdn.test/first.mp3" autoPlay={false} />);
  view.rerender(<LocalAudioPlayer src="https://cdn.test/second.mp3" autoPlay={false} />);
  await act(async () => { finish('blob:first'); });
  expect(view.container.querySelector('audio')).toHaveAttribute('src', 'blob:second');
  expect(play).not.toHaveBeenCalled();
});

it('ends an unresolved play attempt with an actionable error instead of spinning forever', async () => {
  vi.useFakeTimers();
  mocks.resolve.mockResolvedValue('blob:downloaded');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockReturnValue(new Promise(() => {}));
  render(<LocalAudioPlayer src="https://cdn.test/stalled.mp3" autoPlay={false} />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
  act(() => { vi.advanceTimersByTime(12000); });
  expect(screen.getByRole('alert')).toHaveTextContent('O áudio não iniciou');
});
