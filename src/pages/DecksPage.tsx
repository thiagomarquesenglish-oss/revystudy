import LibraryManagePage from './LibraryManagePage';
import { matchesCardMedia, mediaFilters, type CardMediaFilter } from '@/lib/card-media-filter';
import { toast } from 'sonner';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTabVisible } from '@/hooks/useTabVisible';
import { getDecks, getLocalCardSummaries, deleteCard, updateCard } from '@/lib/storage';
import { Flashcard, Deck } from '@/lib/types';
import { Trash2, Pencil, Search, ChevronDown, Inbox, Flag } from 'lucide-react';
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
import PageHeader from '@/components/PageHeader';
import PageTransition from '@/components/PageTransition';
import CardThumbnail from '@/components/CardThumbnail';
import QuickCardMedia from '@/components/QuickCardMedia';
import GenerateDeckSituations from '@/components/GenerateDeckSituations';
import { readSituation } from '@/lib/situation';

import { useIsMobile } from '@/hooks/use-mobile';

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

function englishText(card: Flashcard): string {
  return readSituation(card.front, card.back)?.english || stripHtml(card.front) || stripHtml(card.back) || 'Frase em inglês';
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
  const [mediaFilter, setMediaFilter] = useState<CardMediaFilter>('all');
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
    let result = cards.filter(c => c.deckId === searchParams.get('deck'));
    
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
    return result.filter(card => matchesCardMedia(card, mediaFilter)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [cards, selectedDeck, search, onlyFlagged, searchParams, mediaFilter]);

  const flaggedCount = useMemo(() => cards.filter(c => c.flagged && c.deckId === searchParams.get('deck')).length, [cards, searchParams]);

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
      try {
      await deleteCard(deleteTarget);
      setCards(previous => previous.filter(card => card.id !== deleteTarget));
      setDeleteTarget(null);
      toast.success('Cartão excluído');
      } catch { toast.error('Não foi possível excluir o cartão. Tente novamente.'); }
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
        <PageHeader title="Biblioteca" />
        <main className="max-w-3xl mx-auto px-3 py-4 space-y-4" style={{ paddingTop: 'calc(var(--app-header-height) + 1rem)' }}>
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-4 w-20" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  const deckFromParam = searchParams.get('deck');
  const filteredDeckName = deckFromParam ? decks.find(d => d.id === deckFromParam)?.name : null;

  if (!deckFromParam) return <div className="min-h-screen bg-background safe-bottom">
    <PageHeader title="Biblioteca" rightContent={<LibraryManagePage embedded onChanged={loadData} />} />
    <main className="max-w-3xl mx-auto px-4 space-y-5 pb-8" style={{ paddingTop: 'calc(var(--app-header-height) + 1.5rem)' }}>
      <h1 className="text-2xl font-semibold">Baralhos</h1>
      <div className="native-list">{decks.map(deck => <button key={deck.id} className="native-row" onClick={() => navigate('/decks?deck=' + deck.id)}><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-semibold" style={{ backgroundColor: ['#283b38','#3d3247','#403628'][Array.from(deck.id).reduce((a,c)=>a+c.charCodeAt(0),0)%3] }}>{deck.name.slice(0,1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block font-semibold truncate">{deck.name}</span><span className="block text-sm text-muted-foreground mt-1">{cards.filter(card => card.deckId === deck.id).length} cartões · Áudios do baralho</span></span><ChevronDown className="h-5 w-5 -rotate-90 text-muted-foreground" /></button>)}</div>
      {decks.length === 0 && <div className="space-y-4"><p className="text-muted-foreground">Crie ou importe seu primeiro baralho.</p><Button onClick={() => navigate('/library/manage')}>Adicionar baralho</Button></div>}
    </main>
  </div>;

  return (
    <div className="min-h-screen bg-background safe-bottom">
      <PageHeader
        title={filteredDeckName || 'Cartões'}
        rightContent={<LibraryManagePage embedded targetDeckId={deckFromParam || undefined} onChanged={loadData} />}
        onBack={() => navigate('/decks')}
      />
      <PageTransition>
      <main className="max-w-3xl mx-auto px-3 py-4 space-y-4" style={{ paddingTop: 'calc(var(--app-header-height) + 1rem)' }}>
        <div className="flex gap-3"><Button variant="secondary" className="flex-1" onClick={() => navigate('/deck/' + deckFromParam + '/audios')}>Textos e áudios</Button><Button variant="secondary" className="flex-1" onClick={() => navigate('/deck/' + deckFromParam + '/add')}>Adicionar cartão</Button></div>
        <GenerateDeckSituations key={deckFromParam} deckId={deckFromParam} onSaved={loadData}/>
        <h2 className="text-lg font-semibold pt-2">Cartões</h2>
        {/* Tabs: Todos / Marcados */}
        <div className="flex gap-1 bg-card p-1 rounded-xl">
          <button
            onClick={() => setOnlyFlagged(false)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!onlyFlagged ? 'bg-secondary text-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:bg-card/80'}`}
          >
            Todos
          </button>
          <button
            onClick={() => setOnlyFlagged(true)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${onlyFlagged ? 'bg-secondary text-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:bg-card/80'}`}
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

        </div>

        <label className="block space-y-2">
          <span className="text-sm text-muted-foreground">Filtrar por mídia</span>
          <select value={mediaFilter} onChange={event=>setMediaFilter(event.target.value as CardMediaFilter)} className="w-full rounded-xl border border-border bg-card px-3 py-3 text-sm text-foreground">
            {mediaFilters.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">{filteredCards.length} {filteredCards.length === 1 ? 'situação' : 'situações'}</p>

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
              <QuickCardMedia key={card.id} card={card} onSaved={loadData}>
              <button
                onClick={() => isMobile ? setActionCard(card) : openEdit(card)}
                className="w-full text-left hover:bg-secondary/50 p-3.5 pr-12 transition-colors"
              >
                {hasImage(card.front + card.back) && <CardThumbnail cardId={card.id} alt={`Imagem do cartão ${englishText(card)}`} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <p className="text-sm font-medium truncate" lang="en">{englishText(card)}</p>
                    {card.flagged && <Flag className="w-3.5 h-3.5 fill-red-500 text-red-500 shrink-0 ml-auto" />}
                  </div>
                </div>
              </button>
              <button type="button" aria-label={`Excluir cartão: ${englishText(card)}`} title="Excluir cartão"
                onClick={() => openDelete(card)}
                className="absolute right-1 top-1 p-3 rounded-xl bg-card text-destructive hover:bg-destructive/10 sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity">
                <Trash2 className="w-5 h-5" />
              </button>
              </QuickCardMedia>
            ))}
          </div>
        )}
      </main>
      </PageTransition>

      <Drawer open={!!actionCard} onOpenChange={(open) => !open && setActionCard(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="truncate" lang="en">{actionCard ? englishText(actionCard) : ''}</DrawerTitle>
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

    </div>
  );
}
