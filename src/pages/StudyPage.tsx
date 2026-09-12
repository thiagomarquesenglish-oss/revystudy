import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { updateCard, deleteCard, saveLearningReview } from '@/lib/storage';
import { loadLearningData } from '@/lib/learning-data';
import { mixedCurriculumQueue, type LearningEvent } from '@/lib/learning-progress';
import { Rating, StudyStats, Flashcard, Deck } from '@/lib/types';
import StudyCard from '@/components/StudyCard';
import { prepareHtml } from '@/lib/study-media';
import { toast } from 'sonner';
import { Brain, MoreVertical, Pencil, Trash2, Flag } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { availableSituationModes, chooseRotatingMode, exerciseInfo, type ExerciseMode } from '@/lib/adaptive-study';
import { pickQueueIndex, retryGap } from '@/lib/session-queue';
import { readSituation } from '@/lib/situation';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

type SessionCard=Flashcard&{sessionKey:string;sessionMode?:ExerciseMode};

function ensureRotatingSkill(card:SessionCard,recent:ExerciseMode[]):SessionCard{
  const situation=readSituation(card.front,card.back);
  if(!situation)return card;
  const root=document.createElement('div');root.innerHTML=situation.mediaHtml;
  const available=availableSituationModes({hasImage:!!root.querySelector('img[src]'),hasAudio:!!card.audioId||!!root.querySelector('audio[src],[data-audio][data-src]'),hasEnglish:!!situation.english,hasPortuguese:!!situation.portuguese});
  const skills=[...new Set(available.map(mode=>exerciseInfo[mode].skill))];
  const used=new Set(recent.slice(-Math.max(0,skills.length-1)).map(mode=>exerciseInfo[mode].skill));
  if(card.sessionMode&&!used.has(exerciseInfo[card.sessionMode].skill))return card;
  return {...card,sessionMode:chooseRotatingMode(available,[],recent)};
}

export function buildSessionQueue(cards:Flashcard[],history:LearningEvent[]):SessionCard[]{
  const recentModes:ExerciseMode[]=[];
  return cards.map(card=>{
    const situation=readSituation(card.front,card.back);
    if(!situation)return {...card,sessionKey:card.id};
    const root=document.createElement('div');root.innerHTML=situation.mediaHtml;
    const available=availableSituationModes({hasImage:!!root.querySelector('img[src]'),hasAudio:!!card.audioId||!!root.querySelector('audio[src],[data-audio][data-src]'),hasEnglish:!!situation.english,hasPortuguese:!!situation.portuguese});
    const events=history.filter(e=>e.cardId===card.id).sort((a,b)=>a.at.localeCompare(b.at)).map(e=>({rating:e.rating,mode:e.mode,skill:exerciseInfo[e.mode].skill,reviewedAt:e.at}));
    const mode=chooseRotatingMode(available,events,recentModes.length?recentModes:events.at(-1)?.mode?[events.at(-1)!.mode]:[]);
    recentModes.push(mode);
    return {...card,sessionKey:card.id,sessionMode:mode};
  });
}

export default function StudyPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<SessionCard[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [currentCard, setCurrentCard] = useState<SessionCard | null>(null);
  const [stats, setStats] = useState<StudyStats>({ totalReviewed: 0, again: 0, hard: 0, good: 0, easy: 0 });
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const startTimeRef = useRef(Date.now());
  const queuePositionRef = useRef(0);
  const retryAtRef = useRef(new Map<string,number>());
  const savingRef=useRef(false);
  const recentModesRef=useRef<ExerciseMode[]>([]);
  const [loadError,setLoadError]=useState('');
  const backPath=deckId?`/deck/${deckId}`:'/stats';
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [cardsStudied, setCardsStudied] = useState(0);

  useEffect(() => {
    const upcoming = queue.filter(card => card.sessionKey !== currentCard?.sessionKey);
    const first = pickQueueIndex(upcoming,queuePositionRef.current,retryAtRef.current);
    const candidates = [currentCard, first >= 0 ? upcoming[first] : null, ...upcoming.slice(0, 2)];
    candidates.forEach(card => {
      if (card) { void prepareHtml(card.front); void prepareHtml(card.back); }
    });
  }, [queue, currentCard]);

  // Pick the next card from the queue and set it as current
  const advanceToNext = useCallback((q: SessionCard[]) => {
    if (q.length === 0) {
      setCurrentCard(null);
      setFinished(true);
      return;
    }

    const idx = pickQueueIndex(q,queuePositionRef.current,retryAtRef.current);
    if (idx >= 0) {
      const next=ensureRotatingSkill(q[idx],recentModesRef.current);
      if(next.sessionMode)recentModesRef.current.push(next.sessionMode);
      setCurrentCard(next);
    } else {
      setCurrentCard(null);
      setFinished(true);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
      const data=await loadLearningData();
      const deckCards=deckId?data.cards.filter(c=>c.deckId===deckId):data.cards;
      const studyQueue=deckId?deckCards.filter(c=>c.status==='new'||Date.parse(c.dueDate)<=Date.now()):mixedCurriculumQueue(data.cards,data.events,Date.now(),30,data.manualStage);
      const orderedQueue=[...studyQueue];
      // Curriculum sessions already interleave current, recent and old content.
      for (let i = deckId?orderedQueue.length - 1:0; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [orderedQueue[i], orderedQueue[j]] = [orderedQueue[j], orderedQueue[i]];
      }
      const expandedQueue=buildSessionQueue(orderedQueue,data.events);
      setDeck(deckId?data.decks.find(d => d.id === deckId)||null:{id:'curriculum',name:'Meu currículo de inglês',description:'',createdAt:'',contentUpdatedAt:'',cardCount:deckCards.length,audioCount:0});
      setQueue(expandedQueue);
      setTotalCards(deckCards.length);

      if (expandedQueue.length === 0) {
        setFinished(true);
      } else {
        // Pick first card
        const idx = pickQueueIndex(expandedQueue,0,retryAtRef.current);
        if (idx >= 0) {
          const first=ensureRotatingSkill(expandedQueue[idx],[]);
          recentModesRef.current=first.sessionMode?[first.sessionMode]:[];
          setCurrentCard(first);
        } else {
          setFinished(true);
        }
      }
      setLoading(false);
      } catch(error){setLoadError(error instanceof Error?error.message:'Não foi possível carregar a sessão.');setLoading(false);}
    }
    load();
  }, [deckId]);

  const handleRate = useCallback(async (rating: Rating, mode?: ExerciseMode) => {
    if (!currentCard||savingRef.current) return;
    savingRef.current=true;
    let updatedCard:SessionCard;
    try{updatedCard={...currentCard,...await saveLearningReview(currentCard,rating,mode)};}
    catch{toast.error('Não foi possível salvar. Tente avaliar novamente.');savingRef.current=false;return;}

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
    const newQueue = queue.filter(c => c.sessionKey !== currentCard.sessionKey);
    const gap=retryGap(rating);
    if (gap !== null) {
      const situation=readSituation(updatedCard.front,updatedCard.back);
      if(situation){
        const root=document.createElement('div');root.innerHTML=situation.mediaHtml;
        const available=availableSituationModes({hasImage:!!root.querySelector('img[src]'),hasAudio:!!updatedCard.audioId||!!root.querySelector('audio[src],[data-audio][data-src]'),hasEnglish:!!situation.english,hasPortuguese:!!situation.portuguese});
        const reviewedMode=mode||currentCard.sessionMode;
        if(reviewedMode)updatedCard.sessionMode=chooseRotatingMode(available,[{rating,skill:exerciseInfo[reviewedMode].skill,mode:reviewedMode,reviewedAt:new Date().toISOString()}],recentModesRef.current);
      }
      retryAtRef.current.set(currentCard.sessionKey,queuePositionRef.current+gap);
      newQueue.push(updatedCard);
    } else {
      retryAtRef.current.delete(currentCard.sessionKey);
    }

    setQueue(newQueue);

    // Check if session is done
    if (newQueue.length === 0) {
      const elapsedMs = Date.now() - startTimeRef.current;
      try { localStorage.setItem('memora-last-session', JSON.stringify({
        totalReviewed: newStats.totalReviewed,
        elapsedMs,
        date: new Date().toISOString(),
        deckName: deck?.name || '',
      })); } catch { /* Optional session summary must not block a saved review. */ }
      setFinished(true);
      setCurrentCard(null);
    } else {
      advanceToNext(newQueue);
    }

    savingRef.current=false;
  }, [currentCard, queue, stats, deck, advanceToNext]);

  // Compute remaining counts from the active queue
  const remainingNew = queue.filter(c => c.status === 'new').length;
  const remainingLearning = queue.filter(c => c.status === 'learning' || c.status === 'relearning').length;
  const remainingReview = queue.filter(c => c.status === 'review').length;

  const progressValue = queue.length > 0 ? (cardsStudied / (cardsStudied + queue.length)) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background safe-page overflow-hidden">
        <PageHeader title="" onBack={() => navigate(backPath)} />
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

  if(loadError)return <div className="p-6 space-y-4"><p role="alert">{loadError}</p><Button onClick={()=>navigate(backPath)}>Voltar</Button></div>;
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
        onBack={() => navigate(backPath)}
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
            key={`${currentCard.sessionKey}-${cardsStudied}`}
            card={currentCard}
            onRate={handleRate}
            forcedMode={currentCard.sessionMode}
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
