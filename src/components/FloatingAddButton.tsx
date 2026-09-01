import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Layers, RectangleHorizontal, Type, Keyboard } from 'lucide-react';
import { getDecks, addDeck } from '@/lib/storage';
import { Deck } from '@/lib/types';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

interface FloatingAddButtonProps {
  deckId?: string;
  onDeckCreated?: () => void;
}

export default function FloatingAddButton({ deckId, onDeckCreated }: FloatingAddButtonProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [showActions, setShowActions] = useState(false);
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [showCreateDeck, setShowCreateDeck] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [pendingDeckId, setPendingDeckId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState('');
  const [deckDesc, setDeckDesc] = useState('');
  const [decks, setDecks] = useState<Deck[]>([]);

  useEffect(() => {
    getDecks().then(setDecks).catch(console.error);
  }, []);

  const goToAdd = (targetDeckId: string) => {
    setPendingDeckId(targetDeckId);
    setShowTypePicker(true);
  };

  const handleClick = () => {
    if (deckId) {
      goToAdd(deckId);
      return;
    }
    if (isMobile) {
      setShowActions(true);
    } else {
      if (decks.length === 0) return;
      if (decks.length === 1) {
        goToAdd(decks[0].id);
        return;
      }
      setShowDeckPicker(true);
    }
  };

  const handleAddCard = () => {
    setShowActions(false);
    if (decks.length === 0) return;
    if (decks.length === 1) {
      goToAdd(decks[0].id);
      return;
    }
    setShowDeckPicker(true);
  };

  const handleCreateDeckOpen = () => {
    setShowActions(false);
    setShowCreateDeck(true);
  };

  const handleCreateDeckSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckName.trim()) return;
    await addDeck(deckName.trim(), deckDesc.trim());
    setDeckName('');
    setDeckDesc('');
    setShowCreateDeck(false);
    const updated = await getDecks();
    setDecks(updated);
    onDeckCreated?.();
  };

  if (!deckId && decks.length === 0 && !isMobile) return null;

  return (
    <>
      <button
        onClick={handleClick}
        className="fixed right-4 z-30 w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all"
        style={{ backgroundColor: 'hsl(var(--card))', color: '#9ca3af', bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
        aria-label="Adicionar"
      >
        <Plus className="w-6 h-6" />
      </button>

      <Drawer open={showActions} onOpenChange={setShowActions}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Adicionar</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            <button className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors" onClick={handleCreateDeckOpen}>
              <Layers className="w-5 h-5 text-muted-foreground" /> Novo baralho
            </button>
            {decks.length > 0 && (
              <button className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors" onClick={handleAddCard}>
                <RectangleHorizontal className="w-5 h-5 text-muted-foreground" /> Adicionar flashcard
              </button>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {isMobile ? (
        <Drawer open={showDeckPicker} onOpenChange={setShowDeckPicker}>
          <DrawerContent>
            <DrawerHeader><DrawerTitle>Escolha o baralho</DrawerTitle></DrawerHeader>
            <div className="flex flex-col gap-1 px-4 pb-6 max-h-60 overflow-y-auto">
              {decks.map((deck) => (
                <button key={deck.id} onClick={() => { setShowDeckPicker(false); goToAdd(deck.id); }} className="w-full text-left px-3 py-3 rounded-lg hover:bg-secondary transition-colors text-sm font-medium truncate">
                  {deck.name}
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showDeckPicker} onOpenChange={setShowDeckPicker}>
          <DialogContent className="max-w-xs">
            <DialogHeader><DialogTitle>Escolha o baralho</DialogTitle></DialogHeader>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {decks.map((deck) => (
                <button key={deck.id} onClick={() => { setShowDeckPicker(false); goToAdd(deck.id); }} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-sm font-medium truncate">
                  {deck.name}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Card type picker */}
      {isMobile ? (
        <Drawer open={showTypePicker} onOpenChange={setShowTypePicker}>
          <DrawerContent>
            <DrawerHeader><DrawerTitle>Tipo de cartão</DrawerTitle></DrawerHeader>
            <div className="flex flex-col gap-1 px-4 pb-6">
              <button
                className="flex items-start gap-3 px-3 py-3 rounded-lg text-left hover:bg-secondary transition-colors"
                onClick={() => { setShowTypePicker(false); if (pendingDeckId) navigate(`/deck/${pendingDeckId}/add`); }}
              >
                <Type className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm text-foreground">Padrão</div>
                  <div className="text-xs text-muted-foreground">Vê frente, revela verso e avalia</div>
                </div>
              </button>
              <button
                className="flex items-start gap-3 px-3 py-3 rounded-lg text-left hover:bg-secondary transition-colors"
                onClick={() => { setShowTypePicker(false); if (pendingDeckId) navigate(`/deck/${pendingDeckId}/add?type=typing`); }}
              >
                <Keyboard className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm text-foreground">Digitar resposta</div>
                  <div className="text-xs text-muted-foreground">Você digita e o app confere com a resposta certa</div>
                </div>
              </button>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showTypePicker} onOpenChange={setShowTypePicker}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Tipo de cartão</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-1 mt-2">
              <button
                className="flex items-start gap-3 px-3 py-3 rounded-lg text-left hover:bg-secondary transition-colors"
                onClick={() => { setShowTypePicker(false); if (pendingDeckId) navigate(`/deck/${pendingDeckId}/add`); }}
              >
                <Type className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm text-foreground">Padrão</div>
                  <div className="text-xs text-muted-foreground">Vê frente, revela verso e avalia</div>
                </div>
              </button>
              <button
                className="flex items-start gap-3 px-3 py-3 rounded-lg text-left hover:bg-secondary transition-colors"
                onClick={() => { setShowTypePicker(false); if (pendingDeckId) navigate(`/deck/${pendingDeckId}/add?type=typing`); }}
              >
                <Keyboard className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm text-foreground">Digitar resposta</div>
                  <div className="text-xs text-muted-foreground">Você digita e o app confere com a resposta certa</div>
                </div>
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isMobile ? (
        <Drawer open={showCreateDeck} onOpenChange={setShowCreateDeck}>
          <DrawerContent>
            <DrawerHeader><DrawerTitle>Criar Baralho</DrawerTitle></DrawerHeader>
            <form onSubmit={handleCreateDeckSubmit} className="flex flex-col gap-4 px-4 pb-6">
              <Input placeholder="Nome do baralho" value={deckName} onChange={e => setDeckName(e.target.value)} autoFocus />
              <Textarea placeholder="Descrição (opcional)" value={deckDesc} onChange={e => setDeckDesc(e.target.value)} rows={2} />
              <Button type="submit" disabled={!deckName.trim()}>Criar</Button>
            </form>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showCreateDeck} onOpenChange={setShowCreateDeck}>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Baralho</DialogTitle></DialogHeader>
            <form onSubmit={handleCreateDeckSubmit} className="flex flex-col gap-4 mt-2">
              <Input placeholder="Nome do baralho" value={deckName} onChange={e => setDeckName(e.target.value)} autoFocus />
              <Textarea placeholder="Descrição (opcional)" value={deckDesc} onChange={e => setDeckDesc(e.target.value)} rows={2} />
              <Button type="submit" disabled={!deckName.trim()}>Criar</Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
