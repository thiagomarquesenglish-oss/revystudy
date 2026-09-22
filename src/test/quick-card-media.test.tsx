import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Flashcard } from '@/lib/types';
vi.mock('@/lib/storage', () => ({ updateCard: vi.fn() }));
vi.mock('@/lib/situation', () => ({
  readSituation: (front: string) => ({ english: 'Hello', mediaHtml: front, imagePrompt: front.includes('data-image-prompt') ? 'Homem cumprimentando uma amiga na rua.' : '' }),
  buildSituationHtml: vi.fn(), escapeHtml: (value: string) => value,
}));
import QuickCardMedia from '@/components/QuickCardMedia';
afterEach(cleanup);
it('copies the short prompt and English separately', () => {
  const writeText=vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  render(<QuickCardMedia card={{front:'<div data-image-prompt></div>',back:''} as Flashcard} onSaved={()=>{}}><p>Hello</p></QuickCardMedia>);
  fireEvent.click(screen.getByRole('button',{name:'Copiar prompt'}));
  expect(writeText).toHaveBeenLastCalledWith('Homem cumprimentando uma amiga na rua.');
  fireEvent.click(screen.getByRole('button',{name:'Copiar inglês'}));
  expect(writeText).toHaveBeenLastCalledWith('Hello');
});
it('shows English copy and audio actions', () => {
  const card = { front: '<audio src="https://cdn.test/audio.mp3"></audio>', back: '' } as Flashcard;
  render(<QuickCardMedia card={card} onSaved={() => {}}><p>Hello</p></QuickCardMedia>);
  expect(screen.getAllByRole('button')).toHaveLength(2);
  const play = screen.getByRole('button', { name: 'Ouvir áudio' });
  expect(play).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copiar inglês' })).toBeInTheDocument();
  expect(screen.queryByText('Prompt')).toBeNull();
  expect(screen.queryByText('Frase')).toBeNull();
});
it('offers English copy without inventing audio or a prompt', () => {
  render(<QuickCardMedia card={{ front: '', back: '' } as Flashcard} onSaved={() => {}}><p>Hello</p></QuickCardMedia>);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Ouvir áudio' })).toBeNull();
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
