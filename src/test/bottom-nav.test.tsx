import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

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

it('uses the floating layout on iPhone without inline viewport positioning', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  render(<MemoryRouter><BottomNav active="profile" /></MemoryRouter>);
  const nav = screen.getByRole('navigation');
  window.dispatchEvent(new Event('pageshow'));
  expect(nav.style.top).toBe('');
  expect(nav.querySelectorAll('.floating-nav-item')).toHaveLength(4);
  expect(nav.querySelectorAll('.floating-nav-icon')).toHaveLength(4);
  expect(screen.getByRole('button', { name: 'Ajustes' }).getAttribute('aria-current')).toBe('page');
  expect(nav.textContent).toBe('');
});
