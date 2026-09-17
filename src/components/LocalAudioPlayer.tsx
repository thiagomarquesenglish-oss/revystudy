import { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { resolveOfflineMediaUrl } from '@/lib/offline-media';

export default function LocalAudioPlayer({ src, centered, autoPlay = true }: { src: string; centered?: boolean; autoPlay?: boolean }) {
  // A source change gets a fresh lifecycle; pending work cannot play the previous card.
  return <Player key={src} src={src} centered={centered} autoPlay={autoPlay} />;
}

function Player({ src, centered, autoPlay }: { src: string; centered?: boolean; autoPlay: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [source, setSource] = useState<string>();
  const [preparing, setPreparing] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const watchdog = useRef<ReturnType<typeof setTimeout>>();
  const active = useRef(true);
  const generation = useRef(0);
  const clearWait = () => { clearTimeout(watchdog.current); setWaiting(false); };
  const fail = (message: string) => { clearWait(); setPlaying(false); setError(message); };

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    setPreparing(true);
    setSource(undefined);
    setError('');
    const timer = setTimeout(() => {
      cancelled = true;
      setPreparing(false);
      setError('Não foi possível preparar o áudio. Toque em tentar novamente.');
    }, 20000);
    void resolveOfflineMediaUrl(src).then(value => {
      if (cancelled) return;
      setSource(value);
      setPreparing(false);
      clearTimeout(timer);
    }).catch(reason => {
      if (cancelled) return;
      clearTimeout(timer);
      setPreparing(false);
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o áudio salvo.');
    });
    return () => {
      cancelled = true;
      active.current = false;
      generation.current++;
      clearTimeout(timer);
      clearTimeout(watchdog.current);
      audio.current?.pause();
    };
  }, [src, attempt]);

  const play = (automatic = false) => {
    const element = audio.current;
    if (!element || !source) return;
    const current = ++generation.current;
    setError('');
    setWaiting(true);
    clearTimeout(watchdog.current);
    watchdog.current = setTimeout(() => {
      generation.current++;
      element.pause();
      fail('O áudio não iniciou. Tente novamente; se persistir, baixe as mídias nos Ajustes.');
    }, 12000);
    // No await, cache access, load(), or source replacement between tap and play().
    void element.play().catch(reason => {
      if (!active.current || current !== generation.current) return;
      if (automatic && reason?.name === 'NotAllowedError') { clearWait(); return; }
      fail(reason?.name === 'NotAllowedError'
        ? 'O iPhone bloqueou a reprodução. Toque novamente em play.'
        : reason?.name === 'NotSupportedError'
          ? 'Este áudio não pôde ser decodificado. Reenvie-o em MP3 ou M4A.'
          : 'Não foi possível reproduzir este áudio. Tente novamente.');
    });
  };

  useEffect(() => {
    if (source && autoPlay) play(true);
    // Autoplay is best effort. A rejected autoplay leaves manual play available.
  }, [source, autoPlay]);

  return <div className={`flex flex-col items-center gap-2 ${centered ? 'self-center' : 'self-start mt-1'}`}>
    <button type="button" disabled={preparing || !source} onClick={() => {
      if (playing) { generation.current++; audio.current?.pause(); clearWait(); setPlaying(false); }
      else play();
    }} aria-label={preparing ? 'Preparando áudio local' : playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      className="shrink-0 w-20 h-20 rounded-full bg-primary/15 hover:bg-primary/25 flex items-center justify-center disabled:opacity-50">
      {preparing || waiting ? <Loader2 className="w-9 h-9 text-primary animate-spin" /> : playing ? <Pause className="w-9 h-9 text-primary" /> : <Play className="w-9 h-9 text-primary ml-1" />}
    </button>
    <audio ref={audio} src={source} preload="auto" playsInline
      onPlaying={() => { clearWait(); setPlaying(true); setError(''); }}
      onPause={() => { clearWait(); setPlaying(false); }}
      onEnded={() => { clearWait(); setPlaying(false); }}
      onError={() => { if (source) fail('O arquivo de áudio não pôde ser reproduzido. Tente baixá-lo novamente nos Ajustes.'); }} />
    {error && <div role="alert" className="max-w-xs text-sm text-center text-destructive"><p>{error}</p>
      <button type="button" className="underline p-2" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button>
    </div>}
  </div>;
}
