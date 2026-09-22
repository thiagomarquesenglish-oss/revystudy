export interface ExplanationExample { english: string; portuguese: string }
export const exampleKey = (text: string) => text.trim().toLocaleLowerCase('en').replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
export function splitExplanation(text: string) {
  const examples: ExplanationExample[] = [];
  const seen = new Set<string>();
  const body = text.split('\n').filter(line => {
    const match = line.match(/^\s*(?:[•*-]|\d+[.)])?\s*(.+?)\s*→\s*(.+?)\s*$/);
    if (!match || line.trim().startsWith('👉')) return true;
    const english = match[1].trim(), portuguese = match[2].trim();
    if (!seen.has(exampleKey(english))) { examples.push({english, portuguese}); seen.add(exampleKey(english)); }
    return false;
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return {body, examples};
}
