import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCardsByDeck, saveLearningReview } from '@/lib/storage';
import { loadLearningData } from '@/lib/learning-data';
import type { LearningEvent } from '@/lib/learning-progress';
import type { Deck, Flashcard, Rating } from '@/lib/types';
import { availableSituationModes, chooseRotatingMode, exerciseInfo, type ExerciseMode, type LearningSkill } from '@/lib/adaptive-study';
import { loadScheduledCards, pickDueCard, type ScheduledCard } from '@/lib/fsrs-scheduling';
import { readSituation } from '@/lib/situation';
import { prepareHtml } from '@/lib/study-media';
import StudyCard from '@/components/StudyCard';
import CardOptions from '@/components/CardOptions';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// Free practice deliberately ignores due dates and never saves SRS answers.
export function buildSessionQueue(cards: Flashcard[], history: LearningEvent[]) {
  const recent: ExerciseMode[] = [];
  return cards.map(card => {
    const situation = readSituation(card.front, card.back);
    if (!situation) return {...card, sessionKey: card.id, sessionMode: undefined as ExerciseMode | undefined};
    const root = document.createElement('div'); root.innerHTML = situation.mediaHtml;
    const modes = availableSituationModes({hasImage: !!root.querySelector('img[src]'), hasAudio: !!card.audioId || !!root.querySelector('audio[src],[data-audio][data-src]'), hasEnglish: !!situation.english, hasPortuguese: !!situation.portuguese});
    const events = history.filter(e => e.cardId === card.id).sort((a,b)=>a.at.localeCompare(b.at)).map(e => ({rating:e.rating, mode:e.mode, skill:exerciseInfo[e.mode].skill, reviewedAt:e.at}));
    const mode = chooseRotatingMode(modes, events, recent.length ? recent : events.at(-1)?.mode ? [events.at(-1)!.mode] : []); recent.push(mode);
    return {...card, sessionKey:card.id, sessionMode:mode};
  });
}

export default function StudyPage() {
  const { deckId } = useParams<{deckId:string}>();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [current, setCurrent] = useState<ScheduledCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answered, setAnswered] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const all = useRef<ScheduledCard[]>([]);
  const currentRef = useRef<ScheduledCard | null>(null);
  const lastSkill = useRef<LearningSkill>();
  const saving = useRef(false);
  const revision = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const backPath = deckId ? '/deck/' + deckId : '/';
  const showNext = (items: ScheduledCard[]) => {
    all.current = items;
    const next = pickDueCard(items, new Date(), lastSkill.current);
    currentRef.current = next; setCurrent(next);
    setWaiting(!next && items.some(item => [1,3].includes(item.schedule.memory.state)));
    const upcoming = next && pickDueCard(items.filter(item => item.id !== next.id), new Date(), next.schedule.skill);
    for (const card of [next, upcoming]) if (card) { void prepareHtml(card.front); void prepareHtml(card.back); }
  };

  useEffect(() => {
    let active = true;
    let refreshing = false;
    let userId = '';
    let knownDecks: Deck[] = [];
    all.current = []; currentRef.current = null; saving.current = false;
    setLoading(true); setError(''); setAnswered(0); lastSkill.current = undefined;
    const refresh = async () => {
      if (!active || !userId || saving.current || refreshing) return;
      refreshing = true;
      const startedAtRevision = revision.current;
      try {
        const cards = (await Promise.all((deckId ? [deckId] : knownDecks.map(d=>d.id)).map(getCardsByDeck))).flat();
        const items = await loadScheduledCards(cards, userId);
        if (!active || startedAtRevision !== revision.current) return;
        all.current = items;
        const previous = currentRef.current;
        const retained = previous && items.find(item => item.sessionKey === previous.sessionKey && item.schedule.updated_at === previous.schedule.updated_at);
        if (retained) { currentRef.current = retained; setCurrent(retained); }
        else showNext(items);
      } catch { if (active) toast.error('Não foi possível atualizar os exercícios.'); }
      finally {
        refreshing = false;
        if (active && startedAtRevision !== revision.current && !saving.current) void refresh();
      }
    };
    refreshRef.current = refresh;
    void (async () => {
      try {
        const data = await loadLearningData();
        if (!active) return;
        userId = data.userId; knownDecks = data.decks;
        const selectedDeck = deckId ? data.decks.find(d=>d.id===deckId) : {...data.decks[0], name:'Estudo'};
        const cards = data.cards.filter(c => !deckId || c.deckId === deckId);
        const items = await loadScheduledCards(cards, userId);
        if (!active) return;
        setDeck(selectedDeck || null); showNext(items); setLoading(false);
      } catch (cause) { if (active) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o estudo.'); setLoading(false); } }
    })();
    const changed = () => { void refresh(); };
    const visible = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(() => {
      if (!saving.current && !currentRef.current && !document.hidden) showNext(all.current);
    }, 1000);
    window.addEventListener('revystudy:cards-updated', changed);
    window.addEventListener('revystudy:learning-updated', changed);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; clearInterval(timer); window.removeEventListener('revystudy:cards-updated', changed); window.removeEventListener('revystudy:learning-updated', changed); document.removeEventListener('visibilitychange', visible); };
  }, [deckId]);

  const rate = async (rating: Rating, mode?: ExerciseMode) => {
    const card = currentRef.current;
    if (!card || saving.current) return;
    saving.current = true;
    revision.current += 1;
    try {
      const updated = await saveLearningReview(card, rating, mode || card.sessionMode, card.schedule);
      lastSkill.current = card.schedule.skill;
      const items = all.current.map(item => item.id !== card.id ? item : {
        ...item, ...updated, sessionKey:item.sessionKey, sessionMode:item.sessionMode,
        schedule:item.sessionKey===card.sessionKey ? updated.schedule : item.schedule,
      });
      setAnswered(value=>value+1); showNext(items);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar a resposta.'); }
    finally { saving.current = false; void refreshRef.current(); }
  };
  const situation = current ? readSituation(current.front, current.back) : null;
  return <div className="min-h-screen h-[100svh] bg-background safe-page overflow-hidden">
    <PageHeader title={deck?.name || 'Estudo'} onBack={()=>navigate(backPath)} rightContent={current && !situation ? <CardOptions key={current.id} card={current} sentence={current.dictationAnswer || ''} portuguese="" /> : undefined} />
    <main className="max-w-3xl mx-auto px-3 space-y-6" style={{paddingTop:'calc(var(--app-header-height, 48px) + 1rem)'}}>
      {loading ? <p role="status" className="text-center py-12">Preparando seu estudo...</p> : error ? <div role="alert" className="py-12 space-y-4"><p>{error}</p><Button onClick={()=>navigate(backPath)}>Voltar</Button></div> : !deck ? <p>Baralho não encontrado.</p> : current ?
        <StudyCard key={current.sessionKey+'-'+answered} card={current} forcedMode={current.sessionMode} onRate={rate} remainingNew={0} remainingLearning={0} remainingReview={0} /> :
        <div className="text-center py-12 space-y-4">
          <h2 className="text-2xl font-bold">{waiting ? 'Aguardando a próxima revisão' : 'Tudo revisado por enquanto'}</h2>
          <p className="text-muted-foreground">{waiting ? 'Os exercícios em aprendizagem aparecerão aqui quando chegar a hora. Você também pode voltar mais tarde.' : 'As próximas revisões respeitarão o agendamento de cada habilidade.'}</p>
          <Button onClick={()=>navigate(backPath)}>Voltar ao baralho</Button>
        </div>}
    </main>
  </div>;
}
