import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { deleteCard, updateCard, getCardsByDeck } from '@/lib/storage';
import { setBlurPortuguese, useBlurPortuguese } from '@/lib/card-display-preferences';
import type { Flashcard } from '@/lib/types';
import UnderstandHelp from './UnderstandHelp';

export default function CardOptions({ card, sentence, portuguese, level }: {
  card: Flashcard; sentence: string; portuguese: string; level?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [explain, setExplain] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [flagged, setFlagged] = useState(card.flagged);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void getCardsByDeck(card.deckId).then(cards => {
      const saved = cards.find(item => item.id === card.id);
      if (active && saved) setFlagged(saved.flagged);
    }).catch(() => {});
    return () => { active = false; };
  }, [card.id, card.deckId, open]);
  const hidden = useBlurPortuguese(card.id);
  const row = 'w-full min-h-12 rounded-xl bg-secondary px-4 py-3 text-left';
  return <div onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <button type="button" aria-label="Opções" className="inline-flex h-11 w-11 items-center justify-center text-muted-foreground" onClick={() => { setOpen(true); setConfirmDelete(false); }}><MoreHorizontal aria-hidden="true" className="h-5 w-5" /></button>
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>{confirmDelete ? 'Excluir cartão?' : 'Opções do cartão'}</DrawerTitle></DrawerHeader>
        <div className="space-y-3 px-4 pb-6">
          {confirmDelete ? <>
            <p className="text-sm text-muted-foreground">Este cartão será excluído. Você voltará ao baralho sem registrar uma resposta.</p>
            <Button variant="destructive" className="w-full" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await deleteCard(card.id); setOpen(false); toast.success('Cartão excluído'); navigate(`/deck/${card.deckId}`, { replace: true }); }
              catch { toast.error('Não foi possível excluir o cartão.'); }
              finally { setBusy(false); }
            }}>Confirmar exclusão</Button>
            <Button variant="secondary" className="w-full" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</Button>
          </> : <>
            <button type="button" className={row} onClick={() => { setOpen(false); setExplain(true); }}>Explicação</button>
            <button type="button" className={row} disabled={busy} onClick={async () => {
              setBusy(true);
              try { await updateCard(card.id, { flagged: !flagged }); setFlagged(!flagged); toast.success(flagged ? 'Cartão desmarcado' : 'Cartão marcado'); }
              catch { toast.error('Não foi possível salvar a marcação.'); }
              finally { setBusy(false); }
            }}>{flagged ? 'Desmarcar cartão' : 'Marcar cartão'}</button>
            <button type="button" className={row} onClick={() => { setOpen(false); navigate(`/card/${card.id}/edit`); }}>Editar cartão</button>
            <div className={`${row} flex items-center justify-between gap-4`}>
              <label htmlFor={`blur-${card.id}`}><span className="block">Ocultar português</span><span className="block text-xs text-muted-foreground">Desfocar neste cartão, neste aparelho</span></label>
              <Switch id={`blur-${card.id}`} checked={hidden} disabled={!portuguese||busy} onCheckedChange={async value => {
                setBusy(true);
                try { await setBlurPortuguese(card.id, value); } catch { toast.error('Não foi possível salvar a preferência.'); }
                finally { setBusy(false); }
              }} />
            </div>
            <button type="button" className={`${row} text-destructive`} onClick={() => setConfirmDelete(true)}>Excluir cartão</button>
          </>}
        </div>
      </DrawerContent>
    </Drawer>
    <UnderstandHelp sentence={sentence} portuguese={portuguese} deckId={card.deckId} level={level} open={explain} onOpenChange={setExplain} hideTrigger />
  </div>;
}
