import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Flashcard } from '@/lib/types';
vi.mock('@/lib/storage', () => ({ updateCard: vi.fn() }));
vi.mock('@/lib/situation', () => ({
  readSituation: (front: string) => ({ english: 'Hello', mediaHtml: front }),
  buildSituationHtml: vi.fn(), escapeHtml: (value: string) => value,
}));
import QuickCardMedia from '@/components/QuickCardMedia';
afterEach(cleanup);
it('shows only a centered audio control, without copy actions', () => {
  const card = { front: '<audio src="https://cdn.test/audio.mp3"></audio>', back: '' } as Flashcard;
  render(<QuickCardMedia card={card} onSaved={() => {}}><p>Hello</p></QuickCardMedia>);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  const play = screen.getByRole('button', { name: 'Ouvir áudio' });
  expect(play.parentElement?.parentElement).toHaveClass('flex', 'justify-center');
  expect(screen.queryByText('Prompt')).toBeNull();
  expect(screen.queryByText('Frase')).toBeNull();
});
it('does not leave empty actions on a card without audio', () => {
  render(<QuickCardMedia card={{ front: '', back: '' } as Flashcard} onSaved={() => {}}><p>Hello</p></QuickCardMedia>);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
