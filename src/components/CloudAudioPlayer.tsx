import { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { cloudMediaUrl } from '@/lib/cloud-media';

export default function CloudAudioPlayer(props: { src: string; centered?: boolean; autoPlay?: boolean }) {
  return <Player key={props.src} {...props} />;
}

function Player({ src, centered, autoPlay = true }: { src: string; centered?: boolean; autoPlay?: boolean }) {
  const [source] = useState(() => cloudMediaUrl(src));
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const generation = useRef(0);
  const clearWait = () => { clearTimeout(timer.current); setWaiting(false); };
  const fail = (message: string) => {
    generation.current++;
    audio.current?.pause();
    clearWait();
    setPlaying(false);
    setError(message);
  };
  const watch = () => {
    clearTimeout(timer.current);
    setWaiting(true);
    timer.current = setTimeout(() => fail('A nuvem não respondeu a tempo. Verifique sua conexão e tente novamente.'), 10000);
  };
  const play = (automatic = false) => {
    const element = audio.current;
    if (!element) return;
    if (!navigator.onLine && /^https?:/.test(src)) {
      setError('Conecte-se à internet para ouvir este áudio.');
      return;
    }
    setError('');
    const current = ++generation.current;
    watch();
    // Native playback directly in the tap: no fetch/blob/AudioContext preparation.
    void element.play().catch(reason => {
      if (current !== generation.current) return;
      if (automatic && reason?.name === 'NotAllowedError') { clearWait(); return; }
      fail(reason?.name === 'NotAllowedError' ? 'Toque novamente para iniciar o áudio.' : 'Não foi possível reproduzir o áudio da nuvem. Tente novamente.');
    });
  };
  useEffect(() => {
    const element = audio.current;
    if (autoPlay) play(true);
    const stop = () => { if (document.hidden) { generation.current++; element?.pause(); clearWait(); setPlaying(false); } };
    document.addEventListener('visibilitychange', stop);
    return () => {
      generation.current++;
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', stop);
      element?.pause();
    };
    // A mounted player represents one visible side of one card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay]);

  return <div className={`flex flex-col items-center gap-2 ${centered ? 'self-center' : 'self-start mt-1'}`}>
    <button type="button" aria-label={playing || waiting ? 'Pausar áudio' : 'Reproduzir áudio'}
      onClick={event => {
        event.stopPropagation();
        if (playing || waiting) { generation.current++; audio.current?.pause(); clearWait(); setPlaying(false); }
        else play();
      }} className="shrink-0 w-20 h-20 rounded-full bg-primary/15 hover:bg-primary/25 flex items-center justify-center">
      {waiting ? <Loader2 className="w-9 h-9 text-primary animate-spin" /> : playing ? <Pause className="w-9 h-9 text-primary" /> : <Play className="w-9 h-9 text-primary ml-1" />}
    </button>
    <audio ref={audio} src={source} preload="none" playsInline
      onPlaying={() => { clearWait(); setPlaying(true); setError(''); }}
      onWaiting={watch}
      onPause={() => { clearWait(); setPlaying(false); }}
      onEnded={() => { clearWait(); setPlaying(false); }}
      onError={() => fail(`Áudio indisponível na nuvem (código ${audio.current?.error?.code || 0}).`)} />
    {error && <div role="alert" className="max-w-xs text-sm text-center text-destructive"><p>{error}</p>
      <button type="button" className="underline p-2" onClick={event => {
        event.stopPropagation();
        const element = audio.current;
        if (!element) return;
        element.src = cloudMediaUrl(src);
        element.load();
        play();
      }}>Tentar novamente</button>
    </div>}
  </div>;
}
