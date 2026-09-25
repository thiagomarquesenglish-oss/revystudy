import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Download, Loader2, Pause, Play } from 'lucide-react';
import { AUDIO_SAVED_EVENT, audioKey, downloadAudio, isRemoteAudio, readSavedAudio } from '@/lib/saved-audio';
import { audioDiagnosticId, audioSnapshot, recordAudio } from '@/lib/audio-diagnostics';
import AudioDiagnosticCopy from '@/components/AudioDiagnosticCopy';

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
  const retry = useRef<ReturnType<typeof setTimeout>>();
  const lock = useRef(false);
  const [diagnosticId] = useState(audioDiagnosticId);
  const trace = (event: string, data: Record<string, unknown> = {}) => recordAudio(event, diagnosticId, { ...audioSnapshot(audio.current), attempt: sequence.current, ...data });
  const stop = () => { sequence.current++; clearTimeout(timer.current); clearTimeout(retry.current); audio.current?.pause(); setPlaying(false); setWaiting(false); };
  const fail = (message: string) => { trace('failure', { message }); stop(); setError(message); };
  useEffect(() => {
    trace('mount');
    alive.current = true;
    let cancelled = false;
    let localUrl = '';
    let revision = 0;
    const load = async () => {
      const current = ++revision;
      try {
        trace('saved-read-start');
        const blob = await readSavedAudio(src);
        trace('saved-read-result', { found: !!blob, bytes: blob?.size, mime: blob?.type, discarded: cancelled || current !== revision });
        if (cancelled || current !== revision) return;
        const next = blob ? URL.createObjectURL(blob) : '';
        if (localUrl) URL.revokeObjectURL(localUrl);
        localUrl = next;
        trace('source-replaced');
        setSource(next);
      } catch (reason) {
        trace('saved-read-error', { name: reason instanceof Error ? reason.name : 'unknown' });
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível acessar o áudio salvo.');
      } finally { if (!cancelled) setChecking(false); }
    };
    const saved = (event: Event) => { if ((event as CustomEvent).detail === audioKey(src)) void load(); };
    if (remote) { void load(); window.addEventListener(AUDIO_SAVED_EVENT, saved); }
    const element = audio.current;
    const events = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'play', 'playing', 'waiting', 'stalled', 'suspend', 'pause', 'ended', 'error', 'emptied', 'abort'];
    const observe = (event: Event) => trace(`media:${event.type}`);
    events.forEach(name => element?.addEventListener(name, observe));
    const hide = () => { trace('visibility'); if (document.hidden) stop(); };
    const another = (event: Event) => { if ((event as CustomEvent).detail !== element) { trace('stopped-by-other-player'); stop(); } };
    window.addEventListener('revystudy:audio-play', another);
    document.addEventListener('visibilitychange', hide);
    return () => {
      trace('unmount');
      events.forEach(name => element?.removeEventListener(name, observe));
      cancelled = true; alive.current = false; sequence.current++;
      clearTimeout(timer.current); clearTimeout(retry.current); element?.pause();
      if (localUrl) URL.revokeObjectURL(localUrl);
      window.removeEventListener(AUDIO_SAVED_EVENT, saved);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('revystudy:audio-play', another);
    };
  }, [src, remote]);
  const play = () => {
    trace('play-request');
    const element = audio.current;
    if (!source || !element) return; // Never download or fall back to the cloud on play.
    window.dispatchEvent(new CustomEvent('revystudy:audio-play', { detail: element }));
    const current = ++sequence.current;
    setError(''); setWaiting(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fail('O áudio salvo não iniciou. Toque em tentar novamente.'), 10000);
    // iOS sometimes leaves a freshly attached file stuck; reloading it (what "Tentar novamente" did) unsticks it automatically.
    clearTimeout(retry.current);
    if (element.readyState === 0) { trace('load-before-play'); element.load(); }
    retry.current = setTimeout(() => {
      if (!alive.current || current !== sequence.current) return;
      // A pending play can have paused=false without having loaded any audio.
      if (!element.paused && element.readyState >= 3) return;
      // load() aborts the old play promise. Invalidate it before restarting so
      // its AbortError cannot stop the new attempt.
      const recovery = ++sequence.current;
      trace('automatic-retry');
      element.load();
      void element.play().catch(reason => {
        trace('retry-rejected', { name: reason?.name });
        if (alive.current && recovery === sequence.current) fail('Não foi possível reproduzir o áudio salvo.');
      });
    }, 3000);
    if (restart) element.currentTime = 0;
    void element.play().then(() => trace('play-resolved'), reason => { trace('play-rejected', { name: reason?.name, originalAttempt: current }); if (alive.current && current === sequence.current) fail('Não foi possível reproduzir o áudio salvo.'); });
  };
  useImperativeHandle(ref, () => ({ play, stop }));
  const download = async () => {
    trace('download-request');
    if (lock.current) return;
    lock.current = true; setDownloading(true); setError('');
    try {
      await downloadAudio(src);
      trace('download-complete');
      // Also refresh when another player had already saved the same file.
      if (alive.current) window.dispatchEvent(new CustomEvent(AUDIO_SAVED_EVENT, { detail: audioKey(src) }));
    } catch (reason) {
      trace('download-error', { name: reason instanceof Error ? reason.name : 'unknown' });
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
    <audio ref={audio} src={source || undefined} preload="auto" playsInline
      onPlaying={() => { clearTimeout(timer.current); clearTimeout(retry.current); setWaiting(false); setPlaying(true); setError(''); }}
      onPause={() => { clearTimeout(timer.current); setWaiting(false); setPlaying(false); }}
      onEnded={() => { stop(); onEnded?.(); }}
      onLoadedMetadata={event => onDuration?.(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onError={() => { if (source) fail('Não foi possível abrir o áudio salvo.'); }} />
    {error && <div role="alert" className="max-w-xs text-xs text-center text-destructive"><p>{error}</p>
      {source && <button type="button" className="underline p-2" onClick={event => { event.stopPropagation(); trace('manual-retry'); audio.current?.load(); play(); }}>Tentar novamente</button>}
      <AudioDiagnosticCopy />
    </div>}
  </div>;
});
Player.displayName = 'SavedAudioPlayerInner';
SavedAudioPlayer.displayName = 'SavedAudioPlayer';
export default SavedAudioPlayer;
