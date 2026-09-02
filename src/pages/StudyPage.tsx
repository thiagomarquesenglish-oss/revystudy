import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getStudyQueue, updateCard, getDecks, getCardsByDeck, addReviewHistory, deleteCard } from '@/lib/storage';
import { processReview } from '@/lib/srs';
import { Rating, StudyStats, Flashcard, Deck } from '@/lib/types';
import StudyCard from '@/components/StudyCard';
import { prepareHtml } from '@/lib/study-media';
import { toast } from 'sonner';
import { Brain, MoreVertical, Pencil, Trash2, Clock, Flag } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

// Learn ahead limit in ms (20 minutes, same as Anki default)
const LEARN_AHEAD_LIMIT_MS = 20 * 60 * 1000;

/**
 * Pick the best next card from the queue, Anki-style:
 * 1. Due learning/relearning cards (dueDate <= now)
 * 2. Due review/new cards (dueDate <= now)
 * 3. Learn-ahead: learning/relearning cards within the learn-ahead window
 * Returns the index, or -1 if nothing is available.
 */
function pickNextCard(queue: Flashcard[]): number {
  const now = Date.now();

  // Priority 1: overdue learning/relearning
  let bestLearnIdx = -1;
  let bestLearnDue = Infinity;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const due = new Date(c.dueDate).getTime();
    if ((c.status === 'learning' || c.status === 'relearning') && due <= now && due < bestLearnDue) {
      bestLearnIdx = i;
      bestLearnDue = due;
    }
  }
  if (bestLearnIdx >= 0) return bestLearnIdx;

  // Priority 2: due review/new cards
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    if (new Date(c.dueDate).getTime() <= now) return i;
  }

  // Priority 3: learn-ahead — pick the earliest learning/relearning card within the window
  let bestAheadIdx = -1;
  let bestAheadDue = Infinity;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const due = new Date(c.dueDate).getTime();
    if ((c.status === 'learning' || c.status === 'relearning') && due <= now + LEARN_AHEAD_LIMIT_MS && due < bestAheadDue) {
      bestAheadIdx = i;
      bestAheadDue = due;
    }
  }
  return bestAheadIdx;
}

/**
 * Get the earliest due time among remaining learning/relearning cards.
 */
function getNextLearnDueTime(queue: Flashcard[]): number | null {
  let earliest: number | null = null;
  for (const c of queue) {
    if (c.status === 'learning' || c.status === 'relearning') {
      const t = new Date(c.dueDate).getTime();
      if (earliest === null || t < earliest) earliest = t;
    }
  }
  return earliest;
}

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
  const [waiting, setWaiting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const startTimeRef = useRef(Date.now());
  const waitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [cardsStudied, setCardsStudied] = useState(0);

  useEffect(() => {
    const upcoming = queue.filter(card => card.id !== currentCard?.id);
    const first = pickNextCard(upcoming);
    const candidates = [currentCard, first >= 0 ? upcoming[first] : null, ...upcoming.slice(0, 2)];
    candidates.forEach(card => {
      if (card) { void prepareHtml(card.front); void prepareHtml(card.back); }
    });
  }, [queue, currentCard]);

  // Pick the next card from the queue and set it as current
  const advanceToNext = useCallback((q: Flashcard[]) => {
    if (waitTimerRef.current) {
      clearInterval(waitTimerRef.current);
      waitTimerRef.current = null;
    }

    if (q.length === 0) {
      setCurrentCard(null);
      setWaiting(false);
      setFinished(true);
      return;
    }

    const idx = pickNextCard(q);
    if (idx >= 0) {
      setCurrentCard(q[idx]);
      setWaiting(false);
    } else {
      // Nothing available now — check if there are future learning cards beyond learn-ahead window
      const nextDue = getNextLearnDueTime(q);
      if (nextDue !== null) {
        // Start waiting with countdown
        setCurrentCard(null);
        setWaiting(true);
        setCountdown(Math.max(0, Math.ceil((nextDue - Date.now()) / 1000)));

        waitTimerRef.current = setInterval(() => {
          const remaining = Math.max(0, Math.ceil((nextDue - Date.now()) / 1000));
          setCountdown(remaining);
          if (remaining <= 0) {
            if (waitTimerRef.current) clearInterval(waitTimerRef.current);
            waitTimerRef.current = null;
            // Re-pick — the card should now be available
            setWaiting(false);
            const newIdx = pickNextCard(q);
            if (newIdx >= 0) {
              setCurrentCard(q[newIdx]);
            } else {
              setFinished(true);
            }
          }
        }, 500);
      } else {
        // No learning cards left at all — session done
        setCurrentCard(null);
        setWaiting(false);
        setFinished(true);
      }
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
        const idx = pickNextCard(studyQueue);
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

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (waitTimerRef.current) clearInterval(waitTimerRef.current);
    };
  }, []);

  const handleRate = useCallback((rating: Rating) => {
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

    // Build new queue: remove the current card, then re-add if still learning/relearning
    let newQueue = queue.filter(c => c.id !== currentCard.id);

    if (updatedCard.status === 'learning' || updatedCard.status === 'relearning') {
      // Re-add to queue with updated data — it will rotate back
      newQueue.push(updatedCard);
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
    addReviewHistory(currentCard.id, rating).catch(() => toast.error('Não foi possível salvar esta revisão no histórico.'));
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

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
  };

  return (
    <div className="min-h-screen bg-background safe-page overflow-hidden">
      <PageHeader
        title={deck.name}
        rightContent={
          !finished && !waiting && currentCard ? (
            <div className="flex items-center gap-1">
              {currentCard.flagged && <Flag className="w-4 h-4 fill-red-500 text-red-500" />}
              <button
                onClick={() => setShowOptionsDrawer(true)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
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
                <h2 className="text-2xl font-bold mb-2">Parabéns! Você terminou este baralho por enquanto.</h2>
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
        ) : waiting ? (
          <div className="text-center py-12">
            <Clock className="w-16 h-16 mx-auto text-muted-foreground mb-4 animate-pulse" />
            <h2 className="text-2xl font-bold mb-2">Aguardando próximo cartão...</h2>
            <p className="text-muted-foreground mb-4">
              O próximo cartão estará disponível em
            </p>
            <p className="text-4xl font-bold font-mono text-primary mb-6">
              {formatCountdown(countdown)}
            </p>
            <p className="text-sm text-muted-foreground">
              {stats.totalReviewed} cartões revisados até agora
            </p>
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
