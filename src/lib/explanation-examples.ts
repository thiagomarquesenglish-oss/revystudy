export interface ExplanationExample { english: string; portuguese: string; imagePrompt?: string }
export const formatExample = (item: ExplanationExample) => `• ${item.english} → ${item.portuguese}${item.imagePrompt ? '\nCena: '+item.imagePrompt.replace(/\n/g,' ') : ''}`;
export const exampleKey = (text: string) => text.trim().toLocaleLowerCase('en').replace(/[’‘]/g, "'").replace(/[.!?,;:"“”]+/g, '').replace(/\s+/g, ' ');
export async function fiveNewExamples(existing: ExplanationExample[], excluded: string[], generate: (previous: string[]) => Promise<ExplanationExample[]>) {
  const seen = new Set(excluded.map(exampleKey));
  const result: ExplanationExample[] = [];
  const collect = (items: ExplanationExample[]) => {
    for (const item of items) {
      const key = exampleKey(item.english);
      if (!key || !item.portuguese.trim() || seen.has(key)) continue;
      seen.add(key); result.push(item);
    }
  };
  collect(existing);
  for (let attempt = 0; result.length < 5 && attempt < 3; attempt++) {
    collect(await generate([...excluded, ...existing.map(item=>item.english), ...result.map(item=>item.english)]));
  }
  if (result.length < 5) throw new Error('A IA não forneceu cinco exemplos diferentes. Tente novamente.');
  return result.slice(0,5);
}
export function splitExplanation(text: string) {
  const examples: ExplanationExample[] = [];
  const seen = new Set<string>();
  const body = text.split('\n').filter(line => {
    if (line.startsWith('Cena: ') && examples.length) { examples[examples.length-1].imagePrompt=line.slice(6).trim(); return false; }
    const match = line.match(/^\s*(?:[•*-]|\d+[.)])?\s*(.+?)\s*→\s*(.+?)\s*$/);
    if (!match || line.trim().startsWith('👉')) return true;
    const english = match[1].trim(), portuguese = match[2].trim();
    if (!seen.has(exampleKey(english))) { examples.push({english, portuguese}); seen.add(exampleKey(english)); }
    return false;
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return {body, examples};
}
