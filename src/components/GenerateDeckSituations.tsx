import { useRef, useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from './ui/drawer';
import { generateDeckSituations, saveGeneratedSituations, type GeneratedSituation } from '@/lib/deck-generation';

export default function GenerateDeckSituations({deckId, onSaved}: {deckId: string; onSaved: () => void}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<GeneratedSituation[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const history = useRef<string[]>([]);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const generate = async () => {
    if (lock.current) return;
    lock.current = true; setBusy('generate'); setError('');
    try { const fresh = await generateDeckSituations(deckId); setItems(fresh); setSaved(new Set()); setSelected(new Set(fresh.map(item=>item.english))); history.current=fresh.map(item=>item.english); }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível gerar.'); }
    finally { lock.current = false; setBusy(''); }
  };
  const replace = async (item: GeneratedSituation) => {
    if (lock.current || saved.has(item.english)) return;
    lock.current=true; setBusy(item.english); setError('');
    try {
      const [fresh]=await generateDeckSituations(deckId,{kind:item.kind,excluded:history.current});
      setItems(old=>old.map(value=>value.english===item.english?fresh:value));
      history.current=[...history.current,fresh.english];
      setSelected(old=>{const next=new Set(old);if(next.delete(item.english))next.add(fresh.english);return next;});
    } catch(error){setError(error instanceof Error?error.message:'Não foi possível trocar.');}
    finally{lock.current=false;setBusy('');}
  };
  const save = async (all = false) => {
    if (lock.current) return;
    lock.current = true; setBusy('save'); setError('');
    try {
      await saveGeneratedSituations(deckId, items.filter(item=>!saved.has(item.english)&&(all||selected.has(item.english))), english => setSaved(old => new Set([...old, english])));
      toast.success('Situações adicionadas ao baralho.');
    } catch { setError('Não foi possível adicionar tudo. Tente novamente: os cartões já salvos não serão duplicados.'); }
    finally { onSaved(); lock.current = false; setBusy(''); }
  };
  return <>
    <Button variant="secondary" className="w-full gap-2" onClick={() => setOpen(true)}><Sparkles className="h-4 w-4"/>Gerar 20 situações</Button>
    <Drawer open={open} onOpenChange={value => {if (!lock.current) setOpen(value);}}>
      <DrawerContent className="max-h-[90dvh]">
        <DrawerHeader><DrawerTitle>Novas situações com IA</DrawerTitle></DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6 space-y-4">
          <p className="text-sm text-muted-foreground">10 situações puxando o gancho do seu baralho e 10 com vocabulário novo. Em um baralho vazio, serão 20 situações iniciais. Confira antes de adicionar; imagens e áudios ficam para você anexar.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {!!items.length && <div className="space-y-3">{items.map(item => <article key={item.english} className="relative rounded-xl bg-secondary p-4 pr-14 space-y-2">
            {!saved.has(item.english)&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`Selecionar: ${item.english}`} checked={selected.has(item.english)} disabled={!!busy} onChange={()=>setSelected(old=>{const next=new Set(old);if(!next.delete(item.english))next.add(item.english);return next;})}/>Selecionar cartão</label>}
            <p className="text-xs text-muted-foreground">{item.kind === 'bridge' ? `Gancho: ${item.anchor}` : `Vocabulário novo: ${item.newVocabulary}`}</p>
            <p lang="en" className="font-medium">{item.english}</p><p>{item.portuguese}</p><p className="text-sm text-muted-foreground">{item.imagePrompt}</p>
            {item.kind === 'bridge' && <p className="text-xs text-muted-foreground">A partir de: {item.sourceEnglish}</p>}
            {saved.has(item.english) && <p className="text-xs text-primary">Adicionado</p>}
            {!saved.has(item.english)&&<button type="button" aria-label="Trocar esta" title="Trocar sugestão" aria-busy={busy===item.english} disabled={!!busy} className="absolute right-1 top-1 !mt-0 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-background/40 hover:text-foreground disabled:opacity-40" onClick={()=>replace(item)}><RefreshCw aria-hidden="true" className={`h-5 w-5 ${busy===item.english?'animate-spin':''}`}/></button>}
          </article>)}</div>}
          {items.length > saved.size && <><Button className="w-full" disabled={!!busy||!items.some(item=>selected.has(item.english)&&!saved.has(item.english))} onClick={()=>save()}>{busy === 'save' ? 'Adicionando…' : 'Adicionar selecionadas'}</Button><Button variant="secondary" className="w-full" disabled={!!busy} onClick={()=>save(true)}>Adicionar todas as restantes</Button></>}
          {(!items.length || saved.size === items.length) && <Button className="w-full" disabled={!!busy} onClick={generate}>{busy === 'generate' ? 'Analisando o baralho e gerando…' : items.length ? 'Gerar mais 20 situações' : 'Gerar agora'}</Button>}
          {!!items.length && saved.size < items.length && <Button variant="secondary" className="w-full" disabled={!!busy} onClick={generate}>{busy === 'generate' ? 'Gerando outra leva…' : 'Descartar não adicionadas e gerar outra leva'}</Button>}
          {!!items.length && <p className="text-xs text-muted-foreground">Fechar a gaveta mantém esta prévia enquanto você estiver nesta página. Cartões adicionados não são alterados ao trocar sugestões ou gerar outra leva.</p>}
        </div>
      </DrawerContent>
    </Drawer>
  </>;
}
