import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Drawer, DrawerContent } from '@/components/ui/drawer';

const root = vi.hoisted(() => vi.fn());
vi.mock('vaul', () => ({ Drawer: {
  Root: ({ children, ...props }: any) => { root(props); return <>{children}</>; },
  Portal: ({ children }: any) => <>{children}</>,
  Overlay: () => null,
  Title: () => null,
  Description: () => null,
  Content: ({ children, ...props }: any) => <section {...props}>{children}</section>,
} }));
afterEach(() => { cleanup(); root.mockClear(); });
it('leaves keyboard and body management to Vaul defaults', () => {
  render(<Drawer open><DrawerContent><textarea aria-label="Resposta" /></DrawerContent></Drawer>);
  const props = root.mock.calls[0][0];
  expect(props).not.toHaveProperty('noBodyStyles');
  expect(props).not.toHaveProperty('disablePreventScroll');
  expect(props).not.toHaveProperty('repositionInputs');
  const scroller = screen.getByLabelText('Resposta').parentElement!;
  expect(scroller).toHaveClass('min-h-0', 'overflow-y-auto');
  expect(scroller.parentElement).toHaveClass('max-h-[85dvh]');
});
