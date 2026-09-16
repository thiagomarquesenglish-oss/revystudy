import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addReviewHistory, getCardReviewRows, getDecks, getCardsByDeck, getDeckAudios } from '@/lib/storage';
import { prepareHtml, prepareAudio } from '@/lib/study-media';
import StudyMedia from '@/components/StudyMedia';
import { Deck, Flashcard } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { Play, Pause, Sparkles, Volume2, Image as ImageIcon, Type, Shuffle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { readSituation } from '@/lib/situation';
import { compareDictation } from '@/lib/dictation';
import { Textarea } from '@/components/ui/textarea';
import { availableSituationModes, chooseRotatingMode, exerciseInfo, parseAdaptiveEvent, type AdaptiveEvent, type ExerciseMode } from '@/lib/adaptive-study';
import SkillBadge from '@/components/SkillBadge';
import UnderstandHelp from '@/components/UnderstandHelp';

interface Piece {
  audioSrc: string | null;
  imagesHtml: string;
  textHtml: string;
}

interface ResolvedDeckAudio {
  cardId: string | null;
  url: string | null;
}

/** Split a card side's HTML into audio / image / text pieces */
function splitHtml(html: string): Piece {
  const div = document.createElement('div');
  div.innerHTML = html || '';

  // audio
  let audioSrc: string | null = null;
  const audioEl = div.querySelector('audio, .audio-node-element') as HTMLAudioElement | null;
  if (audioEl) audioSrc = audioEl.src || audioEl.getAttribute('src');
  if (!audioSrc) {
    const node = div.querySelector('[data-audio]');
    if (node) audioSrc = node.getAttribute('data-src');
  }
  div.querySelectorAll('audio, .audio-node-element, [data-audio]').forEach((el) => el.remove());

  // images
  const imgs = Array.from(div.querySelectorAll('img'));
  const imagesHtml = imgs.map((el) => el.outerHTML).join('');
  imgs.forEach((el) => el.remove());

  // remaining text (drop explanation blocks from the "text only" view? keep them — útil)
  const textHtml = div.innerHTML.trim();

  return { audioSrc, imagesHtml, textHtml };
}

function hasText(html: string) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || '').trim().length > 0;
}

function AudioButton({ src, big }: { src: string; big?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const off = () => setPlaying(false);
    el.addEventListener('ended', off);
    el.addEventListener('pause', off);
    return () => {
      el.removeEventListener('ended', off);
      el.removeEventListener('pause', off);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el) el.play().catch(() => {});
    return () => { el?.pause(); };
  }, [src]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (playing) {
      el.pause();
      el.currentTime = 0;
    } else {
      el.play().catch(() => {});
    }
  };

  const size = big ? 'w-24 h-24' : 'w-20 h-20';
  const icon = big ? 'w-10 h-10' : 'w-9 h-9';

  return (
    <>
      <button
        onClick={toggle}
        className={`${size} shrink-0 self-center rounded-full bg-primary/15 hover:bg-primary/25 flex items-center justify-center transition-all active:scale-95`}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        {playing ? <Pause className={`${icon} text-primary`} /> : <Play className={`${icon} text-primary ml-0.5`} />}
      </button>
      <audio ref={ref} src={src} preload="auto" onPlaying={() => setPlaying(true)} onError={() => setPlaying(false)} />
    </>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CustomStudyPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);

  // mode toggles
  const [useAudio, setUseAudio] = useState(true);
  const [useImage, setUseImage] = useState(true);
  const [useText, setUseText] = useState(true);

  const [order, setOrder] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<ExerciseMode>('text-comprehension');
  const [revealed, setRevealed] = useState(false);
  const [seen, setSeen] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [typed, setTyped] = useState('');
  const [dictationResult, setDictationResult] = useState<ReturnType<typeof compareDictation> | null>(null);
  const [resolvedDeckAudio, setResolvedDeckAudio] = useState<ResolvedDeckAudio>({ cardId: null, url: null });
  const recentModesRef = useRef<ExerciseMode[]>([]);
  const [adaptiveEvents,setAdaptiveEvents]=useState<Record<string,AdaptiveEvent[]>>({});

  useEffect(() => {
    (async () => {
      const [allDecks, deckCards] = await Promise.all([getDecks(), getCardsByDeck(deckId!)]);
      setDeck(allDecks.find((d) => d.id === deckId) || null);
      setCards(deckCards);
      setOrder(shuffle(deckCards));
      setLoading(false);
    })();
  }, [deckId]);

  const current = order[index] || null;
  const currentId = current?.id ?? null;
  const currentAudioId = current?.audioId ?? null;

  useEffect(()=>{
    if(!currentId||adaptiveEvents[currentId])return;
    void getCardReviewRows(currentId).then(rows=>setAdaptiveEvents(old=>({...old,[currentId]:rows.map(parseAdaptiveEvent).filter((event):event is AdaptiveEvent=>!!event)})));
  },[currentId,adaptiveEvents]);

  useEffect(() => {
    order.slice(index, index + 3).forEach(card => {
      void prepareHtml(card.front);
      void prepareHtml(card.back);
    });
  }, [order, index]);

  // deck-level audio fallback
  useEffect(() => {
    if (!currentId) {
      setResolvedDeckAudio({ cardId: null, url: null });
      return;
    }
    if (!currentAudioId) {
      setResolvedDeckAudio({ cardId: currentId, url: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const data = (await getDeckAudios(deckId!)).find(audio => audio.id === currentAudioId);
      if (cancelled) return;
      if (data) {
        const { data: urlData } = supabase.storage.from('deck-audios').getPublicUrl(data.file_path);
        prepareAudio(urlData.publicUrl);
        setResolvedDeckAudio({ cardId: currentId, url: urlData.publicUrl });
      } else {
        setResolvedDeckAudio({ cardId: currentId, url: null });
      }
    })().catch(() => {
      if (!cancelled) setResolvedDeckAudio({ cardId: currentId, url: null });
    });
    return () => {
      cancelled = true;
    };
  }, [currentId, currentAudioId, deckId]);

  const front = useMemo(() => (current ? splitHtml(current.front) : null), [current]);
  const back = useMemo(() => (current ? splitHtml(current.back) : null), [current]);
  const situation = useMemo(() => current ? readSituation(current.front, current.back) : null, [current]);

  const deckAudioUrl = resolvedDeckAudio.cardId === currentId ? resolvedDeckAudio.url : null;
  const deckAudioPending = Boolean(currentAudioId && resolvedDeckAudio.cardId !== currentId);
  const audioSrc = front?.audioSrc || back?.audioSrc || deckAudioUrl;

  /** Modes actually available for the current card */
  const availableModes = useMemo(() => {
    if (!front || !back) return [] as ExerciseMode[];
    if(situation){
      return availableSituationModes({hasImage:!!(front.imagesHtml||back.imagesHtml),hasAudio:!!audioSrc,hasEnglish:!!situation.english,hasPortuguese:!!situation.portuguese}).filter(candidate=>candidate.startsWith('audio')||candidate==='image-audio'?useAudio:candidate.includes('image')?useImage:useText);
    }
    const list:ExerciseMode[]=[];
    if(useAudio&&audioSrc)list.push('audio-comprehension');
    if(useText&&(hasText(front.textHtml)||hasText(back.textHtml)))list.push('text-comprehension');
    return list;
  },[front,back,audioSrc,situation,useAudio,useImage,useText]);

  // Pick a random available mode whenever the card changes. When possible,
  // avoid repeating the same format twice in a row so the practice feels mixed.
  useLayoutEffect(() => {
    if (!started || !currentId || deckAudioPending || availableModes.length === 0) return;
    const nextMode = chooseRotatingMode(availableModes,adaptiveEvents[currentId]||[],recentModesRef.current);
    recentModesRef.current.push(nextMode);
    setMode(nextMode);
    setRevealed(false);
    setShowTranslation(false);
    setTyped(''); setDictationResult(null);
  }, [started, currentId, index, seen, deckAudioPending, availableModes,adaptiveEvents]);

  const next = useCallback(() => {
    setRevealed(false);
    setSeen((s) => s + 1);
    setIndex((i) => {
      const n = i + 1;
      if (n >= order.length) {
        // infinite: reshuffle and start again
        setOrder((o) => {
          const reshuffled = shuffle(o);
          if (reshuffled.length > 1 && reshuffled[0].id === current?.id) {
            [reshuffled[0], reshuffled[1]] = [reshuffled[1], reshuffled[0]];
          }
          return reshuffled;
        });
        return 0;
      }
      return n;
    });
  }, [current?.id, order.length]);

  const recordResult=useCallback((successful:boolean)=>{
    if(!current)return;
    const rating=successful?'good':'again';
    const event:AdaptiveEvent={rating,skill:exerciseInfo[mode].skill,mode,reviewedAt:new Date().toISOString()};
    setAdaptiveEvents(old=>({...old,[current.id]:[...(old[current.id]||[]),event]}));
    void addReviewHistory(current.id,rating,{skill:event.skill,exerciseMode:mode});
    next();
  },[current,mode,next]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background safe-page">
        <PageHeader title="" onBack={() => navigate(`/deck/${deckId}`)} />
        <main className="max-w-3xl mx-auto px-3 space-y-4" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  if (!deck) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Baralho não encontrado.</p></div>;
  }

  // ── Setup screen ────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="min-h-screen bg-background safe-page">
      <PageHeader title="Prática livre" onBack={() => navigate(`/deck/${deckId}`)} />
        <main className="max-w-3xl mx-auto px-3 space-y-6 pb-28" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold">Prática livre e misturada</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Sem limite e sem alterar a agenda. O aplicativo prioriza automaticamente a habilidade
              que mais precisa de treino em cada situação.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Exercícios na mistura</h3>
            {([
              { key: 'audio', label: 'Listening, associação e ditado', icon: Volume2, value: useAudio, set: setUseAudio },
              { key: 'image', label: 'Produção a partir da imagem', icon: ImageIcon, value: useImage, set: setUseImage },
              { key: 'text', label: 'Compreensão e produção por texto', icon: Type, value: useText, set: setUseText },
            ] as const).map(({ key, label, icon: Icon, value, set }) => (
              <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
                <div className="flex items-center gap-3 text-sm">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  {label}
                </div>
                <Switch checked={value} onCheckedChange={set} />
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">{cards.length} situações disponíveis. Cada uma mantém uma única agenda de revisão.</p>
        </main>

        <div className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="max-w-3xl mx-auto px-3 py-3">
            <Button
              className="w-full gap-2 text-white hover:text-white font-bold"
              disabled={cards.length === 0}
              onClick={() => {
                setOrder(shuffle(cards));
                setIndex(0);
                setSeen(0);
                recentModesRef.current = [];
                setStarted(true);
              }}
            >
              <Shuffle className="w-4 h-4" />
              Começar prática
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Practice screen ─────────────────────────────────────────────
  if (!current || !front || !back) {
    return (
      <div className="min-h-screen bg-background safe-page">
        <PageHeader title="Estudo personalizado" onBack={() => setStarted(false)} />
        <main className="max-w-3xl mx-auto px-3 text-center" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 3rem)' }}>
          <p className="text-muted-foreground">Nenhum cartão disponível.</p>
        </main>
      </div>
    );
  }

  const promptImages = front.imagesHtml || back.imagesHtml;
  const promptText = situation ? situation.english : (hasText(front.textHtml) ? front.textHtml : back.textHtml);
  const situationAnswer = situation && mode!=='text-comprehension' ? `<p lang="en"><strong>${situation.english}</strong></p>` : '';
  const answerText = situation ? situationAnswer : mode === 'text-comprehension'
    ? (hasText(front.textHtml) ? back.textHtml : front.textHtml)
    : front.textHtml + back.textHtml;
  const answerImages = situation && ['audio-comprehension','text-comprehension'].includes(mode) ? promptImages : !situation && mode === 'image-production'
    ? (front.imagesHtml ? back.imagesHtml : front.imagesHtml)
    : situation ? '' : front.imagesHtml + back.imagesHtml;
  const isDictation=mode==='audio-dictation';

  return (
    <div className="min-h-screen bg-background safe-page overflow-hidden">
      <PageHeader
        title={deck.name}
        onBack={() => setStarted(false)}
        rightContent={<SkillBadge skill={exerciseInfo[mode].skill} />}
      />
      <main className="max-w-3xl mx-auto px-3 pb-40" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
        <div className="flex flex-col items-center w-full max-w-lg mx-auto">
          {/* Prompt */}
          {deckAudioPending ? <div role="status" aria-label="Preparando cartão" className="min-h-64 w-full bg-muted/20 rounded-xl" /> :
          <StudyMedia html={['image-production','image-audio','image-translation-production'].includes(mode) ? promptImages : ''} key={`prompt-${current.id}-${mode}`}>
          <div className="w-full pt-10 flex flex-col items-center gap-4">
            {['audio-comprehension','audio-dictation'].includes(mode) && audioSrc && <><AudioButton src={audioSrc} big key={`a-${current.id}`} />{isDictation&&situation&&<div className="w-full space-y-3 mt-4"><label htmlFor="mixed-dictation" className="text-sm font-medium">O que você ouviu?</label><Textarea id="mixed-dictation" value={typed} onChange={e=>setTyped(e.target.value)} placeholder="Escreva em inglês..." disabled={!!dictationResult} lang="en" spellCheck={false}/>{!dictationResult&&<Button className="w-full" disabled={!typed.trim()} onClick={()=>setDictationResult(compareDictation(situation.english,typed))}>Conferir</Button>}{dictationResult&&<p role="status" className={dictationResult.correct?'text-green-500':'text-amber-500'}>{dictationResult.correct?'Correto!':'Compare com a resposta abaixo.'}</p>}</div>}</>}
            {mode === 'image-production' && promptImages && (
              <div className="flex flex-col items-center gap-4">
              <div
                className="rich-text-render max-w-full flex justify-center"
                dangerouslySetInnerHTML={{ __html: promptImages }}
              />
              </div>
            )}
            {mode==='image-audio'&&<div className="flex flex-col items-center gap-5"><div className="rich-text-render max-w-full flex justify-center" dangerouslySetInnerHTML={{__html:promptImages}}/>{audioSrc&&<AudioButton src={audioSrc} big/>}</div>}
            {mode==='image-translation-production'&&situation&&<div className="flex flex-col items-center gap-5"><div className="rich-text-render max-w-full flex justify-center" dangerouslySetInnerHTML={{__html:promptImages}}/><div className="text-xl text-white text-center" lang="pt">{situation.portuguese}</div></div>}
            {mode === 'text-comprehension' && (
              <div
                className="rich-text-render text-2xl text-white text-center leading-relaxed break-words max-w-full"
                dangerouslySetInnerHTML={{ __html: promptText }}
              />
            )}
            {mode==='translation-production'&&situation&&<div className="text-2xl text-white text-center leading-relaxed" lang="pt">{situation.portuguese}</div>}
          </div>
          </StudyMedia>}

          {/* Reveal */}
          {(revealed || (isDictation && !!dictationResult)) && (
            <StudyMedia html={answerImages} key={`reveal-${current.id}`}>
            <div className="w-full mt-8 space-y-4">
              <hr className="w-full border-0 h-px bg-muted-foreground/20" />
              <div className="flex flex-col items-center gap-3">
                <div
                  className="rich-text-render text-2xl text-white text-center leading-relaxed break-words max-w-full"
                  dangerouslySetInnerHTML={{ __html: answerText }}
                />
                {situation?.portuguese && !['translation-production','image-translation-production'].includes(mode) && showTranslation && <p className="text-base text-muted-foreground text-center" lang="pt">{situation.portuguese}</p>}
                {situation?.portuguese && !['translation-production','image-translation-production'].includes(mode) && !showTranslation && <Button type="button" variant="ghost" size="sm" onClick={() => setShowTranslation(true)}>Mostrar significado</Button>}
                <div
                  className="rich-text-render text-2xl text-white text-center leading-relaxed break-words max-w-full"
                  dangerouslySetInnerHTML={{ __html: answerImages }}
                />
                {!['audio-comprehension','audio-dictation','image-audio'].includes(mode) && audioSrc && <AudioButton src={audioSrc} key={`r-${current.id}`} />}
              </div>
            </div>
            </StudyMedia>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-lg mx-auto px-3 py-3 flex flex-col gap-2">
          {situation&&(revealed||(isDictation&&!!dictationResult))&&<div className="flex justify-center"><UnderstandHelp sentence={situation.english} portuguese={situation.portuguese} deckId={current.deckId} level={situation.pedagogy?.stage?`etapa ${situation.pedagogy.stage}`:'iniciante'}/></div>}
          <div className="flex gap-2">
          {!revealed && !(isDictation && dictationResult) ? (
            <Button
              className="flex-1 bg-card hover:bg-card/80 text-foreground rounded-full py-6"
              onClick={() => isDictation && situation ? undefined : setRevealed(true)}
              disabled={isDictation && !!situation}
            >
              {isDictation && situation ? 'Digite a frase acima' : 'Mostrar resposta'}
            </Button>
          ) : isDictation ? <Button className="flex-1 text-white font-bold rounded-full py-6" onClick={()=>recordResult(!!dictationResult?.correct)}>Continuar</Button> : <><Button variant="destructive" className="flex-1 rounded-full py-6" onClick={()=>recordResult(false)}>Não consegui</Button><Button className="flex-1 text-white font-bold rounded-full py-6" onClick={()=>recordResult(true)}>Consegui</Button></>}
          </div>
        </div>
      </div>
    </div>
  );
}
