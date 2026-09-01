import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDecks, getCardsByDeck, getNewCards, getLearningCards, getReviewCards, getDeckAudios, invalidateDeckAudios, forceSyncDeckCards, checkDeckUpdates, downloadDeckPackage } from '@/lib/storage';
import type { DeckAudio } from '@/lib/storage';
import { Deck, Flashcard } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Play, Plus, Layers, MoreVertical, Repeat, RefreshCw, LayoutGrid, ListPlus, CloudDownload } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/PageHeader';
import Heatmap from '@/components/Heatmap';
import DeckAudioPlayer from '@/components/DeckAudioPlayer';
import type { DeckAudioPlayerHandle } from '@/components/DeckAudioPlayer';
import CreateDeckAudioDrawer from '@/components/CreateDeckAudioDrawer';
import BulkAddCardsDrawer from '@/components/BulkAddCardsDrawer';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
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
  const [createAudioOpen, setCreateAudioOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [audios, setAudios] = useState<DeckAudio[]>([]);
  const [autoPlay, setAutoPlay] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const playerRefs = useRef<(DeckAudioPlayerHandle | null)[]>([]);
  const isMobile = useIsMobile();

  const handleForceSync = async () => {
    if (!deckId || syncing) return;
    setSyncing(true);
    try {
      invalidateDeckAudios(deckId);
      const [deckCards, newC, learningC, reviewC, deckAudios] = await Promise.all([
        forceSyncDeckCards(deckId),
        getNewCards(deckId),
        getLearningCards(deckId),
        getReviewCards(deckId),
        getDeckAudios(deckId),
      ]);
      setCards(deckCards);
      setNewCount(newC.length);
      setLearningCount(learningC.length);
      setReviewCount(reviewC.length);
      setAudios(deckAudios);
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

  const handleAudioEnded = useCallback((index: number) => {
    if (autoPlay && index < audios.length - 1) {
      playerRefs.current[index + 1]?.play();
    }
  }, [autoPlay, audios.length]);

  const loadData = async () => {
    try {
      const [allDecks, deckCards, newC, learningC, reviewC, deckAudios] = await Promise.all([
        getDecks(),
        getCardsByDeck(deckId!),
        getNewCards(deckId!),
        getLearningCards(deckId!),
        getReviewCards(deckId!),
        getDeckAudios(deckId!),
      ]);
      const found = allDecks.find(d => d.id === deckId);
      setDeck(found || null);
      setCards(deckCards);
      setNewCount(newC.length);
      setLearningCount(learningC.length);
      setReviewCount(reviewC.length);
      setAudios(deckAudios);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadAudios = async () => {
    invalidateDeckAudios(deckId!);
    const fresh = await getDeckAudios(deckId!);
    setAudios(fresh);
  };

  useEffect(() => {
    loadData();
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
        title={deck.name}
        onBack={() => navigate('/')}
        rightContent={
          <button
            onClick={() => setMenuOpen(true)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        }
      />
      <main className="max-w-3xl mx-auto px-3 space-y-6 pb-24" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
        {cards.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <Layers className="w-14 h-14 mx-auto text-muted-foreground/50" />
            <h2 className="text-xl font-bold">Baralho vazio</h2>
            <p className="text-muted-foreground text-sm">Adicione seus primeiros cartões para começar a estudar.</p>
          </div>
        ) : studyCount === 0 ? (
          <div className="text-center py-12 space-y-4">
            <h2 className="text-xl font-bold">Parabéns! Você terminou este baralho por enquanto.</h2>
            <p className="text-muted-foreground text-sm">Volte mais tarde quando houver novas revisões.</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center gap-6">
              <div className="flex flex-col items-center">
                <span className="text-base font-bold text-col-new">{newCount}</span>
                <span className="text-sm text-foreground">Novo</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-base font-bold text-col-learning">{learningCount}</span>
                <span className="text-sm text-foreground">Aprendendo</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-base font-bold text-col-review">{reviewCount}</span>
                <span className="text-sm text-foreground">Revisar</span>
              </div>
            </div>
            <Heatmap />
          </>
        )}

        {/* Audio list */}
        {audios.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Reproduções</h3>
              <div className="flex items-center gap-2">
                <Repeat className="w-3.5 h-3.5 text-muted-foreground" />
                <Switch checked={autoPlay} onCheckedChange={setAutoPlay} />
              </div>
            </div>
            <div className="space-y-2">
              {audios.map((a, i) => (
                <DeckAudioPlayer
                  key={a.id}
                  ref={(el) => { playerRefs.current[i] = el; }}
                  audio={a}
                  onDeleted={loadAudios}
                  onEnded={() => handleAudioEnded(i)}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Botões fixos no rodapé */}
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-3xl mx-auto px-3 py-3 flex gap-2">
          {studyCount > 0 && (
            <Button
              onClick={() => navigate(`/study/${deckId}`)}
              className="flex-1 gap-2 text-white hover:text-white font-bold"
              style={{ backgroundColor: '#2652cf' }}
            >
              <Play className="w-4 h-4" />
              Estudar agora
            </Button>
          )}
          <Button className="flex-1 gap-2 bg-card hover:bg-card/80 text-foreground" onClick={() => navigate(`/deck/${deckId}/add`)}>
            <Plus className="w-4 h-4" />
            Adicionar Flashcard
          </Button>
        </div>
      </div>

      {/* Menu drawer */}
      <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="font-display">Opções</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2">
            <button
              onClick={() => {
                setMenuOpen(false);
                navigate(`/decks?deck=${deckId}`);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border text-sm hover:bg-card/80 transition-colors"
            >
              <LayoutGrid className="w-4 h-4 text-muted-foreground" />
              Painel
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
                setTimeout(() => setCreateAudioOpen(true), 200);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border text-sm hover:bg-card/80 transition-colors"
            >
              <Plus className="w-4 h-4 text-muted-foreground" />
              Criar reprodução
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Create audio drawer */}
      <CreateDeckAudioDrawer
        open={createAudioOpen}
        onOpenChange={setCreateAudioOpen}
        deckId={deckId!}
        onCreated={loadAudios}
      />


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
