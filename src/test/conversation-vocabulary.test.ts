import { expect, it } from 'vitest';
import { usesDeckWords, words } from '../../api/conversation.js';
it('accepts recombinations but rejects vocabulary outside the deck',() => {
  const vocabulary=new Set(words("Can I get a refill? I need a drink. I'm good, thanks."));
  expect(usesDeckWords('Can I get a drink?',vocabulary)).toBe(true);
  expect(usesDeckWords('Can I get a sandwich?',vocabulary)).toBe(false);
  expect(usesDeckWords('I’m good, thanks!',vocabulary)).toBe(true);
});
