import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

afterEach(cleanup);

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

it('keeps icon-only navigation accessible and navigates from its body portal', () => {
  const { container } = render(
    <MemoryRouter><BottomNav active="home" /><Location /></MemoryRouter>,
  );
  const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
  expect(nav.parentElement).toBe(document.body);
  expect(container.contains(nav)).toBe(false);
  expect(screen.getByRole('button', { name: 'Início' }).getAttribute('aria-current')).toBe('page');
  for (const [name, path] of [['Biblioteca', '/decks'], ['Progresso', '/stats'], ['Ajustes', '/settings'], ['Início', '/']]) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByTestId('location').textContent).toBe(path);
  }
});
