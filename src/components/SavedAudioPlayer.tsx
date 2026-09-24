import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Download, Loader2, Pause, Play } from 'lucide-react';
import { AUDIO_SAVED_EVENT, audioKey, downloadAudio, isRemoteAudio, readSavedAudio } from '@/lib/saved-audio';

export interface SavedAudioHandle { play: () => void; stop: () => void }
type Props = { src: string; centered?: boolean; compact?: boolean; autoPlay?: boolean; onEnded?: () => void; onDuration?: (duration: number) => void; restart?: boolean };
// autoPlay is intentionally not used: download and playback are separate user actions.
const SavedAudioPlayer = forwardRef<SavedAudioHandle, Props>((props, ref) => <Player key={props.src} {...props} ref={ref} />);
const Player = forwardRef<SavedAudioHandle, Props>(({ src, centered, compact, onEnded, onDuration, restart }, ref) => {
  const remote = isRemoteAudio(src);
  const [source, setSource] = useState(remote ? '' : src);
  const [checking, setChecking] = useState(remote);
  const [downloading, setDownloading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const alive = useRef(true);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const lock = useRef(false);
  const stop = () => { sequence.current++; clearTimeout(timer.current); audio.current?.pause(); setPlaying(false); setWaiting(false); };
  const fail = (message: string) => { stop(); setError(message); };
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    let localUrl = '';
    let revision = 0;
    const load = async () => {
      const current = ++revision;
      try {
        const blob = await readSavedAudio(src);
        if (cancelled || current !== revision) return;
        const next = blob ? URL.createObjectURL(blob) : '';
        if (localUrl) URL.revokeObjectURL(localUrl);
        localUrl = next;
        setSource(next);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível acessar o áudio salvo.');
      } finally { if (!cancelled) setChecking(false); }
    };
    const saved = (event: Event) => { if ((event as CustomEvent).detail === audioKey(src)) void load(); };
    if (remote) { void load(); window.addEventListener(AUDIO_SAVED_EVENT, saved); }
    const element = audio.current;
    const hide = () => { if (document.hidden) stop(); };
    const another = (event: Event) => { if ((event as CustomEvent).detail !== element) stop(); };
    window.addEventListener('revystudy:audio-play', another);
    document.addEventListener('visibilitychange', hide);
    return () => {
      cancelled = true; alive.current = false; sequence.current++;
      clearTimeout(timer.current); element?.pause();
      if (localUrl) URL.revokeObjectURL(localUrl);
      window.removeEventListener(AUDIO_SAVED_EVENT, saved);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('revystudy:audio-play', another);
    };
  }, [src, remote]);
  const play = () => {
    const element = audio.current;
    if (!source || !element) return; // Never download or fall back to the cloud on play.
    window.dispatchEvent(new CustomEvent('revystudy:audio-play', { detail: element }));
    const current = ++sequence.current;
    setError(''); setWaiting(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fail('O áudio salvo não iniciou. Toque em tentar novamente.'), 10000);
    if (restart) element.currentTime = 0;
    void element.play().catch(() => { if (alive.current && current === sequence.current) fail('Não foi possível reproduzir o áudio salvo.'); });
  };
  useImperativeHandle(ref, () => ({ play, stop }));
  const download = async () => {
    if (lock.current) return;
    lock.current = true; setDownloading(true); setError('');
    try {
      await downloadAudio(src);
      // Also refresh when another player had already saved the same file.
      if (alive.current) window.dispatchEvent(new CustomEvent(AUDIO_SAVED_EVENT, { detail: audioKey(src) }));
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error && reason.name !== 'AbortError' ? reason.message : 'O download demorou demais. Tente novamente.');
    } finally { lock.current = false; if (alive.current) setDownloading(false); }
  };
  const busy = checking || downloading;
  return <div className={`flex flex-col items-center gap-2 ${centered ? 'self-center' : 'self-start'}`}>
    <button type="button" disabled={busy} aria-label={checking ? 'Verificando áudio salvo' : downloading ? 'Baixando áudio' : !source ? 'Baixar áudio' : playing || waiting ? 'Pausar áudio' : 'Reproduzir áudio'}
      onClick={event => { event.stopPropagation(); if (!source) void download(); else if (playing || waiting) stop(); else play(); }}
      className={`shrink-0 rounded-full bg-primary/15 hover:bg-primary/25 flex items-center justify-center disabled:opacity-50 ${compact ? 'w-10 h-10' : 'w-20 h-20'}`}>
      {busy || waiting ? <Loader2 className={`${compact ? 'w-5 h-5' : 'w-9 h-9'} text-primary animate-spin`} /> : !source ? <Download className={`${compact ? 'w-5 h-5' : 'w-9 h-9'} text-primary`} /> : playing ? <Pause className={`${compact ? 'w-5 h-5' : 'w-9 h-9'} text-primary`} /> : <Play className={`${compact ? 'w-5 h-5' : 'w-9 h-9'} text-primary`} />}
    </button>
    <audio ref={audio} src={source || undefined} preload="none" playsInline
      onPlaying={() => { clearTimeout(timer.current); setWaiting(false); setPlaying(true); setError(''); }}
      onPause={() => { clearTimeout(timer.current); setWaiting(false); setPlaying(false); }}
      onEnded={() => { stop(); onEnded?.(); }}
      onLoadedMetadata={event => onDuration?.(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onError={() => { if (source) fail('Não foi possível abrir o áudio salvo.'); }} />
    {error && <div role="alert" className="max-w-xs text-xs text-center text-destructive"><p>{error}</p>
      {source && <button type="button" className="underline p-2" onClick={event => { event.stopPropagation(); audio.current?.load(); play(); }}>Tentar novamente</button>}
    </div>}
  </div>;
});
Player.displayName = 'SavedAudioPlayerInner';
SavedAudioPlayer.displayName = 'SavedAudioPlayer';
export default SavedAudioPlayer;
