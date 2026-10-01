import { expect, it } from 'vitest';
import { isOriginalReply, usesDeckWords, words } from '../../api/conversation.js';
it('accepts recombinations but rejects vocabulary outside the deck',() => {
  const vocabulary=new Set(words("Can I get a refill? I need a drink. I'm good, thanks."));
  expect(usesDeckWords('Can I get a drink?',vocabulary)).toBe(true);
  expect(usesDeckWords('Can I get a sandwich?',vocabulary)).toBe(false);
  expect(usesDeckWords('I’m good, thanks!',vocabulary)).toBe(true);
});
it('rejects copied deck phrases and repeated dialogue while allowing new combinations', () => {
  const phrases = ['Can I get a refill?', 'I need a drink.'];
  expect(isOriginalReply('Can I get a refill!', phrases)).toBe(false);
  expect(isOriginalReply('Can I get a drink?', phrases)).toBe(true);
  expect(isOriginalReply('Would you like a drink?', phrases, [{role:'assistant',text:'Would you like a drink?'}])).toBe(false);
  expect(isOriginalReply('', phrases)).toBe(false);
});
