import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDecks, getCardsByDeck } from '@/lib/storage';
import { Deck, Flashcard } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { Play, Pause, Sparkles, Volume2, Image as ImageIcon, Type, Shuffle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

type Mode = 'audio' | 'image' | 'text';

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
    if (el) el.play().then(() => setPlaying(true)).catch(() => {});
  }, [src]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (playing) {
      el.pause();
      el.currentTime = 0;
    } else {
      el.play().catch(() => {});
      setPlaying(true);
    }
  };

  const size = big ? 'w-20 h-20' : 'w-9 h-9';
  const icon = big ? 'w-8 h-8' : 'w-4 h-4';

  return (
    <>
      <button
        onClick={toggle}
        className={`${size} shrink-0 self-center rounded-full bg-primary/15 hover:bg-primary/25 flex items-center justify-center transition-all active:scale-95`}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        {playing ? <Pause className={`${icon} text-primary`} /> : <Play className={`${icon} text-primary ml-0.5`} />}
      </button>
      <audio ref={ref} src={src} preload="auto" />
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
  const [mode, setMode] = useState<Mode>('text');
  const [revealed, setRevealed] = useState(false);
  const [seen, setSeen] = useState(0);
  const [resolvedDeckAudio, setResolvedDeckAudio] = useState<ResolvedDeckAudio>({ cardId: null, url: null });
  const lastModeRef = useRef<Mode | null>(null);

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
      const { data } = await supabase
        .from('deck_audios')
        .select('file_path')
        .eq('id', currentAudioId)
        .single();
      if (cancelled) return;
      if (data) {
        const { data: urlData } = supabase.storage.from('deck-audios').getPublicUrl(data.file_path);
        setResolvedDeckAudio({ cardId: currentId, url: urlData.publicUrl });
      } else {
        setResolvedDeckAudio({ cardId: currentId, url: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentId, currentAudioId]);

  const front = useMemo(() => (current ? splitHtml(current.front) : null), [current]);
  const back = useMemo(() => (current ? splitHtml(current.back) : null), [current]);

  const deckAudioUrl = resolvedDeckAudio.cardId === currentId ? resolvedDeckAudio.url : null;
  const deckAudioPending = Boolean(currentAudioId && resolvedDeckAudio.cardId !== currentId);
  const audioSrc = front?.audioSrc || back?.audioSrc || deckAudioUrl;

  const enabledModes = useMemo(() => {
    const m: Mode[] = [];
    if (useAudio) m.push('audio');
    if (useImage) m.push('image');
    if (useText) m.push('text');
    return m.length ? m : (['text'] as Mode[]);
  }, [useAudio, useImage, useText]);

  /** Modes actually available for the current card */
  const availableModes = useMemo(() => {
    if (!front || !back) return [] as Mode[];
    const list: Mode[] = [];
    if (enabledModes.includes('audio') && audioSrc) list.push('audio');
    if (enabledModes.includes('image') && (front.imagesHtml || back.imagesHtml)) list.push('image');
    if (enabledModes.includes('text') && (hasText(front.textHtml) || hasText(back.textHtml))) list.push('text');
    return list;
  }, [front, back, audioSrc, enabledModes]);

  // Pick a random available mode whenever the card changes. When possible,
  // avoid repeating the same format twice in a row so the practice feels mixed.
  useEffect(() => {
    if (!started || !currentId || deckAudioPending || availableModes.length === 0) return;
    const alternatives = availableModes.filter((candidate) => candidate !== lastModeRef.current);
    const pool = alternatives.length > 0 ? alternatives : availableModes;
    const nextMode = pool[Math.floor(Math.random() * pool.length)];
    lastModeRef.current = nextMode;
    setMode(nextMode);
    setRevealed(false);
  }, [started, currentId, deckAudioPending, availableModes]);

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
        <PageHeader title="Estudo personalizado" onBack={() => navigate(`/deck/${deckId}`)} />
        <main className="max-w-3xl mx-auto px-3 space-y-6 pb-28" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold">Prática livre e misturada</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Sem limite de cartões e sem afetar suas revisões. A cada cartão o app escolhe um formato
              diferente — só o áudio, só a imagem ou só o texto — pra fixar de várias formas.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Formatos na mistura</h3>
            {([
              { key: 'audio', label: 'Só áudio', icon: Volume2, value: useAudio, set: setUseAudio },
              { key: 'image', label: 'Só imagem', icon: ImageIcon, value: useImage, set: setUseImage },
              { key: 'text', label: 'Só texto', icon: Type, value: useText, set: setUseText },
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

          <p className="text-xs text-muted-foreground">{cards.length} cartões disponíveis neste baralho.</p>
        </main>

        <div className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="max-w-3xl mx-auto px-3 py-3">
            <Button
              className="w-full gap-2 text-white hover:text-white font-bold"
              style={{ backgroundColor: '#2652cf' }}
              disabled={cards.length === 0}
              onClick={() => {
                setOrder(shuffle(cards));
                setIndex(0);
                setSeen(0);
                lastModeRef.current = null;
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

  const modeLabel = mode === 'audio' ? 'Só áudio' : mode === 'image' ? 'Só imagem' : 'Só texto';
  const ModeIcon = mode === 'audio' ? Volume2 : mode === 'image' ? ImageIcon : Type;

  const promptImages = front.imagesHtml || back.imagesHtml;
  const promptText = hasText(front.textHtml) ? front.textHtml : back.textHtml;

  return (
    <div className="min-h-screen bg-background safe-page overflow-hidden">
      <PageHeader
        title={deck.name}
        onBack={() => setStarted(false)}
        rightContent={<span className="text-xs text-muted-foreground">{seen} praticados</span>}
      />
      <main className="max-w-3xl mx-auto px-3 pb-40" style={{ paddingTop: 'calc(var(--app-header-height, 48px) + 1rem)' }}>
        <div className="flex flex-col items-center w-full max-w-lg mx-auto">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-card border border-border rounded-full px-3 py-1">
            <ModeIcon className="w-3 h-3" />
            {modeLabel}
          </div>

          {/* Prompt */}
          <div className="w-full pt-10 flex flex-col items-center gap-4">
            {mode === 'audio' && audioSrc && <AudioButton src={audioSrc} big key={`a-${current.id}`} />}
            {mode === 'image' && promptImages && (
              <div
                className="rich-text-render max-w-full flex justify-center"
                dangerouslySetInnerHTML={{ __html: promptImages }}
              />
            )}
            {mode === 'text' && (
              <div
                className="rich-text-render text-2xl text-white text-center leading-relaxed break-words max-w-full"
                dangerouslySetInnerHTML={{ __html: promptText }}
              />
            )}
          </div>

          {/* Reveal */}
          {revealed && (
            <div className="w-full mt-8 space-y-4">
              <div className="w-full h-px bg-muted-foreground/20" />
              <div className="flex flex-col items-center gap-3">
                {audioSrc && mode !== 'audio' && <AudioButton src={audioSrc} key={`r-${current.id}`} />}
                <div
                  className="rich-text-render text-2xl text-white text-center leading-relaxed break-words max-w-full"
                  dangerouslySetInnerHTML={{ __html: front.imagesHtml + front.textHtml }}
                />
                <div className="w-full h-px bg-muted-foreground/10" />
                <div
                  className="rich-text-render text-2xl text-white text-center leading-relaxed break-words max-w-full"
                  dangerouslySetInnerHTML={{ __html: back.imagesHtml + back.textHtml }}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-lg mx-auto px-3 py-3 flex gap-2">
          {!revealed ? (
            <Button
              className="flex-1 bg-card hover:bg-card/80 text-foreground rounded-full py-6"
              onClick={() => setRevealed(true)}
            >
              Mostrar cartão
            </Button>
          ) : (
            <Button
              className="flex-1 text-white hover:text-white font-bold rounded-full py-6"
              style={{ backgroundColor: '#2652cf' }}
              onClick={next}
            >
              Próximo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
