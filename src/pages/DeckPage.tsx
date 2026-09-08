import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDecks, getCardsByDeck, getNewCards, getLearningCards, getReviewCards, invalidateDeckAudios, forceSyncDeckCards, checkDeckUpdates, downloadDeckPackage } from '@/lib/storage';
import { Deck, Flashcard } from '@/lib/types';
import { Play, Plus, Layers, MoreVertical, Music, RefreshCw, LayoutGrid, ListPlus, CloudDownload, Sparkles, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/PageHeader';
import BulkAddCardsDrawer from '@/components/BulkAddCardsDrawer';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';


export default function DeckPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [learningCount, setLearningCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleForceSync = async () => {
    if (!deckId || syncing) return;
    setSyncing(true);
    try {
      invalidateDeckAudios(deckId);
      const [deckCards, newC, learningC, reviewC] = await Promise.all([
        forceSyncDeckCards(deckId),
        getNewCards(deckId),
        getLearningCards(deckId),
        getReviewCards(deckId),
      ]);
      setCards(deckCards);
      setNewCount(newC.length);
      setLearningCount(learningC.length);
      setReviewCount(reviewC.length);
      toast.success(`${deckCards.length} cards sincronizados!`);
    } catch (err) {
      console.error(err);
      toast.error('Falha ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!deckId || syncing) return;
    setSyncing(true);
    try {
      const updates = await checkDeckUpdates();
      const update = updates.find((item) => item.deckId === deckId);
      if (!update) {
        toast.success('Este baralho já está atualizado');
        return;
      }
      toast.message(`Baixando ${update.name}…`);
      await downloadDeckPackage(update);
      toast.success('Atualização instalada neste aparelho');
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Falha ao baixar atualização');
    } finally {
      setSyncing(false);
    }
  };

  const loadData = async () => {
    try {
      const [allDecks, deckCards, newC, learningC, reviewC] = await Promise.all([
        getDecks(),
        getCardsByDeck(deckId!),
        getNewCards(deckId!),
        getLearningCards(deckId!),
        getReviewCards(deckId!),
      ]);
      const found = allDecks.find(d => d.id === deckId);
      setDeck(found || null);
      setCards(deckCards);
      setNewCount(newC.length);
      setLearningCount(learningC.length);
      setReviewCount(reviewC.length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (deckId) try { localStorage.setItem('revystudy:last-deck', deckId); } catch { /* optional preference */ }
  }, [deckId]);

  const studyCount = newCount + learningCount + reviewCount;

  if (loading) {
    return (
      <div className="min-h-screen bg-background safe-page">
        <PageHeader title="" onBack={() => navigate('/')} />
        <main className="max-w-3xl mx-auto px-3 space-y-6" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-36 rounded-md" />
              <Skeleton className="h-10 w-36 rounded-md" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!deck) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Baralho não encontrado.</p></div>;
  }

  return (
    <div className="min-h-screen bg-background safe-page">
      <PageHeader
        title="Baralho"
        onBack={() => navigate('/')}
        rightContent={
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir opções do baralho"
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        }
      />
      <main className="max-w-3xl mx-auto px-3 space-y-6 pb-24" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
        <h1 className="native-title break-words">{deck.name}</h1>
        {cards.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <Layers className="w-14 h-14 mx-auto text-muted-foreground/50" />
            <h2 className="text-xl font-bold">Baralho vazio</h2>
            <p className="text-muted-foreground text-sm">Abra o menu de opções e escolha Criar situação para adicionar seus primeiros cards.</p>
          </div>
        ) : studyCount === 0 ? (
          <div className="text-center py-12 space-y-4">
            <h2 className="text-xl font-bold">Revisões de hoje concluídas</h2>
            <p className="text-muted-foreground text-sm">Você pode continuar no treino livre.</p>
          </div>
        ) : (
          <>
            <div className="flex justify-around py-6 border-b border-border/60">
              <div className="flex flex-col items-center">
                <span className="text-3xl font-semibold tabular-nums text-col-new">{newCount}</span>
                <span className="text-sm text-foreground">Novo</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-3xl font-semibold tabular-nums text-col-learning">{learningCount}</span>
                <span className="text-sm text-foreground">Aprendendo</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-3xl font-semibold tabular-nums text-col-review">{reviewCount}</span>
                <span className="text-sm text-foreground">Revisar</span>
              </div>
            </div>
            
          </>
        )}

        <div className="native-list">
          <button type="button" disabled={!studyCount} onClick={() => navigate('/study/' + deckId)} className="native-row disabled:opacity-50">
            <Play className="h-6 w-6 shrink-0 text-primary" />
            <span className="min-w-0 flex-1"><span className="block font-bold">Estudar cards disponíveis</span><span className="block text-sm text-muted-foreground">{studyCount ? studyCount + ' cards para estudar agora' : 'Nenhum card agendado para agora'}</span></span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          <button type="button" disabled={!cards.length} onClick={() => navigate('/practice/' + deckId)} className="native-row disabled:opacity-50">
            <Sparkles className="h-6 w-6 shrink-0 text-primary" />
            <span className="min-w-0 flex-1"><span className="block font-bold">Treino livre</span><span className="block text-sm text-muted-foreground">Escolha escuta, produção, ditado ou aleatório</span></span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </main>

      {/* Menu drawer */}
      <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="font-display">Opções</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2">
            <button onClick={() => { setMenuOpen(false); navigate('/deck/' + deckId + '/add'); }} className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border text-sm">
              <Plus className="w-4 h-4" /> Criar situação
            </button>
            <button onClick={() => { setMenuOpen(false); navigate('/deck/' + deckId + '/audios'); }} className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border text-sm">
              <Music className="w-4 h-4" /> Textos e áudios
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                navigate(`/decks?deck=${deckId}`);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border text-sm hover:bg-card/80 transition-colors"
            >
              <LayoutGrid className="w-4 h-4 text-muted-foreground" />
              Biblioteca
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setTimeout(() => handleForceSync(), 200);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border text-sm hover:bg-card/80 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${syncing ? 'animate-spin' : ''}`} />
              Sincronizar cards
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setTimeout(() => handleDownloadUpdate(), 200);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border text-sm hover:bg-card/80 transition-colors"
            >
              <CloudDownload className={`w-4 h-4 text-muted-foreground ${syncing ? 'animate-pulse' : ''}`} />
              Baixar atualização da nuvem
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setTimeout(() => setBulkAddOpen(true), 200);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border text-sm hover:bg-card/80 transition-colors"
            >
              <ListPlus className="w-4 h-4 text-muted-foreground" />
              Adicionar em lote
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                navigate(`/deck/${deckId}/audios?create=1`);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border text-sm hover:bg-card/80 transition-colors"
            >
              <Plus className="w-4 h-4 text-muted-foreground" />
              Adicionar áudio
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Bulk add drawer */}
      <BulkAddCardsDrawer
        open={bulkAddOpen}
        onOpenChange={setBulkAddOpen}
        deckId={deckId!}
        onAdded={loadData}
      />
    </div>
  );
}
