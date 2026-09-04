import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ add: vi.fn(), success: vi.fn() }));
vi.mock('@/lib/storage', () => ({ addCard: mocks.add, getDeckAudios: async () => [] }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: vi.fn() } }));
vi.mock('@/components/RichTextEditor', () => ({ default: ({ onChange, placeholder }: any) => <textarea aria-label={placeholder} onChange={e => onChange(e.target.value)} /> }));
vi.mock('@/components/EditorToolbar', () => ({ default: () => null }));
vi.mock('@/components/CardPreview', () => ({ default: () => null }));
vi.mock('@/components/PageHeader', () => ({ default: () => null }));
import AddCardPage from '@/pages/AddCardPage';

it('submits only once while saving and confirms and clears after success', async () => {
  let finish!: () => void;
  mocks.add.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<MemoryRouter initialEntries={['/deck/test/add']}><Routes><Route path="/deck/:deckId/add" element={<AddCardPage />} /></Routes></MemoryRouter>);
  const inputs = screen.getAllByRole('textbox');
  fireEvent.change(inputs[0], { target: { value: 'hello' } });
  fireEvent.change(inputs[1], { target: { value: 'olá' } });
  const button = screen.getByRole('button', { name: 'Adicionar Cartão' });
  fireEvent.click(button);
  fireEvent.submit(document.getElementById('add-card-form')!);
  expect(mocks.add).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Adicionando…' })).toBeDisabled();
  await act(async () => finish());
  expect(mocks.success).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Adicionar Cartão' })).toBeDisabled();
  expect(screen.getAllByRole('textbox')[0]).toHaveValue('');
});
