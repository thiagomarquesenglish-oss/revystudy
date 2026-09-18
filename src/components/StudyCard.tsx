import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Flashcard, Rating } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { getCardReviewRows, getDeckAudios } from '@/lib/storage';
import StudyMedia from './StudyMedia';
import { readSituation, translationSupportLevel } from '@/lib/situation';
import { Play, Pause, Check, X, Loader2 } from 'lucide-react';
import { availableSituationModes, chooseAdaptiveMode, exerciseInfo, parseAdaptiveEvent, type ExerciseMode } from '@/lib/adaptive-study';
import { compareDictation } from '@/lib/dictation';
import SkillBadge from './SkillBadge';
import UnderstandHelp from './UnderstandHelp';
import AudioPlayButton from './LocalAudioPlayer';
import { findExplanations, requestExplanation, saveExplanation } from '@/lib/learning-help';

/** Normalize text for typing comparison: lowercase, strip accents, remove punctuation, collapse spaces */
function normalizeForCompare(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,!?;:"()\[\]{}¿¡]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract plain text from HTML, excluding explanation blocks */
function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('[data-explanation], audio, .audio-node').forEach(el => el.remove());
  return (div.textContent || '').trim();
}

interface StudyCardProps {
  card: Flashcard;
  onRate: (rating: Rating, mode?: ExerciseMode) => void;
  forcedMode?: ExerciseMode;
  remainingNew: number;
  remainingLearning: number;
  remainingReview: number;
}

const ratingConfig: { rating: Rating; label: string }[] = [
  { rating: 'again', label: 'Errei' },
  { rating: 'hard', label: 'Difícil' },
  { rating: 'good', label: 'Bom' },
  { rating: 'easy', label: 'Fácil' },
];

/** Extract audio src from HTML string (tiptap audio node) */
function extractAudioSrc(html: string): string | null {
  const div = document.createElement('div');
  div.innerHTML = html;
  const audioEl = div.querySelector('audio, .audio-node-element');
  if (audioEl) {
    return (audioEl as HTMLAudioElement).src || audioEl.getAttribute('src');
  }
  const audioNode = div.querySelector('[data-audio]');
  if (audioNode) {
    return audioNode.getAttribute('data-src');
  }
  return null;
}


function CardContent({ html, audioSrc, autoPlay = true }: { html: string; audioSrc: string | null; autoPlay?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const cleanHtml = useMemo(() => {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('audio, .audio-node, [data-audio]').forEach(el => el.remove());
    const images = Array.from(div.querySelectorAll('img'));
    images.forEach(image => image.remove());
    return div.innerHTML + images.map(image => image.outerHTML).join('');
  }, [html]);

  return (
    <div className="w-full pt-8 flex flex-col items-center gap-3">
        <div
          ref={ref}
          className="rich-text-render text-2xl text-white text-center leading-relaxed break-words max-w-full"
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
        />
        {audioSrc && <AudioPlayButton src={audioSrc} centered autoPlay={autoPlay} />}
    </div>
  );
}

export default function StudyCard({ card, onRate, forcedMode, remainingNew, remainingLearning, remainingReview }: StudyCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [deckAudioUrl, setDeckAudioUrl] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [typingResult, setTypingResult] = useState<null | 'correct' | 'incorrect'>(null);

  // Reset per-card state when card changes
  useEffect(() => {
    setTyped('');
    setTypingResult(null);
    setFlipped(false);
  }, [card.id]);

  // Fetch deck audio URL if card has audioId
  useEffect(() => {
    if (!card.audioId) {
      setDeckAudioUrl(null);
      return;
    }
    let active = true;
    setDeckAudioUrl(null);
    (async () => {
      const data = (await getDeckAudios(card.deckId)).find(audio => audio.id === card.audioId);
      if (!active) return;
      if (data) {
        const { data: urlData } = supabase.storage.from('deck-audios').getPublicUrl(data.file_path);
        setDeckAudioUrl(urlData.publicUrl);
      }
    })().catch(() => {});
    return () => { active = false; };
  }, [card.audioId, card.deckId]);

  // Determine audio sources for front and back
  const frontEmbeddedAudio = extractAudioSrc(card.front);
  const backEmbeddedAudio = extractAudioSrc(card.back);

  // If card has audioId but no embedded audio, show deck audio on front
  // If embedded audio exists, prefer that
  // An audio attached to the card belongs to its answer/back by default.
  // Only an audio node explicitly embedded in the front may play before flip.
  const frontAudioSrc = frontEmbeddedAudio;
  const backAudioSrc = backEmbeddedAudio || (!frontEmbeddedAudio && deckAudioUrl ? deckAudioUrl : null);

  const situation=readSituation(card.front,card.back);
  if(situation)return <SituationStudyCard card={card} situation={situation} audioSrc={frontAudioSrc||backAudioSrc} onRate={onRate} forcedMode={forcedMode} remainingNew={remainingNew} remainingLearning={remainingLearning} remainingReview={remainingReview}/>;

  return (
    <StudyCardInner
      card={card}
      onRate={onRate}
      flipped={flipped}
      setFlipped={setFlipped}
      remainingNew={remainingNew}
      remainingLearning={remainingLearning}
      remainingReview={remainingReview}
      frontAudioSrc={frontAudioSrc}
      backAudioSrc={backAudioSrc}
      typed={typed}
      setTyped={setTyped}
      typingResult={typingResult}
      setTypingResult={setTypingResult}
    />
  );
}

function SituationStudyCard({card,situation,audioSrc,onRate,forcedMode,remainingNew,remainingLearning,remainingReview}:{card:Flashcard;situation:NonNullable<ReturnType<typeof readSituation>>;audioSrc:string|null;onRate:(rating:Rating,mode?:ExerciseMode)=>void;forcedMode?:ExerciseMode;remainingNew:number;remainingLearning:number;remainingReview:number}){
  const [mode,setMode]=useState<ExerciseMode>(forcedMode||'text-comprehension');
  const [flipped,setFlipped]=useState(false),[typed,setTyped]=useState(''),[dictation,setDictation]=useState<ReturnType<typeof compareDictation>|null>(null),[showPortuguese,setShowPortuguese]=useState(false);
  const media=useMemo(()=>{const root=document.createElement('div');root.innerHTML=situation.mediaHtml;root.querySelectorAll('audio,[data-audio]').forEach(el=>el.remove());return root.innerHTML;},[situation.mediaHtml]);
  useEffect(()=>{if(forcedMode){setMode(forcedMode);return;}let active=true;void getCardReviewRows(card.id).then(rows=>{if(!active)return;const events=rows.map(parseAdaptiveEvent).filter((event):event is NonNullable<typeof event>=>!!event);const modes=availableSituationModes({hasImage:!!media,hasAudio:!!audioSrc,hasEnglish:!!situation.english,hasPortuguese:!!situation.portuguese});setMode(chooseAdaptiveMode(modes,events,events.at(-1)?.mode));});return()=>{active=false};},[card.id,media,audioSrc,situation.english,situation.portuguese,forcedMode]);
  const finish=(rating:Rating)=>onRate(rating,mode);
  const isDictation=mode==='audio-dictation';
  const canPlayFrontAudio=['audio-comprehension','audio-dictation','image-audio'].includes(mode);
  const reveal=flipped||!!dictation;
  const showEnglishAnswer=mode!=='text-comprehension';
  const showImageAnswer=['audio-comprehension','text-comprehension'].includes(mode);
  const renderedImage=<div className="rich-text-render max-w-full" dangerouslySetInnerHTML={{__html:media}}/>;
  return <div className="study-exercise flex flex-col w-full max-w-lg mx-auto pb-36" >
    <div className="pt-5 flex justify-center"><SkillBadge skill={exerciseInfo[mode].skill}/></div>
    <div className={`study-flip-card mt-5 ${reveal ? 'is-flipped' : ''}`} onClick={event => { if (!isDictation && !(event.target as HTMLElement).closest('button, textarea, input, audio, a')) setFlipped(!flipped); }} role="button" tabIndex={0} onKeyDown={event => { if (!isDictation && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setFlipped(!flipped); } }} aria-label={reveal ? 'Mostrar frente do cartão' : 'Mostrar verso do cartão'}>
      <div className="study-flip-inner">
      <div className="study-flip-face study-flip-front">
      <div className="w-full flex flex-col items-center gap-4">
      {mode==='image-production'&&<StudyMedia html={media}>{renderedImage}</StudyMedia>}
      {mode==='image-audio'&&<StudyMedia html={media}><>{renderedImage}{canPlayFrontAudio&&audioSrc&&<AudioPlayButton src={audioSrc} centered/>}</></StudyMedia>}
      {mode==='image-translation-production'&&<StudyMedia html={media}><>{renderedImage}<div className="text-xl text-white text-center" lang="pt">{situation.portuguese}</div></></StudyMedia>}
      {canPlayFrontAudio&&['audio-comprehension','audio-dictation'].includes(mode)&&audioSrc&&<AudioPlayButton src={audioSrc} centered/>}
      {mode==='text-comprehension'&&<div className="text-2xl text-white text-center" lang="en">{situation.english}</div>}
      {mode==='translation-production'&&<div className="text-2xl text-white text-center" lang="pt">{situation.portuguese}</div>}
      {isDictation&&!dictation&&<div className="w-full px-2 space-y-3"><textarea value={typed} onChange={e=>setTyped(e.target.value)} rows={3} autoFocus lang="en" spellCheck={false} placeholder="Escreva em inglês..." className="w-full bg-card text-foreground text-lg rounded-lg p-3 border border-border resize-none"/><button disabled={!typed.trim()} onClick={()=>setDictation(compareDictation(situation.english,typed))} className="w-full bg-primary text-primary-foreground rounded-full py-3 disabled:opacity-40">Verificar</button><button onClick={()=>finish('again')} className="w-full rounded-full bg-secondary py-3 text-sm text-muted-foreground hover:text-foreground">Pular</button></div>}
      {dictation&&<div className="w-full px-2 space-y-2 text-center">
        <p className={dictation.correct?'text-green-500':'text-red-500'}>{dictation.correct?'Correto!':'Compare com a resposta.'}</p>
        {!dictation.correct&&<>
          <div className="text-sm text-muted-foreground"><span className="block text-xs">Sua resposta</span><span className="text-foreground line-through">{typed || '—'}</span></div>
          <div className="text-sm text-muted-foreground"><span className="block text-xs">Resposta correta</span><span className="text-foreground font-semibold" lang="en">{situation.english}</span></div>
        </>}
        {!dictation.correct&&<WritingErrorExplanation sentence={situation.english} portuguese={situation.portuguese} typed={typed}/>} 
      </div>}
    </div>
      </div>
      <div className="study-flip-face study-flip-back">
        <StudyMedia html={showImageAnswer?media:''}><div className="w-full flex flex-col items-center gap-3">{showEnglishAnswer&&<div className="text-2xl text-white text-center font-semibold" lang="en">{situation.english}</div>}{showImageAnswer&&renderedImage}{!['translation-production','image-translation-production'].includes(mode)&&(showPortuguese?<div className="text-base text-muted-foreground text-center" lang="pt">{situation.portuguese}</div>:<button className="text-sm text-primary py-2" onClick={()=>setShowPortuguese(true)}>Mostrar significado</button>)}{!['audio-comprehension','audio-dictation','image-audio'].includes(mode)&&audioSrc&&<AudioPlayButton src={audioSrc} centered autoPlay/>}</div></StudyMedia>
        <div className="flex justify-center mt-4"><UnderstandHelp sentence={situation.english} portuguese={situation.portuguese} deckId={card.deckId} level={situation.pedagogy?.stage?`etapa ${situation.pedagogy.stage}`:'iniciante'}/></div>
      </div>
      </div>
    </div>
    <div className="flex-1"/>
    <div className="fixed bottom-0 left-0 right-0 px-4 pt-3 bg-background/95 backdrop-blur-xl sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[480px] z-10" style={{paddingBottom:'max(env(safe-area-inset-bottom), 16px)'}}><div className="flex flex-col gap-2">{!reveal ? null : isDictation?<button onClick={()=>finish(dictation?.correct?'good':'again')} className={`w-full rounded-full py-3 font-bold text-white ${dictation?.correct?'bg-green-700':'bg-red-600'}`}>Continuar</button>:<div className="grid grid-cols-4 gap-2">{ratingConfig.map(item=><button key={item.rating} onClick={()=>finish(item.rating)} className={`rounded-full py-3 text-sm font-bold text-white ${item.rating==='again'?'bg-red-600':item.rating==='hard'?'bg-orange-500':item.rating==='good'?'bg-blue-600':'bg-green-700'}`}>{item.label}</button>)}</div>}</div></div>
  </div>;
}

function WritingErrorExplanation({ sentence, portuguese, typed }: { sentence: string; portuguese: string; typed: string }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const explain = async () => {
    setRequested(true);
    setLoading(true);
    let active = true;
    (async () => {
      try {
        const cached = await findExplanations('writing-error', sentence);
        if (cached.exact) { if (active) setText(cached.exact.explanation); return; }
        const generated = await requestExplanation({ sentence, selectedText: 'writing-error', portuguese, question: `O aluno escreveu: "${typed}". Explique brevemente em português por que a resposta está errada e como lembrar da forma correta.`, level: 'iniciante' });
        const saved = await saveExplanation({ conceptKey: generated.conceptKey, selectedText: 'writing-error', sentence, title: generated.title, explanation: generated.explanation, quickMeaning: generated.quickMeaning, cardFront: generated.cardFront, cardBack: generated.cardBack });
        if (active) setText(saved.explanation);
      } catch { /* A correção do cartão continua disponível mesmo sem a IA. */ }
      finally { if (active) setLoading(false); }
    })();
  };
  return <div className="w-full mt-2 rounded-xl bg-secondary/60 p-3 text-left text-sm">{!requested ? <button type="button" onClick={explain} className="w-full rounded-lg bg-card py-2 font-medium text-primary">Explicar meu erro</button> : <><span className="font-medium">Explicação</span>{loading ? <span className="ml-2 text-muted-foreground">Gerando…</span> : text ? <p className="mt-1 whitespace-pre-line text-muted-foreground">{text}</p> : <p className="mt-1 text-muted-foreground">Não foi possível gerar uma explicação agora.</p>}</>}</div>;
}

function StudyCardInner({ card, onRate, flipped, setFlipped, remainingNew, remainingLearning, remainingReview, frontAudioSrc, backAudioSrc, typed, setTyped, typingResult, setTypingResult }: StudyCardProps & { flipped: boolean; setFlipped: (v: boolean) => void; frontAudioSrc: string | null; backAudioSrc: string | null; typed: string; setTyped: (v: string) => void; typingResult: null | 'correct' | 'incorrect'; setTypingResult: (v: null | 'correct' | 'incorrect') => void }) {
  const isTyping = card.cardType === 'typing';
  const expectedText = useMemo(() => htmlToPlainText(card.back), [card.back]);
  const supportedBack = useMemo(() => {
    const situation = readSituation(card.front, card.back);
    const level = translationSupportLevel(card.reviewCount);
    if (!situation?.portuguese || level === 'visible') return card.back;
    const div = document.createElement('div'); div.innerHTML = card.back;
    const translation = div.querySelector('[data-translation-pt]');
    if (translation) {
      const details = document.createElement('details'); details.className = 'mt-4 text-base text-muted-foreground';
      const summary = document.createElement('summary'); summary.className = 'cursor-pointer text-sm';
      summary.textContent = level === 'hint' ? 'Preciso de uma pista' : 'Ver tradução';
      details.append(summary, translation); div.append(details);
    }
    return div.innerHTML;
  }, [card.front, card.back, card.reviewCount]);

  const handleCheck = () => {
    if (!typed.trim()) return;
    const ok = normalizeForCompare(typed) === normalizeForCompare(expectedText);
    setTypingResult(ok ? 'correct' : 'incorrect');
    setFlipped(true);
  };

  const handleContinue = () => {
    const rating: Rating = typingResult === 'correct' ? 'good' : 'again';
    setFlipped(false);
    setTyped('');
    setTypingResult(null);
    onRate(rating);
  };

  return (
    <div className="study-exercise study-generic-flip-card flex flex-col w-full max-w-lg mx-auto" onClick={event => { if (!isTyping && !(event.target as HTMLElement).closest('button, textarea, input, audio, a')) setFlipped(!flipped); }} role="button" tabIndex={0} aria-label={flipped ? 'Mostrar frente do cartão' : 'Mostrar verso do cartão'} >
      <div className="flex justify-center pb-3"><SkillBadge skill={isTyping ? 'writing' : 'comprehension'} /></div>
      {/* Content */}
      {!flipped && <StudyMedia html={card.front} key={`front-${card.id}`}>
        <CardContent html={card.front} audioSrc={null} />
      </StudyMedia>}

      {isTyping && !flipped && (
        <div className="w-full px-2 mt-8">
          <textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCheck();
              }
            }}
            autoFocus
            rows={3}
            placeholder="Digite a resposta..."
            className="w-full bg-card text-foreground text-lg rounded-lg p-3 border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>
      )}

      {isTyping && flipped && typingResult && (
        <div className="w-full px-2 mt-4 space-y-3">
          <div className={`flex items-center gap-2 text-sm font-medium ${typingResult === 'correct' ? 'text-green-500' : 'text-red-500'}`}>
            {typingResult === 'correct' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {typingResult === 'correct' ? 'Correto!' : 'Incorreto'}
          </div>
          {typingResult === 'incorrect' && (
            <div className="text-sm">
              <div className="text-muted-foreground text-xs mb-1">Sua resposta:</div>
              <div className="text-foreground line-through opacity-70">{typed}</div>
            </div>
          )}
        </div>
      )}

      {flipped && (
        <>
          <StudyMedia html={supportedBack} key={`back-${card.id}`}>
            <CardContent html={supportedBack} audioSrc={backAudioSrc} autoPlay={Boolean(backAudioSrc)} />
          </StudyMedia>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pt-3 bg-background/95 backdrop-blur-xl sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[480px] z-10" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        <div className="flex flex-col" style={{ height: '100px' }}>
          <div className="w-full h-px bg-muted-foreground/15" />
          <div className="flex-1 flex flex-col justify-end">
            {!flipped ? (
              <div className="flex flex-col items-center gap-3">
                {isTyping ? (
                  <>
                    <button onClick={handleCheck} disabled={!typed.trim()} className="w-full bg-primary text-primary-foreground rounded-full py-3 text-sm font-medium transition-all active:scale-95 active:opacity-70 disabled:opacity-40">Verificar</button>
                    <button onClick={() => onRate('again')} className="w-full rounded-full py-2 text-sm text-muted-foreground">Pular</button>
                  </>
                ) : null}
              </div>
            ) : isTyping ? (
              <button
                onClick={handleContinue}
                className={`w-full rounded-full py-3 text-sm font-bold text-white transition-all active:scale-95 active:opacity-70 ${typingResult === 'correct' ? 'bg-green-700' : 'bg-red-600'}`}
              >
                Continuar
              </button>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="grid grid-cols-4 gap-2 sm:gap-4 w-full">
                  {ratingConfig.map(({ rating, label }) => {
                    const colorMap: Record<string, string> = {
                      again: 'bg-red-600',
                      hard: 'bg-orange-500',
                      good: 'bg-blue-600',
                      easy: 'bg-green-700',
                    };
                    return (
                      <button
                        key={rating}
                        onClick={() => {
                          setFlipped(false);
                          onRate(rating);
                        }}
                      >
                        <span className={`w-full block py-3 rounded-full ${colorMap[rating]} text-sm font-bold text-white transition-all active:scale-95 active:opacity-70`}>
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
