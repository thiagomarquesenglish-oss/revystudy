import { useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { addCard, getCardsByDeck } from '@/lib/storage';
import { buildSituationHtml, escapeHtml, readSituation } from '@/lib/situation';
import { exampleKey, fiveNewExamples, formatExample, splitExplanation, type ExplanationExample } from '@/lib/explanation-examples';
import { requestMoreExamples, requestScenePrompt } from '@/lib/learning-help';
import { findExplanations, markExplanationUsed, requestExplanation, saveExplanation, type LearningExplanation } from '@/lib/learning-help';

type Props = { sentence: string; portuguese: string; deckId: string; level?: string; open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean };

export default function UnderstandHelp({ sentence, portuguese, deckId, level = 'iniciante', open: controlledOpen, onOpenChange, hideTrigger }: Props) {
  const words = useMemo(() => {
    const unique = new Map<string,string>();
    for (const word of sentence.match(/[\p{L}\p{N}'’-]+/gu) || []) {
      const key = word.toLocaleLowerCase('en');
      if (!unique.has(key)) unique.set(key, word);
    }
    return [...unique.values()];
  }, [sentence]);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  const [current, setCurrent] = useState<LearningExplanation | null>(null);
  const [related, setRelated] = useState<LearningExplanation[]>([]);
  const [examplesBusy, setExamplesBusy] = useState('');
  const exampleLock = useRef(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const parsed = useMemo(() => splitExplanation(current?.explanation || ''), [current?.explanation]);
  useEffect(() => {
    let active = true;
    void getCardsByDeck(deckId).then(cards => {
      if (active) setAdded(new Set(cards.map(card => exampleKey(readSituation(card.front, card.back)?.english || ''))));
    }).catch(() => {});
    return () => { active = false; };
  }, [deckId, current?.id]);
  const selectedText = [...selected].sort((a,b)=>a-b).map(index => words[index]).join(' ');

  useEffect(() => { setSelected([]); setCurrent(null); setRelated([]); setCreated(false); }, [sentence]);

  const toggle = (index: number) => {
    if (exampleLock.current || loading) return;
    setCurrent(null); setCreated(false);
    setSelected(old => old.includes(index) ? old.filter(value => value !== index) : [...old, index]);
  };

  const prepareExamples = async (item: LearningExplanation) => {
    const cards = await getCardsByDeck(deckId);
    const excluded = [sentence, item.sentence, ...cards.map(card => readSituation(card.front, card.back)?.english || card.dictationAnswer || '')];
    setAdded(new Set(excluded.map(exampleKey)));
    const split = splitExplanation(item.explanation);
    const fresh = await fiveNewExamples(split.examples, excluded, previous => requestMoreExamples(item.sentence, item.selectedText, previous, level));
    const explanation = split.body + '\n\n' + fresh.map(formatExample).join('\n');
    if (explanation === item.explanation) return item;
    // Keep old examples in storage as an exclusion history; only show eligible examples below.
    const known = new Set(split.examples.map(example => exampleKey(example.english)));
    const additions = fresh.filter(example => !known.has(exampleKey(example.english)));
    if (!additions.length) return item;
    const full = item.explanation + '\n\n' + additions.map(formatExample).join('\n');
    return saveExplanation({...item, explanation:full, cardBack:full});
  };

  const lookup = async () => {
    if (!selectedText) return;
    setLoading(true);
    try {
      const result = await findExplanations(selectedText, sentence);
      setRelated(result.related);
      if (result.exact) {
        setCurrent(await prepareExamples(result.exact));
        void markExplanationUsed(result.exact);
      } else if (result.related.length && !related.length) {
        return;
      } else {
        const generated = await requestExplanation({ sentence, selectedText, portuguese, question: '', level });
        const saved = await saveExplanation({
          conceptKey: generated.conceptKey, selectedText, sentence,
          title: generated.title, explanation: generated.explanation,
          quickMeaning: generated.quickMeaning, cardFront: generated.cardFront, cardBack: generated.cardBack,
        });
        setCurrent(await prepareExamples(saved));
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a ajuda.'); }
    finally { setLoading(false); }
  };

  const reuse = async (item: LearningExplanation) => {
    if (loading) return;
    setLoading(true);
    try { setCurrent(await prepareExamples(item)); setCreated(false); void markExplanationUsed(item); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível abrir os exemplos.'); }
    finally { setLoading(false); }
  };

  const createConceptCard = async () => {
    if (!current || created) return;
    setLoading(true);
    try {
      const visibleExplanation = current.explanation.split('\n').filter(line=>!line.startsWith('Cena: ')).join('\n');
      await addCard(deckId, `<p><strong>${escapeHtml(current.selectedText)}</strong></p>`, `<p>${escapeHtml(visibleExplanation).replace(/\n/g, '<br>')}</p>`);
      setCreated(true); toast.success('Cartão de conceito criado.');
    } catch { toast.error('Não foi possível criar o cartão de conceito.'); }
    finally { setLoading(false); }
  };

  const createExample = async (example: ExplanationExample) => {
    if (exampleLock.current) return;
    exampleLock.current = true;
    const key = exampleKey(example.english);
    setExamplesBusy(key);
    try {
      const cards = await getCardsByDeck(deckId);
      if (!cards.some(card => exampleKey(readSituation(card.front, card.back)?.english || '') === key)) {
        const imagePrompt = example.imagePrompt || await requestScenePrompt(example);
        const html = buildSituationHtml({...example, imagePrompt, context:'', mediaHtml:''});
        await addCard(deckId, html.front, html.back);
        toast.success('Exemplo adicionado ao baralho.');
      } else toast.info('Este exemplo já está no baralho.');
      setAdded(old => new Set([...old, key]));
    } catch { toast.error('Não foi possível adicionar o exemplo. Tente novamente.'); }
    finally { exampleLock.current = false; setExamplesBusy(''); }
  };

  const moreExamples = async () => {
    if (!current || exampleLock.current) return;
    exampleLock.current = true; setExamplesBusy('more');
    try {
      const cards = await getCardsByDeck(deckId);
      const excluded = [sentence, current.sentence, ...parsed.examples.map(item=>item.english), ...cards.map(card=>readSituation(card.front, card.back)?.english || card.dictationAnswer || '')];
      const fresh = await fiveNewExamples([], excluded, previous => requestMoreExamples(current.sentence, current.selectedText, previous, level));
      const explanation = current.explanation + '\n\n' + fresh.map(formatExample).join('\n');
      const saved = await saveExplanation({...current, explanation, cardBack:explanation});
      setCurrent(saved); setCreated(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível gerar mais exemplos.'); }
    finally { exampleLock.current = false; setExamplesBusy(''); }
  };

  return <>
    {!hideTrigger && <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground py-2">
      <Lightbulb className="h-4 w-4"/> Explicação
    </button>}
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>Explicar esta frase</DrawerTitle></DrawerHeader>
        <div className="px-4 pb-6 space-y-5 overflow-y-auto max-h-[75dvh]">
          <div className="flex flex-wrap justify-center gap-2" lang="en">
            {words.map((word,index)=><button type="button" key={`${word}-${index}`} onClick={()=>toggle(index)} className={`rounded-lg border px-3 py-2 text-lg ${selected.includes(index)?'border-primary bg-primary/15 text-primary':'border-border bg-background'}`}>{word}</button>)}
          </div>
          <p className="text-center text-xs text-muted-foreground">Toque em uma ou mais partes que você não entendeu.</p>

          {!current && <>
            {!!related.length && <div className="space-y-2"><p className="text-sm font-medium">Explicações que você já tem</p>{related.slice(0,3).map(item=><button key={item.id} type="button" onClick={()=>reuse(item)} className="w-full rounded-xl border border-border p-3 text-left"><span className="font-medium">{item.title}</span><span className="block text-xs text-muted-foreground mt-1">Exemplo: {item.sentence}</span></button>)}</div>}
            <Button className="w-full" disabled={!selectedText||loading} onClick={lookup}>{loading?<Loader2 className="h-4 w-4 animate-spin"/>:related.length?'Gerar uma nova explicação':`Explicar “${selectedText || 'trecho'}”`}</Button>
          </>}

          {current && <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
            <div><h3 className="text-lg font-semibold">{current.title}</h3><p className="text-primary font-medium">{current.quickMeaning}</p></div>
            <p className="whitespace-pre-line leading-relaxed">{parsed.body}</p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="secondary" disabled={loading||!!examplesBusy} onClick={()=>setCurrent(null)}>Escolher outro</Button>
              <Button disabled={loading||created||!!examplesBusy} onClick={createConceptCard}>{created?'Cartão criado':'Criar cartão'}</Button>
            </div>
          </div>}
          {current && <section className="rounded-2xl border border-border bg-background p-4 space-y-3" aria-label="Exemplos">
            <h3 className="font-semibold">Exemplos para praticar</h3>
            {parsed.examples.filter(example => !added.has(exampleKey(example.english)) && exampleKey(example.english)!==exampleKey(sentence) && exampleKey(example.english)!==exampleKey(current.sentence)).map(example => <div key={exampleKey(example.english)} className="rounded-xl bg-secondary p-3 space-y-2">
              <p lang="en" className="font-medium">{example.english}</p>
              <p lang="pt-BR" className="text-sm text-muted-foreground">{example.portuguese}</p>
              <Button variant="secondary" className="w-full" disabled={loading||!!examplesBusy||added.has(exampleKey(example.english))} onClick={()=>createExample(example)}>{added.has(exampleKey(example.english))?'Já está no baralho':examplesBusy===exampleKey(example.english)?'Adicionando…':'Adicionar como cartão'}</Button>
            </div>)}
            <Button className="w-full" variant="outline" disabled={loading||!!examplesBusy} onClick={moreExamples}>{examplesBusy==='more'?'Gerando exemplos…':'Gerar mais exemplos'}</Button>
          </section>}
        </div>
      </DrawerContent>
    </Drawer>
  </>;
}
