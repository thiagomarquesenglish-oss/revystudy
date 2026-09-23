import { supabase } from '@/integrations/supabase/client';
import { getCardsByDeck, addCard } from '@/lib/storage';
import { readSituation, buildSituationHtml } from '@/lib/situation';
import { exampleKey, splitExplanation } from '@/lib/explanation-examples';
import type { Flashcard } from '@/lib/types';

export interface GeneratedSituation {
  kind: 'bridge' | 'new';
  english: string;
  portuguese: string;
  imagePrompt: string;
  sourceEnglish: string;
  anchor: string;
  newVocabulary: string;
}

export function deckRepertoire(cards: Flashcard[]) {
  const phrases: string[] = [];
  for (const card of cards) {
    const situation = readSituation(card.front, card.back);
    if (situation) phrases.push(situation.english);
    else {
      const front = document.createElement('div');
      front.innerHTML = card.front;
      front.querySelectorAll('audio, [data-audio], script, style').forEach(node => node.remove());
      if (card.dictationAnswer) phrases.push(card.dictationAnswer);
      else if (front.textContent?.trim()) phrases.push(front.textContent.trim());
      // Include examples inside concept explanations, without sending HTML/media.
      const root = document.createElement('div');
      root.innerHTML = card.back.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n');
      phrases.push(...splitExplanation(root.textContent || '').examples.map(item => item.english));
    }
  }
  return [...new Map(phrases.filter(line => line.trim()).map(line => [exampleKey(line), line.trim()])).values()];
}

export async function generateDeckSituations(deckId: string): Promise<GeneratedSituation[]> {
  const previous = deckRepertoire(await getCardsByDeck(deckId));
  const {data:{session}} = await supabase.auth.getSession();
  if (!session) throw new Error('Sua sessão expirou.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch('/api/explain', {method:'POST', signal:controller.signal, headers:{'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}`}, body:JSON.stringify({mode:'deck-batch', previous})});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível gerar as situações.');
    if (!Array.isArray(payload.situations) || payload.situations.length !== 20) throw new Error('A IA retornou uma leva incompleta. Tente novamente.');
    return payload.situations;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('A IA demorou demais. Tente novamente. Nenhum cartão foi adicionado.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function saveGeneratedSituations(deckId: string, items: GeneratedSituation[], onSaved: (english: string) => void) {
  const existing = new Set(deckRepertoire(await getCardsByDeck(deckId)).map(exampleKey));
  // Commit individually: a retry checks the persisted deck and skips successes.
  for (const item of items) {
    const key = exampleKey(item.english);
    if (!existing.has(key)) {
      const html = buildSituationHtml({...item, context:'', mediaHtml:''});
      await addCard(deckId, html.front, html.back, null, 'standard', item.english);
      existing.add(key);
    }
    onSaved(item.english);
  }
}
