import { supabase } from '@/integrations/supabase/client';
import type { ExplanationExample } from './explanation-examples';

export async function requestMoreExamples(sentence: string, selectedText: string, previous: string[], level: string): Promise<ExplanationExample[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sua sessão expirou.');
  const response = await fetch('/api/explain', {method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}`}, body:JSON.stringify({mode:'examples',sentence,selectedText,previous,level})});
  const payload = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível gerar exemplos.');
  if (!Array.isArray(payload.examples)) throw new Error('Exemplos inválidos. Tente novamente.');
  return payload.examples;
}

export interface LearningExplanation {
  id: string;
  conceptKey: string;
  selectedText: string;
  sentence: string;
  title: string;
  explanation: string;
  quickMeaning: string;
  cardFront: string;
  cardBack: string;
  useCount: number;
}

const mapRow = (row: any): LearningExplanation => ({
  id: row.id, conceptKey: row.concept_key, selectedText: row.selected_text,
  sentence: row.sentence, title: row.title, explanation: row.explanation,
  quickMeaning: row.quick_meaning, cardFront: row.card_front, cardBack: row.card_back,
  useCount: row.use_count,
});

export async function findExplanations(selectedText: string, sentence: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sua sessão expirou.');
  const { data, error } = await supabase.from('learning_explanations' as any).select('*')
    .eq('user_id', user.id).ilike('selected_text', selectedText.trim()).order('updated_at', { ascending: false });
  if (error) throw error;
  // Regenerate older explanations on demand in the requested examples style.
  const rows = (data || []).map(mapRow).filter(item => item.conceptKey.startsWith('examples-v2:'));
  const exact = rows.find(item => item.sentence.toLocaleLowerCase() === sentence.trim().toLocaleLowerCase());
  return { exact, related: rows.filter(item => item.id !== exact?.id) };
}

export async function saveExplanation(input: Omit<LearningExplanation, 'id' | 'useCount'>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sua sessão expirou.');
  const row = {
    user_id: user.id, concept_key: input.conceptKey, selected_text: input.selectedText,
    sentence: input.sentence, title: input.title, explanation: input.explanation,
    quick_meaning: input.quickMeaning, card_front: input.cardFront, card_back: input.cardBack,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('learning_explanations' as any).upsert(row as any, { onConflict: 'user_id,sentence,selected_text' } as any).select('*').single();
  if (error) throw error;
  return mapRow(data);
}

export async function markExplanationUsed(item: LearningExplanation) {
  await supabase.from('learning_explanations' as any).update({ use_count: item.useCount + 1, updated_at: new Date().toISOString() } as any).eq('id', item.id);
}

export async function requestExplanation(args: { sentence: string; selectedText: string; portuguese: string; question?: string; level?: string }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sua sessão expirou.');
  const response = await fetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(args) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível gerar a explicação.');
  return payload as { conceptKey: string; title: string; explanation: string; quickMeaning: string; cardFront: string; cardBack: string };
}
