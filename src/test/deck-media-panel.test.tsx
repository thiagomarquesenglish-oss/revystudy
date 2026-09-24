import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import DeckMediaPanel from '@/components/DeckMediaPanel';
import { isAutoAudioEnabled, setAutoAudioEnabled } from '@/lib/saved-audio';
import type { Flashcard } from '@/lib/types';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/deck-audios/${path}` } }) }) } } }));
vi.mock('@/lib/storage', () => ({ getDeckAudios: vi.fn(async () => [{ id: 'a1', name: 'Longo', file_path: 'u/long.mp3' }]) }));

let entries: Map<string, Response>;
const card = (id: string, front: string, back = ''): Flashcard => ({ id, front, back } as Flashcard);
const cards = [
  card('1', '<p>hi</p>', '<div data-audio data-src="https://cdn.test/card-media/one.mp3"></div>'),
  card('2', '<div data-audio data-src="https://cdn.test/card-media/two.m4a"></div>'),
  card('3', '<p>sem áudio</p>'),
];
beforeEach(() => {
  entries = new Map();
  vi.stubGlobal('caches', { open: vi.fn(async () => ({ match: async (key: string) => entries.get(key)?.clone(), put: async (key: string, response: Response) => { entries.set(key, response.clone()); } })) });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('audio-bytes', { headers: { 'Content-Type': 'audio/mpeg' } })));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

it('lists pending audios from cards and the deck, then downloads them all with one tap', async () => {
  render(<DeckMediaPanel deckId="d1" cards={cards} />);
  expect(await screen.findByText('0 de 3 salvos · 3 pendentes')).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Baixar 3/ }));
  expect(await screen.findByText('Todos os 3 áudios estão salvos neste aparelho.')).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('shows only the remaining audios after some were already saved, including newly added cards', async () => {
  const view = render(<DeckMediaPanel deckId="d1" cards={cards.slice(0, 1)} />);
  await screen.findByText('0 de 2 salvos · 2 pendentes');
  fireEvent.click(screen.getByRole('button', { name: /Baixar 2/ }));
  await screen.findByText('Todos os 2 áudios estão salvos neste aparelho.');
  // A new card with audio arrives from the PC.
  view.rerender(<DeckMediaPanel deckId="d1" cards={cards} />);
  expect(await screen.findByText('2 de 3 salvos · 1 pendente')).toBeTruthy();
});

it('reports failed downloads and keeps them pending', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('x', { status: 500 }));
  render(<DeckMediaPanel deckId="d1" cards={cards} />);
  fireEvent.click(await screen.findByRole('button', { name: /Baixar 3/ }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  await waitFor(() => expect(screen.getByText('0 de 3 salvos · 3 pendentes')).toBeTruthy());
});

it('renders nothing for a deck without audio', async () => {
  const { getDeckAudios } = await import('@/lib/storage');
  vi.mocked(getDeckAudios).mockResolvedValueOnce([]);
  const { container } = render(<DeckMediaPanel deckId="d2" cards={[card('9', '<p>x</p>')]} />);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  expect(container.innerHTML).toBe('');
});

it('keeps the automatic download switch off until the user turns it on', () => {
  expect(isAutoAudioEnabled()).toBe(false);
  setAutoAudioEnabled(true);
  expect(isAutoAudioEnabled()).toBe(true);
});
