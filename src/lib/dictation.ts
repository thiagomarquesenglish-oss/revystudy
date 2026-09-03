export function normalizeDictation(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g, "'")
    .replace(/[.!?…]+\s*$/u, '').replace(/\s+/g, ' ').trim();
}

export interface DictationWord {
  expected?: string;
  typed?: string;
  kind: 'correct' | 'replace' | 'missing' | 'extra';
}

export function compareDictation(expected: string, typed: string): { correct: boolean; words: DictationWord[] } {
  const expectedText = normalizeDictation(expected);
  const typedText = normalizeDictation(typed);
  const a = expectedText ? expectedText.split(' ') : [];
  const b = typedText ? typedText.split(' ') : [];
  const costs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) costs[i][0] = i;
  for (let j = 0; j <= b.length; j++) costs[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    costs[i][j] = Math.min(costs[i - 1][j] + 1, costs[i][j - 1] + 1,
      costs[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]));
  }
  const words: DictationWord[] = [];
  let i = a.length, j = b.length;
  while (i || j) {
    if (i && j && costs[i][j] === costs[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1])) {
      words.push({ expected: a[i - 1], typed: b[j - 1], kind: a[i - 1] === b[j - 1] ? 'correct' : 'replace' });
      i--; j--;
    } else if (i && costs[i][j] === costs[i - 1][j] + 1) {
      words.push({ expected: a[--i], kind: 'missing' });
    } else {
      words.push({ typed: b[--j], kind: 'extra' });
    }
  }
  return { correct: a.length > 0 && expectedText === typedText, words: words.reverse() };
}

export function dictationAudioSource(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const node of doc.querySelectorAll('audio, audio source, [data-audio], .audio-node-element')) {
    const src = node.getAttribute('src') || node.getAttribute('data-src');
    if (src && /^(https?:|blob:|data:audio\/)/i.test(src)) return src;
  }
  return null;
}
