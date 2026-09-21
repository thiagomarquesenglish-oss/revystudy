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

it('anchors the iPhone PWA nav on launch and viewport changes, counting its inset only once', () => {
  vi.useFakeTimers();
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 90 } as DOMRect);
  const { unmount } = render(<MemoryRouter><BottomNav active="home" /></MemoryRouter>);
  const nav = screen.getByRole('navigation');
  vi.advanceTimersByTime(30);
  expect(nav.style.top).toBe('710px');
  expect(nav.dataset.viewportAnchored).toBe('true');
  viewport.height = 850;
  viewport.dispatchEvent(new Event('resize'));
  vi.advanceTimersByTime(30);
  expect(nav.style.top).toBe('760px');
  viewport.height = 800;
  window.dispatchEvent(new Event('pageshow'));
  vi.advanceTimersByTime(900);
  expect(nav.style.top).toBe('710px');
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
