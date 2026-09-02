import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Flashcard, Rating } from '@/lib/types';
import { getNextReviewLabel } from '@/lib/srs';
import { supabase } from '@/integrations/supabase/client';
import { getDeckAudios } from '@/lib/storage';
import StudyMedia from './StudyMedia';
import { Play, Pause, Check, X } from 'lucide-react';

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
  onRate: (rating: Rating) => void;
  remainingNew: number;
  remainingLearning: number;
  remainingReview: number;
}

const ratingConfig: { rating: Rating; label: string; sublabel: string }[] = [
  { rating: 'again', label: 'Errei', sublabel: '' },
  { rating: 'hard', label: 'Difícil', sublabel: '' },
  { rating: 'good', label: 'Bom', sublabel: '' },
  { rating: 'easy', label: 'Fácil', sublabel: '' },
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

function AudioPlayButton({ src, centered, autoPlay = true }: { src: string; centered?: boolean; autoPlay?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const handleEnded = () => setPlaying(false);
    const handlePause = () => setPlaying(false);
    el.addEventListener('ended', handleEnded);
    el.addEventListener('pause', handlePause);
    return () => {
      el.removeEventListener('ended', handleEnded);
      el.removeEventListener('pause', handlePause);
    };
  }, []);

  // Auto-play on mount
  useEffect(() => {
    const el = audioRef.current;
    if (el && autoPlay) {
      el.play().catch(() => {});
    }
    return () => { el?.pause(); };
  }, [src, autoPlay]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      el.currentTime = 0;
    } else {
      el.play().catch(() => {});
    }
  }, [playing]);

  return (
    <>
      <button
        onClick={toggle}
        className={`shrink-0 w-20 h-20 rounded-full bg-primary/15 hover:bg-primary/25 flex items-center justify-center transition-colors active:scale-95 ${centered ? 'self-center' : 'self-start mt-1'}`}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        {playing
          ? <Pause className="w-9 h-9 text-primary" />
          : <Play className="w-9 h-9 text-primary ml-1" />
        }
      </button>
      <audio ref={audioRef} src={src} preload="auto" onPlaying={() => setPlaying(true)} onError={() => setPlaying(false)} />
    </>
  );
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

export default function StudyCard({ card, onRate, remainingNew, remainingLearning, remainingReview }: StudyCardProps) {
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
  const frontAudioSrc = frontEmbeddedAudio || (!backEmbeddedAudio && deckAudioUrl ? deckAudioUrl : null);
  const backAudioSrc = backEmbeddedAudio || (backEmbeddedAudio === null && frontEmbeddedAudio === null && deckAudioUrl && !frontAudioSrc ? deckAudioUrl : null);

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

function StudyCardInner({ card, onRate, flipped, setFlipped, remainingNew, remainingLearning, remainingReview, frontAudioSrc, backAudioSrc, typed, setTyped, typingResult, setTypingResult }: StudyCardProps & { flipped: boolean; setFlipped: (v: boolean) => void; frontAudioSrc: string | null; backAudioSrc: string | null; typed: string; setTyped: (v: string) => void; typingResult: null | 'correct' | 'incorrect'; setTypingResult: (v: null | 'correct' | 'incorrect') => void }) {
  const ratings = ratingConfig.map(r => ({
    ...r,
    sublabel: getNextReviewLabel(r.rating, card),
  }));
  const isTyping = card.cardType === 'typing';
  const expectedText = useMemo(() => htmlToPlainText(card.back), [card.back]);

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
    <div className="flex flex-col w-full max-w-lg mx-auto overflow-hidden" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Content */}
      {!flipped && <StudyMedia html={card.front} key={`front-${card.id}`}>
        <CardContent html={card.front} audioSrc={frontAudioSrc} />
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
          <StudyMedia html={card.front + card.back} key={`back-${card.id}`}>
            <CardContent html={card.front + card.back} audioSrc={backAudioSrc || frontAudioSrc} autoPlay={Boolean(backAudioSrc)} />
            {frontAudioSrc && backAudioSrc && frontAudioSrc !== backAudioSrc && <AudioPlayButton src={frontAudioSrc} centered autoPlay={false} />}
          </StudyMedia>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[480px] z-10" style={{ marginBottom: 'calc(env(safe-area-inset-bottom) * 0.25 + 16px)' }}>
        <div className="flex flex-col" style={{ height: '100px' }}>
          <div className="w-full h-px bg-muted-foreground/15" />
          <div className="flex-1 flex flex-col justify-end">
            {!flipped ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-1.5 text-sm">
                  <span style={{ color: '#67b9fd' }}>{remainingNew}</span>
                  <span className="text-foreground">+</span>
                  <span style={{ color: '#f87171' }}>{remainingLearning}</span>
                  <span className="text-foreground">+</span>
                  <span style={{ color: '#27c55e' }}>{remainingReview}</span>
                </div>
                {isTyping ? (
                  <button
                    onClick={handleCheck}
                    disabled={!typed.trim()}
                    className="w-full bg-primary text-primary-foreground rounded-full py-3 text-sm font-medium transition-all active:scale-95 active:opacity-70 disabled:opacity-40"
                  >
                    Verificar
                  </button>
                ) : (
                  <button
                    onClick={() => setFlipped(true)}
                    className="w-full bg-card/90 backdrop-blur-sm rounded-full py-3 text-sm font-medium text-foreground transition-all active:scale-95 active:opacity-70 hover:bg-card"
                  >
                    Mostrar Resposta
                  </button>
                )}
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
                  {ratings.map(({ sublabel }, i) => (
                    <span key={i} className="text-sm text-foreground text-center">{sublabel}</span>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2 sm:gap-4 w-full">
                  {ratings.map(({ rating, label }) => {
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
