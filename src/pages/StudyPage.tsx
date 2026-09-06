import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getStudyQueue, updateCard, getDecks, getCardsByDeck, addReviewHistory, deleteCard } from '@/lib/storage';
import { processReview } from '@/lib/srs';
import { Rating, StudyStats, Flashcard, Deck } from '@/lib/types';
import StudyCard from '@/components/StudyCard';
import { prepareHtml } from '@/lib/study-media';
import { toast } from 'sonner';
import { Brain, MoreVertical, Pencil, Trash2, Flag } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { exerciseInfo, type ExerciseMode } from '@/lib/adaptive-study';
import { pickQueueIndex, retryGap } from '@/lib/session-queue';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

export default function StudyPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [currentCard, setCurrentCard] = useState<Flashcard | null>(null);
  const [stats, setStats] = useState<StudyStats>({ totalReviewed: 0, again: 0, hard: 0, good: 0, easy: 0 });
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const startTimeRef = useRef(Date.now());
  const queuePositionRef = useRef(0);
  const retryAtRef = useRef(new Map<string,number>());
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [cardsStudied, setCardsStudied] = useState(0);

  useEffect(() => {
    const upcoming = queue.filter(card => card.id !== currentCard?.id);
    const first = pickQueueIndex(upcoming,queuePositionRef.current,retryAtRef.current);
    const candidates = [currentCard, first >= 0 ? upcoming[first] : null, ...upcoming.slice(0, 2)];
    candidates.forEach(card => {
      if (card) { void prepareHtml(card.front); void prepareHtml(card.back); }
    });
  }, [queue, currentCard]);

  // Pick the next card from the queue and set it as current
  const advanceToNext = useCallback((q: Flashcard[]) => {
    if (q.length === 0) {
      setCurrentCard(null);
      setFinished(true);
      return;
    }

    const idx = pickQueueIndex(q,queuePositionRef.current,retryAtRef.current);
    if (idx >= 0) {
      setCurrentCard(q[idx]);
    } else {
      setCurrentCard(null);
      setFinished(true);
    }
  }, []);

  useEffect(() => {
    async function load() {
      const [allDecks, studyQueue, deckCards] = await Promise.all([
        getDecks(),
        getStudyQueue(deckId!),
        getCardsByDeck(deckId!),
      ]);
      // Shuffle the queue (Fisher-Yates)
      for (let i = studyQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [studyQueue[i], studyQueue[j]] = [studyQueue[j], studyQueue[i]];
      }
      setDeck(allDecks.find(d => d.id === deckId) || null);
      setQueue(studyQueue);
      setTotalCards(deckCards.length);

      if (studyQueue.length === 0) {
        setFinished(true);
      } else {
        // Pick first card
        const idx = pickQueueIndex(studyQueue,0,retryAtRef.current);
        if (idx >= 0) {
          setCurrentCard(studyQueue[idx]);
        } else {
          setFinished(true);
        }
      }
      setLoading(false);
    }
    load();
  }, [deckId]);

  const handleRate = useCallback((rating: Rating, mode?: ExerciseMode) => {
    if (!currentCard) return;

    const updates = processReview(currentCard, rating);
    const updatedCard = { ...currentCard, ...updates } as Flashcard;

    // Update stats
    const newStats = {
      ...stats,
      totalReviewed: stats.totalReviewed + 1,
      [rating]: stats[rating] + 1,
    };
    setStats(newStats);
    setCardsStudied(prev => prev + 1);

    queuePositionRef.current += 1;
    // Repetitions inside this session use position, never elapsed minutes.
    let newQueue = queue.filter(c => c.id !== currentCard.id);
    const gap=retryGap(rating);
    if (gap !== null) {
      retryAtRef.current.set(currentCard.id,queuePositionRef.current+gap);
      newQueue.push(updatedCard);
    } else {
      retryAtRef.current.delete(currentCard.id);
    }

    setQueue(newQueue);

    // Check if session is done
    if (newQueue.length === 0) {
      const elapsedMs = Date.now() - startTimeRef.current;
      localStorage.setItem('memora-last-session', JSON.stringify({
        totalReviewed: newStats.totalReviewed,
        elapsedMs,
        date: new Date().toISOString(),
        deckName: deck?.name || '',
      }));
      setFinished(true);
      setCurrentCard(null);
    } else {
      advanceToNext(newQueue);
    }

    // Persist to DB in background
    updateCard(currentCard.id, updates).catch(() => toast.error('Não foi possível salvar o progresso deste cartão.'));
    addReviewHistory(currentCard.id, rating, mode ? {skill:exerciseInfo[mode].skill,exerciseMode:mode} : undefined).catch(() => toast.error('Não foi possível salvar esta revisão no histórico.'));
  }, [currentCard, queue, stats, deck, advanceToNext]);

  // Compute remaining counts from the active queue
  const remainingNew = queue.filter(c => c.status === 'new').length;
  const remainingLearning = queue.filter(c => c.status === 'learning' || c.status === 'relearning').length;
  const remainingReview = queue.filter(c => c.status === 'review').length;

  const progressValue = queue.length > 0 ? (cardsStudied / (cardsStudied + queue.length)) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background safe-page overflow-hidden">
        <PageHeader title="" onBack={() => navigate(`/deck/${deckId}`)} />
        <main className="max-w-3xl mx-auto px-3 space-y-6" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
          <Skeleton className="h-1.5 w-full rounded-full" />
          <div className="flex flex-col items-center pt-8 gap-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        </main>
      </div>
    );
  }

  if (!deck) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Baralho não encontrado.</p></div>;
  }

  return (
    <div className="min-h-screen bg-background safe-page overflow-hidden">
      <PageHeader
        title={deck.name}
        rightContent={
          !finished && currentCard ? (
            <div className="flex items-center gap-1">
              {currentCard.flagged && <Flag className="w-4 h-4 fill-red-500 text-red-500" />}
              <button
                onClick={() => setShowOptionsDrawer(true)}
                aria-label="Opções do cartão" className="text-muted-foreground h-11 w-11 flex items-center justify-center rounded-xl hover:bg-secondary"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          ) : undefined
        }
        onBack={() => navigate(`/deck/${deckId}`)}
        bottomContent={
          !finished && queue.length > 0 ? (
            <Progress value={progressValue} className="h-1 bg-secondary rounded-none" />
          ) : undefined
        }
      />
      <main className="max-w-3xl mx-auto px-3 space-y-6" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
        {finished ? (
          <div className="text-center py-12">
            {stats.totalReviewed === 0 ? (
              <>
                <Brain className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-2xl font-display font-bold mb-2">Nenhum cartão para revisar!</h2>
                <p className="text-muted-foreground mb-2">
                  {totalCards === 0 ? 'Adicione cartões ao baralho para começar a estudar.' : 'Todos os cartões estão agendados para revisões futuras. Volte mais tarde!'}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-2">Revisão concluída</h2>
                <p className="text-muted-foreground mb-6">Você revisou {stats.totalReviewed} cartões</p>
                <div className="grid grid-cols-4 gap-3 max-w-sm mx-auto mb-8">
                  <div className="bg-secondary rounded-xl p-3 text-center">
                    <p className="text-xl font-bold">{stats.again}</p>
                    <p className="text-xs text-muted-foreground">De novo</p>
                  </div>
                  <div className="bg-secondary rounded-xl p-3 text-center">
                    <p className="text-xl font-bold">{stats.hard}</p>
                    <p className="text-xs text-muted-foreground">Difícil</p>
                  </div>
                  <div className="bg-secondary rounded-xl p-3 text-center">
                    <p className="text-xl font-bold">{stats.good}</p>
                    <p className="text-xs text-muted-foreground">Bom</p>
                  </div>
                  <div className="bg-secondary rounded-xl p-3 text-center">
                    <p className="text-xl font-bold">{stats.easy}</p>
                    <p className="text-xs text-muted-foreground">Fácil</p>
                  </div>
                </div>
              </>
            )}
            <Button onClick={() => navigate('/')}>Voltar ao Início</Button>
          </div>
        ) : currentCard ? (
          <StudyCard
            key={`${currentCard.id}-${cardsStudied}`}
            card={currentCard}
            onRate={handleRate}
            remainingNew={remainingNew}
            remainingLearning={remainingLearning}
            remainingReview={remainingReview}
          />
        ) : null}
      </main>

      <Drawer open={showOptionsDrawer} onOpenChange={setShowOptionsDrawer}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Opções</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            <button
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
              onClick={async () => {
                if (!currentCard) return;
                const newFlagged = !currentCard.flagged;
                const updated = { ...currentCard, flagged: newFlagged };
                setCurrentCard(updated);
                setQueue(q => q.map(c => c.id === currentCard.id ? updated : c));
                setShowOptionsDrawer(false);
                updateCard(currentCard.id, { flagged: newFlagged }).catch(console.error);
              }}
            >
              <Flag className={`w-5 h-5 ${currentCard?.flagged ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
              {currentCard?.flagged ? 'Desmarcar cartão' : 'Marcar cartão'}
            </button>
            <button
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
              onClick={() => {
                setShowOptionsDrawer(false);
                if (currentCard) navigate(`/card/${currentCard.id}/edit`);
              }}
            >
              <Pencil className="w-5 h-5 text-muted-foreground" /> Editar cartão
            </button>
            <button
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-destructive hover:bg-secondary transition-colors"
              onClick={() => {
                setShowOptionsDrawer(false);
                setShowDeleteConfirm(true);
              }}
            >
              <Trash2 className="w-5 h-5" /> Excluir cartão
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Excluir cartão</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4">
            <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este cartão? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>Cancelar</Button>
              <Button
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (currentCard) {
                    await deleteCard(currentCard.id);
                    setShowDeleteConfirm(false);
                    const newQueue = queue.filter(c => c.id !== currentCard.id);
                    setQueue(newQueue);
                    if (newQueue.length === 0) {
                      setFinished(true);
                      setCurrentCard(null);
                    } else {
                      advanceToNext(newQueue);
                    }
                  }
                }}
              >
                Excluir
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
