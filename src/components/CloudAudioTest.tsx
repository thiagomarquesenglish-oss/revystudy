import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { localDB } from '@/lib/offline-db';
import { supabase } from '@/integrations/supabase/client';

type Sample = { url: string; label: string };

export default function CloudAudioTest() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const clearTimer = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);

  const list = async () => {
    setBusy(true);
    try {
      // Only read card metadata. Never open the downloaded-media cache.
      const cards = await localDB.getCards();
      const decks = await localDB.getDecks();
      const found = new Map<string, string>();
      for (const card of cards) {
        for (const html of [card.front, card.back]) {
          const root = document.createElement('div');
          root.innerHTML = html || '';
          const label = root.textContent?.trim().slice(0, 100) || 'Áudio do cartão';
          for (const node of root.querySelectorAll('audio[src],audio source[src],[data-audio][data-src]')) {
            const url = node.getAttribute('src') || node.getAttribute('data-src') || '';
            if (/^https:\/\//i.test(url)) found.set(url, label);
          }
        }
      }
      for (const deck of decks) {
        for (const item of await localDB.getDeckAudios(deck.id)) {
          if (item.file_path) found.set(supabase.storage.from('deck-audios').getPublicUrl(item.file_path).data.publicUrl, item.title || deck.name || 'Áudio do baralho');
        }
      }
      const next = [...found].map(([url, label]) => ({ url, label }));
      setSamples(next);
      setSelected(next[0]?.url || '');
      setStatus(next.length ? 'Escolha o áudio que está falhando e prepare o teste.' : 'Nenhum áudio com endereço na nuvem encontrado na biblioteca deste aparelho.');
    } catch {
      setStatus('Não foi possível listar os áudios. Tente novamente.');
    } finally { setBusy(false); }
  };

  const prepare = () => {
    clearTimer();
    if (!navigator.onLine) { setStatus('Este teste exige internet.'); return; }
    // This existing NetworkOnly marker also bypasses the previously deployed SW.
    // A unique URL avoids the normal HTTP cache without downloading a blob first.
    const url = new URL(selected);
    url.searchParams.set('revystudy_download', crypto.randomUUID());
    setSource(url.href);
    setStatus('Toque no play abaixo. Este teste usa somente a nuvem.');
  };

  return <section className="bg-card rounded-2xl p-5 space-y-4">
    <h2 className="font-semibold">Teste de áudio direto da nuvem</h2>
    <p className="text-sm text-muted-foreground">Teste separado, com internet. Não usa nem remove os arquivos baixados e não altera os cartões.</p>
    <Button variant="secondary" disabled={busy} onClick={() => void list()}>{busy ? 'Listando…' : 'Escolher áudio para testar'}</Button>
    {samples.length > 0 && <>
      <select aria-label="Áudio para testar" className="w-full bg-background rounded-lg p-3" value={selected} onChange={event => { audio.current?.pause(); clearTimer(); setSource(''); setSelected(event.target.value); setStatus('Prepare o áudio selecionado.'); }}>
        {samples.map((sample, index) => <option key={sample.url} value={sample.url}>{index + 1}. {sample.label}</option>)}
      </select>
      <Button onClick={prepare}>Preparar teste da nuvem</Button>
    </>}
    {source && <audio key={source} ref={audio} controls playsInline preload="none" src={source} className="w-full"
      onPlay={() => { clearTimer(); setStatus('Conectando à nuvem…'); timer.current = setTimeout(() => setStatus('O áudio não começou em 10 segundos, mesmo no teste direto da nuvem.'), 10000); }}
      onPlaying={() => { clearTimer(); setStatus('Reproduzindo diretamente da nuvem.'); }}
      onWaiting={() => setStatus('Aguardando dados da nuvem…')}
      onPause={() => { clearTimer(); setStatus('Pausado.'); }}
      onEnded={() => { clearTimer(); setStatus('Reprodução concluída.'); }}
      onError={() => { clearTimer(); setStatus(`Falha no teste direto da nuvem (código ${audio.current?.error?.code ?? 'desconhecido'}).`); }}
    />}
    <p role="status" className="text-sm text-muted-foreground">{status}</p>
  </section>;
}
