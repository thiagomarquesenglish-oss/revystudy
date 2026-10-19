import { useEffect, useRef, useState } from 'react';
import { getCards } from '@/lib/storage';
import { audioSnapshot, recordAudio } from '@/lib/audio-diagnostics';
import { checkLocalAudioWorker, clearAudioSamples, installAudioSample, loadAudioSamples, selectAudioSamples, type InstalledAudioSample } from '@/lib/local-audio-proof';
import { Button } from './ui/button';
import AudioDiagnosticCopy from './AudioDiagnosticCopy';

/** Deliberately separate from study playback until verified on the real iPhone. */
export default function LocalAudioProof({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<InstalledAudioSample[]>(() => loadAudioSamples(userId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const running = useRef(false);
  const controller = useRef<AbortController>();
  const alive = useRef(true);
  const players = useRef(new Map<string, HTMLAudioElement>());
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); players.current.forEach(player => player.pause()); };
  }, []);

  const prepare = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    const download = new AbortController(); controller.current = download;
    const timeout = setTimeout(() => download.abort(), 90000);
    try {
      await checkLocalAudioWorker();
      const samples = selectAudioSamples(await getCards());
      if (!samples.length) throw new Error('Abra um baralho com áudios MP3 primeiro e volte aqui.');
      let done = 0;
      for (const sample of samples) {
        if (download.signal.aborted) throw new Error('Download interrompido. Os arquivos já conferidos continuam salvos.');
        if (alive.current) setMessage(`Baixando e conferindo ${++done} de ${samples.length}…`);
        const entry = await installAudioSample(userId, sample, download.signal);
        recordAudio('local-proof-installed', 'local-proof', { hash: entry.hash, bytes: entry.bytes });
        if (alive.current) setEntries(loadAudioSamples(userId));
      }
      const persistent = await navigator.storage?.persist?.().catch(() => false);
      if (alive.current) setMessage(`Amostra instalada. Ative o modo avião e teste os controles abaixo. ${persistent ? 'Armazenamento persistente concedido.' : 'Mantenha uma cópia no PC; a proteção de armazenamento não foi confirmada.'}`);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'Não foi possível preparar o teste.';
      recordAudio('local-proof-install-failed', 'local-proof', { message: detail });
      if (alive.current) { setError(detail); setMessage(''); }
    } finally { clearTimeout(timeout); running.current = false; if (alive.current) setBusy(false); }
  };

  return <section className="bg-card rounded-2xl p-5 space-y-4">
    <div><h2 className="font-semibold">Teste de áudio sem internet</h2><p className="text-sm text-muted-foreground mt-1">Primeira etapa da nova biblioteca local. Instala até 5 MP3 dos seus cartões, antigos e recentes. Não altera seus cartões nem o player de estudo.</p></div>
    <Button variant="secondary" disabled={busy} onClick={() => void prepare()}>{busy ? 'Preparando amostra…' : entries.length ? 'Conferir amostra e completar' : 'Preparar até 5 áudios para teste'}</Button>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {entries.length > 0 && <>
      <p className="text-sm">{entries.length} arquivos instalados e conferidos. Ative o modo avião, feche e reabra o app e volte a este teste em Configurações. Estes controles usam somente os arquivos locais.</p>
      <ol className="space-y-4">{entries.map((entry, index) => <li key={entry.source} className="space-y-2 min-w-0">
        <p className="text-sm break-words">{index + 1}. {entry.label}</p>
        <audio controls playsInline crossOrigin="anonymous" preload="none" src={entry.localUrl} className="w-full max-w-full"
          aria-label={`Teste local ${index + 1}: ${entry.label}`}
          ref={element => { if (element) players.current.set(entry.source, element); else players.current.delete(entry.source); }}
          onPlay={event => { players.current.forEach(other => { if (other !== event.currentTarget) other.pause(); }); recordAudio('local-proof-play', `sample-${index + 1}`, audioSnapshot(event.currentTarget)); }}
          onLoadedMetadata={event => recordAudio('local-proof-metadata', `sample-${index + 1}`, audioSnapshot(event.currentTarget))}
          onTimeUpdate={event => {
            if (event.currentTarget.currentTime > 0.1 && !moved.has(entry.hash)) {
              recordAudio('local-proof-time-advanced', `sample-${index + 1}`, { ...audioSnapshot(event.currentTarget), hash: entry.hash });
              setMoved(previous => new Set([...previous, entry.hash]));
            }
          }}
          onError={event => { recordAudio('local-proof-error', `sample-${index + 1}`, audioSnapshot(event.currentTarget)); setError('Um áudio local não iniciou. Copie o diagnóstico abaixo; não é necessário baixar a biblioteca inteira.'); }} />
        <p className="text-xs text-muted-foreground">{Math.ceil(entry.bytes / 1024)} KB · {moved.has(entry.hash) ? 'Reprodução avançou neste teste' : 'Arquivo conferido; aguardando teste de reprodução'}</p>
      </li>)}</ol>
      <Button variant="ghost" disabled={busy} onClick={async () => {
        players.current.forEach(player => player.pause());
        try { await clearAudioSamples(userId); setEntries([]); setMoved(new Set()); setMessage('Somente os áudios desta amostra foram removidos.'); setError(''); }
        catch { setError('Não foi possível remover a amostra.'); }
      }}>Apagar somente esta amostra</Button>
    </>}
    <AudioDiagnosticCopy />
  </section>;
}
