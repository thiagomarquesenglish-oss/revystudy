import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CardOptions from '@/components/CardOptions';
import { useBlurPortuguese, setBlurPortuguese } from '@/lib/card-display-preferences';
import type { Flashcard } from '@/lib/types';

const storage = vi.hoisted(() => ({ updateCard: vi.fn(), deleteCard: vi.fn(), getCardsByDeck: vi.fn() }));
vi.mock('@/lib/storage', () => storage);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/UnderstandHelp', () => ({ default: ({ open }: { open: boolean }) => open ? <div>Explicar esta frase</div> : null }));
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ open, children }: any) => open ? <div role="dialog">{children}</div> : null,
  DrawerContent: ({ children }: any) => <div>{children}</div>,
  DrawerHeader: ({ children }: any) => <div>{children}</div>,
  DrawerTitle: ({ children }: any) => <h2>{children}</h2>,
}));
const card = { id: 'one', deckId: 'deck', flagged: false } as Flashcard;
function Probe() {
  const hidden = useBlurPortuguese(card.id);
  return <output>{useLocation().pathname}|{String(hidden)}</output>;
}
function mount() {
  return render(<MemoryRouter><CardOptions card={card} sentence="Try again." portuguese="Tente novamente." /><Probe /></MemoryRouter>);
}
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  storage.getCardsByDeck.mockResolvedValue([card]);
  storage.updateCard.mockResolvedValue(undefined);
  storage.deleteCard.mockResolvedValue(undefined);
});
afterEach(cleanup);

it('shows only a centered icon while retaining an accessible options label', () => {
  mount();
  const button = screen.getByRole('button', { name: 'Opções' });
  expect(button.textContent).toBe('');
  expect(button).toHaveClass('items-center', 'justify-center', 'h-11', 'w-11');
  fireEvent.click(button);
  expect(screen.getByRole('dialog')).toBeTruthy();
});

it('saves blur only for the selected card and can restore it', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Opções' }));
  fireEvent.click(screen.getByRole('switch', { name: /Ocultar português/ }));
  await waitFor(() => expect(screen.getByText('/|true')).toBeTruthy());
  expect(localStorage.getItem('revystudy:blur-portuguese:one')).toBe('true');
  expect(localStorage.getItem('revystudy:blur-portuguese:two')).toBeNull();
  fireEvent.click(screen.getByRole('switch', { name: /Ocultar português/ }));
  await waitFor(() => expect(screen.getByText('/|false')).toBeTruthy());
});

it('restores a saved preference on mounting', () => {
  setBlurPortuguese('one', true); mount();
  expect(screen.getByText('/|true')).toBeTruthy();
});

it('opens explanation separately from the options drawer', () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Opções' }));
  fireEvent.click(screen.getByRole('button', { name: 'Explicação' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('Explicar esta frase')).toBeTruthy();
});

it('marks then unmarks with the existing card API', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Opções' }));
  fireEvent.click(screen.getByRole('button', { name: 'Marcar cartão' }));
  await waitFor(() => expect(storage.updateCard).toHaveBeenCalledWith('one', { flagged: true }));
  fireEvent.click(await screen.findByRole('button', { name: 'Desmarcar cartão' }));
  await waitFor(() => expect(storage.updateCard).toHaveBeenCalledWith('one', { flagged: false }));
});

it('navigates to the current card editor', () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Opções' }));
  fireEvent.click(screen.getByRole('button', { name: 'Editar cartão' }));
  expect(screen.getByText('/card/one/edit|false')).toBeTruthy();
});

it('requires confirmation before deletion and leaves the session', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Opções' }));
  fireEvent.click(screen.getByRole('button', { name: 'Excluir cartão' }));
  expect(storage.deleteCard).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
  await waitFor(() => expect(screen.getByText('/deck/deck|false')).toBeTruthy());
  expect(storage.deleteCard).toHaveBeenCalledWith('one');
});
