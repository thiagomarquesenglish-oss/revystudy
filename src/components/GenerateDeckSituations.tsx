import { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from './ui/drawer';
import { generateDeckSituations, saveGeneratedSituations, type GeneratedSituation } from '@/lib/deck-generation';

export default function GenerateDeckSituations({deckId, onSaved}: {deckId: string; onSaved: () => void}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<GeneratedSituation[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'generate' | 'save' | ''>('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const generate = async () => {
    if (lock.current) return;
    lock.current = true; setBusy('generate'); setError('');
    try { setItems(await generateDeckSituations(deckId)); setSaved(new Set()); }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível gerar.'); }
    finally { lock.current = false; setBusy(''); }
  };
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setBusy('save'); setError('');
    try {
      await saveGeneratedSituations(deckId, items, english => setSaved(old => new Set([...old, english])));
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
          {!!items.length && <div className="space-y-3">{items.map(item => <article key={item.english} className="rounded-xl bg-secondary p-4 space-y-2">
            <p className="text-xs text-muted-foreground">{item.kind === 'bridge' ? `Gancho: ${item.anchor}` : `Vocabulário novo: ${item.newVocabulary}`}</p>
            <p lang="en" className="font-medium">{item.english}</p><p>{item.portuguese}</p><p className="text-sm text-muted-foreground">{item.imagePrompt}</p>
            {item.kind === 'bridge' && <p className="text-xs text-muted-foreground">A partir de: {item.sourceEnglish}</p>}
            {saved.has(item.english) && <p className="text-xs text-primary">Adicionado</p>}
          </article>)}</div>}
          {items.length > saved.size && <Button className="w-full" disabled={!!busy} onClick={save}>{busy === 'save' ? 'Adicionando…' : 'Adicionar situações ao baralho'}</Button>}
          {(!items.length || saved.size === items.length) && <Button className="w-full" disabled={!!busy} onClick={generate}>{busy === 'generate' ? 'Analisando o baralho e gerando…' : items.length ? 'Gerar mais 20 situações' : 'Gerar agora'}</Button>}
          {!!items.length && !saved.size && <Button variant="secondary" className="w-full" disabled={!!busy} onClick={generate}>{busy === 'generate' ? 'Gerando outra leva…' : 'Descartar prévia e gerar outra leva'}</Button>}
          {!!items.length && saved.size < items.length && <p className="text-xs text-muted-foreground">Adicione esta leva antes de gerar a próxima. Fechar a gaveta mantém esta prévia enquanto você estiver nesta página.</p>}
        </div>
      </DrawerContent>
    </Drawer>
  </>;
}
