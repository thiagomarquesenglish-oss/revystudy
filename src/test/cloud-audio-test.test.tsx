import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/offline-db', () => ({ localDB: {
  getCards: async () => [{ front: '<p>Hello</p><audio src="https://example.com/a.mp3"></audio>', back: '' }],
  getDecks: async () => [],
} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import CloudAudioTest from '@/components/CloudAudioTest';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('uses a unique NetworkOnly URL and native manual controls without a local resolver', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const { container } = render(<CloudAudioTest />);
  fireEvent.click(screen.getByText('Escolher áudio para testar'));
  await screen.findByRole('combobox');
  fireEvent.click(screen.getByText('Preparar teste da nuvem'));
  const audio = container.querySelector('audio')!;
  const url = new URL(audio.src);
  expect(url.origin + url.pathname).toBe('https://example.com/a.mp3');
  expect(url.searchParams.get('revystudy_download')).toBeTruthy();
  expect(audio.controls).toBe(true);
  expect(audio.autoplay).toBe(false);
  expect(audio.preload).toBe('none');
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.useFakeTimers();
  fireEvent.play(audio);
  fireEvent.playing(audio);
  expect(screen.getByRole('status')).toHaveTextContent('Reproduzindo diretamente da nuvem');
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByText('Preparar teste da nuvem'));
  expect(container.querySelector('audio')!.src).not.toBe(url.href);
});
