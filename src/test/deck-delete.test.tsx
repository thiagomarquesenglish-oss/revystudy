import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const mocks = vi.hoisted(() => ({ remove: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/storage', () => ({
  getDecks: async () => [{ id: 'deck-one', name: 'Day to day' }],
  getCardsByDeck: async () => [], getNewCards: async () => [],
  getLearningCards: async () => [], getReviewCards: async () => [],
  deleteDeck: mocks.remove, invalidateDeckAudios: vi.fn(), forceSyncDeckCards: vi.fn(),
  checkDeckUpdates: vi.fn(), downloadDeckPackage: vi.fn(),
}));
vi.mock('@/components/BulkAddCardsDrawer', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.error } }));
import DeckPage from '@/pages/DeckPage';
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function openDelete() {
  render(<MemoryRouter initialEntries={['/deck/deck-one']}><Routes>
    <Route path="/deck/:deckId" element={<DeckPage />} />
    <Route path="/" element={<p>Home after deletion</p>} />
  </Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir opções do baralho' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir baralho' }));
  await screen.findByRole('button', { name: 'Confirmar exclusão' });
}
it('does not delete on opening or cancelling confirmation', async () => {
  await openDelete();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('deletes only the current deck after confirmation and returns home', async () => {
  mocks.remove.mockResolvedValueOnce(undefined);
  await openDelete();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
  await screen.findByText('Home after deletion');
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith('deck-one');
});
it('shows an error and allows retry if deletion fails', async () => {
  mocks.remove.mockRejectedValueOnce(new Error('offline'));
  await openDelete();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  expect(screen.queryByText('Home after deletion')).toBeNull();
  expect(screen.getByRole('button', { name: 'Confirmar exclusão' })).not.toBeDisabled();
});
