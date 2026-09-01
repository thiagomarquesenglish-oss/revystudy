import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTabVisible } from '@/hooks/useTabVisible';
import { getDecks, getLocalCardSummaries, deleteCard, updateCard } from '@/lib/storage';
import { Flashcard, Deck } from '@/lib/types';
import { Trash2, Pencil, Search, ChevronDown, Check, Volume2, ImageIcon, Inbox, Flag } from 'lucide-react';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import PageTransition from '@/components/PageTransition';

import { useIsMobile } from '@/hooks/use-mobile';

function hasAudio(html: string): boolean {
  return /<audio|class="audio-node"/i.test(html);
}

function hasImage(html: string): boolean {
  return /<img\s/i.test(html);
}
function stripHtml(html: string): string {
  // Remove audio nodes entirely (including file names)
  let cleaned = html.replace(/<div[^>]*class="audio-node"[^>]*>[\s\S]*?<\/div>/gi, '');
  // Remove any remaining audio elements
  cleaned = cleaned.replace(/<audio[^>]*>[\s\S]*?<\/audio>/gi, '');
  cleaned = cleaned.replace(/<audio[^>]*\/?>/gi, '');
  return cleaned.replace(/<[^>]*>/g, '').trim();
}

function statusLabel(status: string) {
  switch (status) {
    case 'new': return 'Novo';
    case 'learning': return 'Aprendendo';
    case 'relearning': return 'Reaprendendo';
    case 'review': return 'Revisão';
    default: return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'new': return 'text-col-new';
    case 'learning': case 'relearning': return 'text-col-learning';
    case 'review': return 'text-col-review';
    default: return 'text-muted-foreground';
  }
}

export default function DecksPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeck, setSelectedDeck] = useState<string>('all');
  const [searchParams] = useSearchParams();
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  // Pre-select deck from query param
  useEffect(() => {
    const deckParam = searchParams.get('deck');
    if (deckParam) setSelectedDeck(deckParam);
    if (searchParams.get('flagged') === '1') setOnlyFlagged(true);
  }, [searchParams]);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [actionCard, setActionCard] = useState<Flashcard | null>(null);

  const loadData = async () => {
    try {
      const [d, c] = await Promise.all([getDecks(), getLocalCardSummaries()]);
      setDecks(d);
      setCards(c);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);
  useTabVisible('/decks', useCallback(() => { loadData(); }, []));

  const filteredCards = useMemo(() => {
    let result = cards;
    if (selectedDeck !== 'all') {
      result = result.filter(c => c.deckId === selectedDeck);
    }
    if (onlyFlagged) {
      result = result.filter(c => c.flagged);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        stripHtml(c.front).toLowerCase().includes(q) ||
        stripHtml(c.back).toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [cards, selectedDeck, search, onlyFlagged]);

  const flaggedCount = useMemo(() => cards.filter(c => c.flagged).length, [cards]);

  const toggleFlag = async (card: Flashcard) => {
    const newFlagged = !card.flagged;
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, flagged: newFlagged } : c));
    setActionCard(null);
    try {
      await updateCard(card.id, { flagged: newFlagged });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteCard(deleteTarget);
      setDeleteTarget(null);
      loadData();
    }
  };

  const openEdit = (card: Flashcard) => {
    setActionCard(null);
    navigate(`/card/${card.id}/edit`);
  };

  const openDelete = (card: Flashcard) => {
    setDeleteTarget(card.id);
    setActionCard(null);
  };

  const deckName = (deckId: string) => decks.find(d => d.id === deckId)?.name || 'Desconhecido';

  if (loading) {
    return (
      <div className="min-h-screen bg-background safe-bottom">
        <PageHeader title="Painel" />
        <main className="max-w-3xl mx-auto px-3 py-4 space-y-4" style={{ paddingTop: 'calc(var(--app-header-height) + 1rem)' }}>
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-4 w-20" />
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        </main>
        <BottomNav active="decks" />
      </div>
    );
  }

  const deckFromParam = searchParams.get('deck');
  const filteredDeckName = deckFromParam ? decks.find(d => d.id === deckFromParam)?.name : null;

  return (
    <div className="min-h-screen bg-background safe-bottom">
      <PageHeader
        title={filteredDeckName ? `Cartões — ${filteredDeckName}` : 'Painel'}
        onBack={deckFromParam ? () => navigate(`/deck/${deckFromParam}`) : undefined}
      />
      <PageTransition>
      <main className="max-w-3xl mx-auto px-3 py-4 space-y-4" style={{ paddingTop: 'calc(var(--app-header-height) + 1rem)' }}>
        {/* Tabs: Todos / Marcados */}
        <div className="flex gap-2">
          <button
            onClick={() => setOnlyFlagged(false)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!onlyFlagged ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-card/80'}`}
          >
            Todos
          </button>
          <button
            onClick={() => setOnlyFlagged(true)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${onlyFlagged ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-card/80'}`}
          >
            <Flag className={`w-4 h-4 ${onlyFlagged ? '' : 'fill-red-500 text-red-500'}`} />
            Marcados {flaggedCount > 0 && <span className="text-xs opacity-70">({flaggedCount})</span>}
          </button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar cartões..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-card focus:ring-0 focus:outline-none focus-visible:ring-0" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 bg-card text-foreground text-sm rounded-lg px-3 py-2 border-none focus:outline-none focus:ring-1 focus:ring-ring transition-colors hover:bg-card/80">
              <span className="truncate max-w-[100px]">
                {selectedDeck === 'all' ? 'Todos' : decks.find(d => d.id === selectedDeck)?.name || 'Todos'}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px] bg-card border border-border/50 backdrop-blur-sm">
              <DropdownMenuItem
                onClick={() => setSelectedDeck('all')}
                className="flex items-center justify-between gap-2 cursor-pointer"
              >
                Todos
                {selectedDeck === 'all' && <Check className="w-4 h-4 text-accent" />}
              </DropdownMenuItem>
              {decks.map(d => (
                <DropdownMenuItem
                  key={d.id}
                  onClick={() => setSelectedDeck(d.id)}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="truncate">{d.name}</span>
                  {selectedDeck === d.id && <Check className="w-4 h-4 text-accent" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-xs text-muted-foreground">{filteredCards.length} {filteredCards.length === 1 ? 'cartão' : 'cartões'}</p>

        {filteredCards.length === 0 ? (
          <div className="text-center py-12">
            <Inbox className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground text-sm">
              {cards.length === 0 ? 'Nenhum cartão criado ainda.' : 'Nenhum cartão encontrado.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filteredCards.map((card, index) => (
              <button
                key={card.id}
                onClick={() => isMobile ? setActionCard(card) : openEdit(card)}
                className="w-full text-left bg-card hover:bg-secondary/50 border border-border rounded-lg px-3 py-2.5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-base font-medium truncate">{stripHtml(card.front)}</p>
                    {hasAudio(card.front) && <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />}
                    {hasImage(card.front) && <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />}
                    {card.flagged && <Flag className="w-3.5 h-3.5 fill-red-500 text-red-500 shrink-0 ml-auto" />}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{stripHtml(card.back)}</p>
                    {hasAudio(card.back) && <Volume2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    {hasImage(card.back) && <ImageIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
      </PageTransition>

      <Drawer open={!!actionCard} onOpenChange={(open) => !open && setActionCard(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="truncate">{actionCard ? stripHtml(actionCard.front) : ''}</DrawerTitle>
            {actionCard && (
              <p className="text-sm text-muted-foreground">
                {new Date(actionCard.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            )}
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            <button className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-foreground transition-colors" style={{ backgroundColor: '#1a1a1a' }} onClick={() => actionCard && openEdit(actionCard)}>
              <Pencil className="w-5 h-5 text-muted-foreground" /> Editar cartão
            </button>
            <button className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-foreground transition-colors" style={{ backgroundColor: '#1a1a1a' }} onClick={() => actionCard && toggleFlag(actionCard)}>
              <Flag className={`w-5 h-5 ${actionCard?.flagged ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
              {actionCard?.flagged ? 'Desmarcar cartão' : 'Marcar cartão'}
            </button>
            <button className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-destructive transition-colors" style={{ backgroundColor: '#1a1a1a' }} onClick={() => actionCard && openDelete(actionCard)}>
              <Trash2 className="w-5 h-5" /> Excluir cartão
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {isMobile ? (
        <Drawer open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Excluir cartão</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6 space-y-4">
              <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este cartão? Esta ação não pode ser desfeita.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                <Button variant="destructive" className="flex-1" onClick={handleDelete}>Excluir</Button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir cartão</AlertDialogTitle>
              <AlertDialogDescription>Tem certeza que deseja excluir este cartão? Esta ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <BottomNav active="decks" />
    </div>
  );
}
