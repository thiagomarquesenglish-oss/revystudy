import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import FlipCardFrame from '../components/FlipCardFrame';
afterEach(cleanup);
it('turns both ways while keeping nested controls independent', () => {
  function Card() {
    const [flipped, setFlipped] = useState(false);
    return <FlipCardFrame flipped={flipped} onFlip={() => setFlipped(value => !value)}>
      <div>Question</div><div>Answer<button>Play</button></div>
    </FlipCardFrame>;
  }
  render(<Card />);
  fireEvent.click(screen.getByText('Question'));
  expect(screen.getByRole('button', { name: 'Mostrar frente do cartão' }).className).toContain('is-flipped');
  fireEvent.click(screen.getByText('Play'));
  expect(screen.getByRole('button', { name: 'Mostrar frente do cartão' })).toBeTruthy();
  fireEvent.click(screen.getByText('Answer'));
  const front = screen.getByRole('button', { name: 'Mostrar verso do cartão' });
  expect(front.className).not.toContain('is-flipped');
  fireEvent.keyDown(front, { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Mostrar frente do cartão' })).toBeTruthy();
});
