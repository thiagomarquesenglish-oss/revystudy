import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { addCard, getCardsByDeck } from '@/lib/storage';
import { buildSituationHtml, readSituation } from '@/lib/situation';
import { correctVariation, type VariationCorrection } from '@/lib/learning-help';
import { exampleKey } from '@/lib/explanation-examples';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';

export default function VariationPracticePage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const [phrases, setPhrases] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [result, setResult] = useState<VariationCorrection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    setPhrases(null);
    void getCardsByDeck(deckId!).then(cards => {
      const values = [...new Set(cards.map(card => readSituation(card.front, card.back)?.english || card.dictationAnswer || '').map(value => value.trim()).filter(Boolean))];
      for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; }
      if (active) { setPhrases(values); setIndex(0); }
    }).catch(() => { if (active) setError('Não foi possível carregar as frases.'); });
    return () => { active = false; };
  }, [deckId]);
  const sentence = phrases?.[index] || '';
  const correct = async () => {
    if (!typed.trim() || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setResult(null); setAdded(false);
    const answer = typed.trim(); setSubmitted(answer);
    try { setResult(await correctVariation(sentence, answer)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível corrigir.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const save = async () => {
    if (!result || added || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const cards = await getCardsByDeck(deckId!);
      if (cards.some(card => exampleKey(readSituation(card.front, card.back)?.english || card.dictationAnswer || '') === exampleKey(result.corrected))) {
        toast.info('Esta frase já está no baralho.'); setAdded(true); return;
      }
      const html = buildSituationHtml({english:result.corrected,portuguese:result.portuguese,imagePrompt:result.imagePrompt,context:'',mediaHtml:''});
      await addCard(deckId!, html.front, html.back);
      setAdded(true); toast.success('Variação adicionada ao baralho.');
    } catch { toast.error('Não foi possível adicionar o cartão. Tente novamente.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="min-h-screen bg-background safe-page">
    <PageHeader title="Estudar variações" onBack={() => navigate(`/deck/${deckId}`)} />
    <main className="max-w-lg mx-auto px-4 pb-28 space-y-5" style={{paddingTop:'calc(var(--app-header-height, 48px) + 1rem)'}}>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!phrases ? !error && <p role="status">Carregando frases…</p> : !sentence ? <p>Este baralho ainda não tem frases em inglês para praticar.</p> : <>
        <div className="rounded-2xl bg-card p-6"><p className="text-xs text-muted-foreground mb-3">Frase de referência</p><p lang="en" className="text-2xl font-semibold text-center">{sentence}</p></div>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); void correct(); }}>
          <label htmlFor="variation-answer" className="block text-sm">Escreva uma variação usando a estrutura ou uma palavra desta frase.</label>
          <textarea id="variation-answer" lang="en" spellCheck={false} maxLength={500} rows={3} value={typed} disabled={busy} onChange={event => { setTyped(event.target.value); setResult(null); setAdded(false); }} placeholder="Sua variação em inglês…" className="w-full rounded-xl border border-border bg-card p-4 text-lg resize-none" />
          <Button type="submit" className="w-full" disabled={busy || !typed.trim()}>{busy ? 'Aguarde…' : 'Corrigir minha variação'}</Button>
        </form>
        {result && <section aria-label="Correção" className="rounded-2xl bg-card p-5 space-y-3">
          <p className={`font-semibold ${result.correct ? 'text-green-500' : 'text-orange-400'}`}>{result.correct ? 'Sua frase está correta!' : 'Sua frase precisa de um ajuste'}</p>
          {!result.correct && <div><p className="text-xs text-muted-foreground">Você escreveu</p><p lang="en">{submitted}</p></div>}
          <div><p className="text-xs text-muted-foreground">{result.correct ? 'Sua variação' : 'Forma corrigida'}</p><p lang="en" className="text-lg font-semibold">{result.corrected}</p><p lang="pt-BR" className="text-muted-foreground">{result.portuguese}</p></div>
          <p className="whitespace-pre-line text-sm">{result.explanation}</p>
          {!result.related && <p className="text-sm text-muted-foreground">Na próxima, tente aproveitar uma palavra ou estrutura da frase de referência.</p>}
          <Button variant="secondary" className="w-full" disabled={busy || added} onClick={save}>{added ? 'Já está no baralho' : 'Adicionar como cartão'}</Button>
        </section>}
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => { setIndex(value => (value + 1) % phrases.length); setTyped(''); setSubmitted(''); setResult(null); setAdded(false); setError(''); }}>Outra frase</Button>
      </>}
    </main>
  </div>;
}
