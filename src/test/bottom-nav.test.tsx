import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import AppNavigation from '../components/AppNavigation';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'test' }, loading: false }) }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

it('keeps icon-only navigation accessible and navigates from its body portal', () => {
  const { container } = render(
    <MemoryRouter><BottomNav active="home" /><Location /></MemoryRouter>,
  );
  const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
  expect(nav.parentElement?.parentElement).toBe(document.body);
  expect(nav.parentElement?.className).toBe('navigation-viewport');
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
  expect(nav.hasAttribute('data-iphone-standalone')).toBe(false);
  expect(nav.querySelectorAll('.navigation-tab')).toHaveLength(4);
  expect(nav.querySelectorAll('.navigation-icon')).toHaveLength(4);
  for (const icon of nav.querySelectorAll<HTMLElement>('.navigation-icon')) {
    expect(icon.style.maskImage).toMatch(/^url\(".*"\)$/);
  }
  expect(screen.getByRole('button', { name: 'Ajustes' }).getAttribute('aria-current')).toBe('page');
  expect(nav.textContent).toBe('');
});

it('keeps the same navigation frame when switching away from home and back', () => {
  render(<MemoryRouter><AppNavigation /></MemoryRouter>);
  const nav = screen.getByRole('navigation');
  const frame = nav.parentElement;
  for (const name of ['Biblioteca', 'Ajustes', 'Progresso', 'Início']) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getByRole('navigation')).toBe(nav);
    expect(nav.parentElement).toBe(frame);
    expect(screen.getByRole('button', { name }).getAttribute('aria-current')).toBe('page');
  }
});

it.each(['/auth', '/study/example', '/practice/example', '/card/example/edit'])(
  'does not cover forms or study at %s', path => {
    render(<MemoryRouter initialEntries={[path]}><AppNavigation /></MemoryRouter>);
    expect(screen.queryByRole('navigation')).toBeNull();
  },
);
