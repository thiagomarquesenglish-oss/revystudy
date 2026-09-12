import { useEffect, useMemo, useState } from 'react';
import { Lightbulb, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { addCard } from '@/lib/storage';
import { escapeHtml } from '@/lib/situation';
import { findExplanations, markExplanationUsed, requestExplanation, saveExplanation, type LearningExplanation } from '@/lib/learning-help';

type Props = { sentence: string; portuguese: string; deckId: string; level?: string };

export default function UnderstandHelp({ sentence, portuguese, deckId, level = 'iniciante' }: Props) {
  const words = useMemo(() => sentence.match(/[\p{L}\p{N}'’-]+|[^\s]/gu) || [], [sentence]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  const [current, setCurrent] = useState<LearningExplanation | null>(null);
  const [related, setRelated] = useState<LearningExplanation[]>([]);
  const selectedText = [...selected].sort((a,b)=>a-b).map(index => words[index]).join(' ');

  useEffect(() => { setSelected([]); setQuestion(''); setCurrent(null); setRelated([]); setCreated(false); }, [sentence]);

  const toggle = (index: number) => {
    setCurrent(null); setCreated(false);
    setSelected(old => old.includes(index) ? old.filter(value => value !== index) : [...old, index]);
  };

  const lookup = async () => {
    if (!selectedText) return;
    setLoading(true);
    try {
      const result = await findExplanations(selectedText, sentence);
      setRelated(result.related);
      if (result.exact && !question.trim()) {
        setCurrent(result.exact);
        void markExplanationUsed(result.exact);
      } else if (result.related.length && !question.trim() && !related.length) {
        return;
      } else {
        const generated = await requestExplanation({ sentence, selectedText, portuguese, question, level });
        const saved = await saveExplanation({
          conceptKey: generated.conceptKey, selectedText, sentence,
          title: generated.title, explanation: generated.explanation,
          quickMeaning: generated.quickMeaning, cardFront: generated.cardFront, cardBack: generated.cardBack,
        });
        setCurrent(saved);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a ajuda.'); }
    finally { setLoading(false); }
  };

  const reuse = (item: LearningExplanation) => {
    setCurrent(item); setCreated(false); void markExplanationUsed(item);
  };

  const createConceptCard = async () => {
    if (!current || created) return;
    setLoading(true);
    try {
      await addCard(deckId, `<p><strong>${escapeHtml(current.cardFront)}</strong></p>`, `<p>${escapeHtml(current.cardBack).replace(/\n/g, '<br>')}</p>`);
      setCreated(true); toast.success('Cartão de conceito criado.');
    } catch { toast.error('Não foi possível criar o cartão de conceito.'); }
    finally { setLoading(false); }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground py-2">
      <Lightbulb className="h-4 w-4"/> Entender
    </button>
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>Entender esta frase</DrawerTitle></DrawerHeader>
        <div className="px-4 pb-6 space-y-5">
          <div className="flex flex-wrap justify-center gap-2" lang="en">
            {words.map((word,index)=><button type="button" key={`${word}-${index}`} onClick={()=>toggle(index)} className={`rounded-lg border px-3 py-2 text-lg ${selected.includes(index)?'border-primary bg-primary/15 text-primary':'border-border bg-background'}`}>{word}</button>)}
          </div>
          <p className="text-center text-xs text-muted-foreground">Toque em uma ou mais partes que você não entendeu.</p>

          {!current && <>
            {!!related.length && <div className="space-y-2"><p className="text-sm font-medium">Explicações que você já tem</p>{related.slice(0,3).map(item=><button key={item.id} type="button" onClick={()=>reuse(item)} className="w-full rounded-xl border border-border p-3 text-left"><span className="font-medium">{item.title}</span><span className="block text-xs text-muted-foreground mt-1">Exemplo: {item.sentence}</span></button>)}</div>}
            <Textarea value={question} onChange={event=>setQuestion(event.target.value)} placeholder="Pergunta opcional: por que usamos isso aqui?" rows={2}/>
            <Button className="w-full" disabled={!selectedText||loading} onClick={lookup}>{loading?<Loader2 className="h-4 w-4 animate-spin"/>:related.length&&!question.trim()?'Gerar uma nova explicação':`Explicar “${selectedText || 'trecho'}”`}</Button>
          </>}

          {current && <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
            <div><h3 className="text-lg font-semibold">{current.title}</h3><p className="text-primary font-medium">{current.quickMeaning}</p></div>
            <p className="whitespace-pre-line leading-relaxed">{current.explanation}</p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="secondary" onClick={()=>{setCurrent(null);setQuestion('');}}>Perguntar mais</Button>
              <Button disabled={loading||created} onClick={createConceptCard}>{created?'Cartão criado':'Criar cartão'}</Button>
            </div>
          </div>}
        </div>
      </DrawerContent>
    </Drawer>
  </>;
}
